// Services/orchestrator.js - Máquina de estados del asistente WhatsApp de ReservaYa
const Utils = require('../utils');
const config = require('../config');
const dbService = require('./dbService');
const reservaYaApi = require('./reservaYaApi');
const roleService = require('./roleService');
const groqService = require('./groqService');
const whatsappService = require('./whatsappService');
const menu = require('./menuService');
const { welcomeByRole } = require('./welcomeService');

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Ciudades colombianas conocidas (además de las que existan en el directorio).
const KNOWN_CITIES = [
  'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Pereira', 'Bucaramanga',
  'Manizales', 'Cúcuta', 'Santa Marta', 'Villavicencio', 'Pasto', 'Ibagué', 'Armenia',
  'Popayán', 'Neiva', 'Sincelejo', 'Valledupar', 'Tunja', 'Montería', 'Soledad',
];

class Orchestrator {
  async handleIncoming({ from, messageBody, userName, messageId, messageType }) {
    const phoneDigits = Utils.phoneDigits(from);
    if (!phoneDigits) return;
    if (config.blockedUsers.includes(phoneDigits)) return;

    try {
      await dbService.connect();
    } catch (err) {
      Utils.log('error', `BD no disponible: ${err.message}`);
      await whatsappService.sendMessage(from, 'Ups, tuvimos un problema interno. Intenta de nuevo en unos minutos. 🙏').catch(() => {});
      return;
    }

    if (await dbService.markMessageProcessed(messageId)) return;

    const cleanText = String(messageBody ?? '').trim();

    let conv = await dbService.getConversation(phoneDigits);
    if (!conv) {
      await dbService.upsertConversation(phoneDigits, {
        phone: phoneDigits,
        waId: from,
        name: userName,
        city: config.defaultCity,
        role: null,
        welcomed: false,
        context: null,
        createdAt: new Date().toISOString(),
      });
      conv = await dbService.getConversation(phoneDigits);
    }

    if (userName && userName !== 'Usuario' && conv.name !== userName) {
      await dbService.upsertConversation(phoneDigits, { name: userName });
      conv.name = userName;
    }

    if (!conv.role) {
      const identity = await roleService.resolve(phoneDigits);
      const role = identity?.role || 'guest';
      // Si el perfil del usuario (registro web) trae su ciudad y el usuario aún
      // no la ha elegido en el chat, la aplicamos como ciudad base.
      if (identity?.city && norm(conv.city) === norm(config.defaultCity)) {
        await dbService.upsertConversation(phoneDigits, { city: identity.city });
        conv.city = identity.city;
      }
      await dbService.upsertConversation(phoneDigits, { role });
      conv.role = role;
      conv.identity = identity;
    }

    if (!conv.welcomed) {
      await this.#sendWelcome(conv);
      await dbService.upsertConversation(phoneDigits, { welcomed: true });
      conv.welcomed = true;
      // Si el primer mensaje ya trae una petición de servicio, la resolvemos
      // de una vez (sin obligar a repetirla tras la bienvenida).
      if (this.#looksLikeServiceRequest(cleanText)) {
        return this.#route(conv, cleanText, messageId, messageType);
      }
      return;
    }

    await this.#route(conv, cleanText, messageId, messageType);
  }

  // ---------- Bienvenida ----------
  async #sendWelcome(conv) {
    const identity = conv.role && !conv.identity ? await roleService.resolve(conv.phone) : conv.identity;
    const { message } = welcomeByRole(identity, conv.name);
    await whatsappService.sendMessage(conv.waId, message);
    await whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
  }

  // ---------- Enrutamiento ----------
  async #route(conv, text, messageId, messageType) {
    if (!text) return;
    const clean = text.trim();
    if (/^(menu|menú|home|inicio|0|cancelar|cancel)$/i.test(clean)) {
      await dbService.clearContext(conv.phone);
      await whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
      return;
    }

    const ctx = conv.context && typeof conv.context === 'object' ? conv.context : {};

    // ¿El mensaje pide cambiar de ciudad (o es una ciudad)? → cambiamos y retomamos la búsqueda.
    // Si además trae una intención de búsqueda en lenguaje natural (servicio + ciudad),
    // se deja fluir al motor de intención para BUSCAR directamente, sin repetir el menú
    // de categorías ni el "ciudad confirmada".
    const cityMatch = this.#cityFromText(clean);
    const serviceRequest = this.#looksLikeServiceRequest(clean);
    if (cityMatch && (ctx.flow || !serviceRequest)) {
      if (cityMatch === 'otra') {
        await this.#startCity(conv, {});
        return;
      }
      const changed = norm(cityMatch) !== norm(conv.city);
      await this.#changeCity(conv, cityMatch);
      const pending = ctx.flow === 'city' ? ctx.pending : null;
      const need = {
        category: ctx.category,
        business: ctx.businessHint,
        maxPrice: ctx.maxPrice,
        currency: ctx.currency,
        priceBias: ctx.priceBias,
      };
      const ctxClean = { flow: null, city: conv.city };
      if (pending) ctxClean.pending = pending;
      await dbService.upsertConversation(conv.phone, { context: ctxClean });
      if (pending === 'explore') return this.#startExplore(conv, {});
      if (pending === 'book') return this.#startExplore(conv, {}, true);
      if (need.category || need.business || need.maxPrice || need.priceBias) {
        return this.#startExplore(conv, need);
      }
      if (!changed) {
        await whatsappService.sendMessage(conv.waId, `Listo, buscamos en *${conv.city}*. ✅`);
      }
      return this.#startExplore(conv, {});
    }

    if (ctx.flow) {
      await this.#flowStep(conv, ctx, clean, messageId);
    } else {
      await this.#topLevel(conv, clean, messageId, messageType);
    }
  }

  async #topLevel(conv, text, messageId, messageType) {
    const lower = text.toLowerCase();

    if (messageType === 'location') {
      await this.#startCity(conv, {});
      return;
    }

    if (/^(explorar|explorar negocios|negocios|buscar)$/.test(lower) || text === '1') {
      await this.#startExplore(conv, {});
      return;
    }
    if (/(cambiar.*ciudad|ciudad|ubicaci|donde.*(estan|queda)|location)/.test(lower) || text === '2') {
      await this.#startCity(conv, {});
      return;
    }
    if (/(mis reservas|mis citas|mis agendamientos|reservas|historial)/.test(lower) || text === '3') {
      await this.#misReservas(conv);
      return;
    }
    if (/^(ayuda|help|que haces|como func)/.test(lower) || text === '4') {
      await whatsappService.sendMessage(conv.waId, menu.buildHelp());
      return;
    }

    // Petición en lenguaje natural con categoría reconocida (aunque tenga un
    // error de tipeo): se resuelve DIRECTAMENTE contra el directorio, sin pasar
    // por Groq (evita demoras y clasificaciones de "hola" como chitchat/help).
    const direct = this.#directSearch(text);
    if (direct) {
      return this.#startExplore(conv, direct);
    }

    const intent = await groqService.extractIntent(text);

    if (intent.intent === 'city_change') {
      await this.#startCity(conv, intent.city ? { preset: intent.city } : {});
      return;
    }
    if (intent.intent === 'appointments') {
      await this.#misReservas(conv);
      return;
    }
    if (intent.intent === 'help') {
      await whatsappService.sendMessage(conv.waId, menu.buildHelp());
      return;
    }
    if (intent.intent === 'chitchat' && intent.reply) {
      await whatsappService.sendMessage(conv.waId, intent.reply);
      await whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
      return;
    }

    const hints = { ...intent };
    if (intent.intent === 'book' && /accesible|barat|econ[óo]mic|al alcan|low.?cost|presupuesto|regatea|precio justo|economico/.test(lower)) {
      hints.priceBias = true; // ordenar resultados de menor a mayor precio
    }
    await this.#startExplore(conv, hints);
  }

  // ---------- Flujos ----------
  async #flowStep(conv, ctx, text, messageId) {
    switch (ctx.flow) {
      case 'city':
        return this.#cityStep(conv, ctx, text);
      case 'category':
        return this.#categoryStep(conv, ctx, text);
      case 'business':
        return this.#businessStep(conv, ctx, text);
      case 'service':
        return this.#serviceStep(conv, ctx, text);
      case 'professional':
        return this.#professionalStep(conv, ctx, text);
      case 'day':
        return this.#dayStep(conv, ctx, text);
      case 'slot':
        return this.#slotStep(conv, ctx, text);
      case 'confirm':
        return this.#confirmStep(conv, ctx, text, messageId);
      case 'pay':
        return this.#payStep(conv, ctx, text);
      default:
        await this.#startExplore(conv, {});
    }
  }

  // ---- Ciudad ----
  async #startCity(conv, opts = {}) {
    const directory = await this.#directory();
    const cities = this.#distinctCities(directory);
    const ctx = { flow: 'city', cityList: cities, pending: opts.action || null, preset: opts.preset || null };
    if (opts.preset && this.#matchCity(cities, opts.preset)) {
      ctx.city = this.#matchCity(cities, opts.preset);
      ctx.flow = null;
      await dbService.upsertConversation(conv.phone, { city: ctx.city, context: { flow: null, pending: ctx.pending, city: ctx.city } });
      if (ctx.pending === 'explore') return this.#startExplore(await this.#reload(conv), {});
      return whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, ctx.city));
    }
    await dbService.upsertConversation(conv.phone, { context: ctx });
    await whatsappService.sendMessage(conv.waId, menu.buildCityOptions(cities));
  }

  async #cityStep(conv, ctx, text) {
    const cities = ctx.cityList || [];
    const idx = menu.pickIndex(text, cities.length);
    const chosen = idx != null ? cities[idx] : this.#matchCity(cities, text);
    if (!chosen) {
      await whatsappService.sendMessage(conv.waId, menu.buildCityOptions(cities));
      return;
    }
    if (ctx.city === chosen) {
      await whatsappService.sendMessage(conv.waId, `Tu ciudad ya es *${chosen}*. ✅`);
    }
    const ctxClean = { flow: null, pending: ctx.pending, city: chosen };
    await dbService.upsertConversation(conv.phone, { city: chosen, context: ctxClean });
    if (ctx.pending === 'explore') {
      return this.#startExplore(conv, {});
    }
    if (ctx.pending === 'book') {
      return this.#startExplore(conv, {}, true);
    }
    await whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, chosen));
  }

  // ---- Categoría / explorar ----
  async #startExplore(conv, hints = {}, skipCategoryMenu = false) {
    const directory = await this.#directory();
    const cities = this.#distinctCities(directory);

    // Si el mensaje mencionó una ciudad distinta, la aplicamos antes de buscar.
    if (hints?.city) {
      const target = this.#matchCity(cities, hints.city);
      if (target && norm(target) !== norm(conv.city)) {
        await this.#changeCity(conv, target);
      }
    }

    const inCity = directory.filter((t) => t.city && norm(t.city) === norm(conv.city));
    if (inCity.length === 0) {
      await whatsappService.sendMessage(
        conv.waId,
        `Aún no hay negocios activos en *${conv.city}*.\nEmpecemos por elegir tu ciudad para que puedas agendar. 🏙️`,
      );
      return this.#startCity(conv, {});
    }

    let category = hints?.category || null;
    if (!category && hints?.business) {
      const hits = inCity.filter((t) => norm(t.name).includes(norm(hints.business)) || norm(t.tagline).includes(norm(hints.business)));
      if (hits.length >= 1 && hits.every((t) => t.category === hits[0].category)) {
        category = hits[0].category;
      }
    }

    const base = {
      city: conv.city,
      maxPrice: hints?.maxPrice || null,
      currency: hints?.currency || null,
      businessHint: hints?.business || null,
      priceBias: hints?.priceBias || false,
    };
    if (category) {
      const ctx = { flow: 'business', ...base, category, businessListReady: false };
      await dbService.upsertConversation(conv.phone, { context: ctx });
      await this.#loadBusinesses(conv, ctx, true);
      return;
    }
    if (skipCategoryMenu) {
      const ctx = { flow: 'category', ...base };
      await dbService.upsertConversation(conv.phone, { context: ctx });
      await whatsappService.sendMessage(conv.waId, menu.buildCategoryMenu());
      return;
    }

    const ctx = { flow: 'category', ...base };
    await dbService.upsertConversation(conv.phone, { context: ctx });
    await whatsappService.sendMessage(conv.waId, menu.buildCategoryMenu());
  }

  async #categoryStep(conv, ctx, text) {
    const idx = menu.pickIndex(text, menu.CATEGORY_ORDER.length);
    const cat = idx != null ? menu.CATEGORY_ORDER[idx] : menu.categoryIdFromLabel(text);
    if (!cat) {
      await whatsappService.sendMessage(conv.waId, menu.buildCategoryMenu());
      return;
    }
    ctx.category = cat;
    ctx.flow = 'business';
    ctx.businessListReady = false;
    await dbService.upsertConversation(conv.phone, { context: ctx });
    await this.#loadBusinesses(conv, ctx, true);
  }

  async #loadBusinesses(conv, ctx, show) {
    const directory = await this.#directory();
    let list = directory.filter((t) => t.city && norm(t.city) === norm(ctx.city) && (!ctx.category || t.category === ctx.category));

    // Hint de precio por servicio: filtramos o reordenamos consultando cada negocio.
    if (ctx.maxPrice || ctx.priceBias) {
      const priced = [];
      const noPrice = [];
      for (const t of list) {
        try {
          const full = await reservaYaApi.getTenantBySlug(t.slug);
          const services = (await reservaYaApi.getServices(full.tenantId)).filter((s) => s.active);
          const prices = services.map((s) => Number(s.price)).filter((p) => Number.isFinite(p));
          const minPrice = prices.length ? Math.min(...prices) : null;
          const cheap = ctx.maxPrice ? prices.some((p) => p <= ctx.maxPrice) : minPrice != null;
          (cheap ? priced : noPrice).push({ t, minPrice });
        } catch {
          noPrice.push({ t, minPrice: null });
        }
      }
      if (ctx.priceBias) {
        list = priced
          .sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity))
          .map((x) => x.t)
          .concat(noPrice.map((x) => x.t));
      } else {
        list = [...priced, ...noPrice].map((x) => x.t);
      }
    }
    if (ctx.businessHint) {
      const hint = norm(ctx.businessHint);
      list.sort((a, b) => (norm(a.name).includes(hint) === norm(b.name).includes(hint) ? 0 : norm(a.name).includes(hint) ? -1 : 1));
    }

    const LIMIT = 12;
    ctx.businessList = list.slice(0, LIMIT);
    ctx.flow = 'business';
    await dbService.upsertConversation(conv.phone, { context: ctx });

    if (list.length === 0) {
      ctx.flow = 'category';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      await whatsappService.sendMessage(
        conv.waId,
        `No encontramos negocios de *${menu.categoryLabel(ctx.category)}* en *${ctx.city}*.\nIntenta otra categoría. 🗂️\n\n${this.#cityPrompt(ctx.city)}`,
      );
      await whatsappService.sendMessage(conv.waId, menu.buildCategoryMenu());
      return;
    }
    if (show) {
      let msg = menu.buildBusinessMenu(ctx.businessList);
      const notes = [];
      if (ctx.priceBias || ctx.maxPrice) {
        notes.push(
          ctx.maxPrice
            ? `Resultados hasta ${Utils.money(ctx.maxPrice, ctx.currency || 'COP')}`
            : 'Resultados ordenados de menor a mayor precio',
        );
      }
      if (ctx.businessHint) notes.push(`Priorizamos *${ctx.businessHint}*`);
      if (notes.length) msg += `\n\n${notes.map((n) => `• ${n}`).join('\n')}`;
      msg += `\n\n${this.#cityPrompt(ctx.city)}`;
      await whatsappService.sendMessage(conv.waId, msg);
    }
  }

  async #businessStep(conv, ctx, text) {
    const list = ctx.businessList || [];
    const idx = menu.pickIndex(text, list.length);
    if (idx == null) {
      await whatsappService.sendMessage(conv.waId, menu.buildBusinessMenu(list));
      return;
    }
    const biz = list[idx];
    try {
      const full = await reservaYaApi.getTenantBySlug(biz.slug);
      ctx.tenant = { tenantId: full.tenantId, slug: full.slug, name: full.name, timezone: full.timezone };
      const services = await reservaYaApi.getServices(full.tenantId);
      let sList = services.filter((s) => s.active);
      if (ctx.maxPrice) sList = sList.filter((s) => s.price <= ctx.maxPrice);
      if (sList.length === 0) {
        await whatsappService.sendMessage(conv.waId, `Ups, ese negocio no tiene servicios dentro de tu presupuesto actual. Elige otro. 🙈`);
        await whatsappService.sendMessage(conv.waId, menu.buildBusinessMenu(list));
        return;
      }
      ctx.serviceList = sList;
      ctx.flow = 'service';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      await whatsappService.sendMessage(conv.waId, menu.buildServiceMenu(sList));
    } catch (err) {
      Utils.log('warn', `businessStep ${biz.slug}: ${err.message}`);
      await whatsappService.sendMessage(conv.waId, 'Tuvimos un problema cargando ese negocio. Intenta con otro. 🙁');
      await whatsappService.sendMessage(conv.waId, menu.buildBusinessMenu(list));
    }
  }

  async #serviceStep(conv, ctx, text) {
    const sList = ctx.serviceList || [];
    const idx = menu.pickIndex(text, sList.length);
    if (idx == null) {
      await whatsappService.sendMessage(conv.waId, menu.buildServiceMenu(sList));
      return;
    }
    const service = sList[idx];
    try {
      const type = service.durationMinutes >= 60 ? `${Math.floor(service.durationMinutes / 60)}h` : `${service.durationMinutes} min`;
      ctx.current = { serviceId: service.id, serviceName: service.name, price: service.price, currency: service.currency, durationMinutes: service.durationMinutes, durationLabel: type };
      const professionals = await reservaYaApi.getProfessionals(ctx.tenant.tenantId, service.id);
      ctx.current.professionals = professionals.filter((p) => p.active);
      if (ctx.current.professionals.length === 0) {
        await whatsappService.sendMessage(conv.waId, `Ese servicio no tiene profesionales asignados todavía. Elige otro. 🙁`);
        await whatsappService.sendMessage(conv.waId, menu.buildServiceMenu(sList));
        return;
      }
      if (ctx.current.professionals.length === 1) {
        ctx.current.professional = ctx.current.professionals[0];
        await this.#loadDays(conv, ctx);
        return;
      }
      ctx.flow = 'professional';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      await whatsappService.sendMessage(conv.waId, menu.buildProfessionalMenu(ctx.current.professionals));
    } catch (err) {
      Utils.log('warn', `serviceStep: ${err.message}`);
      await whatsappService.sendMessage(conv.waId, 'No pudimos cargar los servicios. Intenta de nuevo. 🙁');
      await whatsappService.sendMessage(conv.waId, menu.buildServiceMenu(sList));
    }
  }

  async #professionalStep(conv, ctx, text) {
    const pros = ctx.current?.professionals || [];
    const idx = menu.pickIndex(text, pros.length);
    if (idx == null) {
      await whatsappService.sendMessage(conv.waId, menu.buildProfessionalMenu(pros));
      return;
    }
    ctx.current.professional = pros[idx];
    await this.#loadDays(conv, ctx);
  }

  async #loadDays(conv, ctx) {
    try {
      const days = await reservaYaApi.getAvailabilityDays(ctx.tenant.tenantId, [ctx.current.professional.id], 14);
      ctx.dayList = days;
      ctx.flow = 'day';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      if (days.length === 0) {
        await whatsappService.sendMessage(conv.waId, 'Este profesional no tiene turnos en los próximos días. Elige otro. 😕');
        await whatsappService.sendMessage(conv.waId, menu.buildProfessionalMenu(ctx.current.professionals));
        return;
      }
      await whatsappService.sendMessage(conv.waId, menu.buildDayMenu(days));
    } catch (err) {
      Utils.log('warn', `loadDays: ${err.message}`);
      await whatsappService.sendMessage(conv.waId, 'No pudimos cargar la disponibilidad. Intenta de nuevo. 🙁');
    }
  }

  async #dayStep(conv, ctx, text) {
    const days = ctx.dayList || [];
    const idx = menu.pickIndex(text, days.length);
    if (idx == null) {
      await whatsappService.sendMessage(conv.waId, menu.buildDayMenu(days));
      return;
    }
    try {
      const slots = await reservaYaApi.getSlots(ctx.tenant.tenantId, {
        professionalId: ctx.current.professional.id,
        date: days[idx],
        durationMinutes: ctx.current.durationMinutes,
      });
      ctx.slotList = slots.filter((s) => s.available && !s.blocked);
      ctx.current.day = days[idx];
      ctx.flow = 'slot';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      if (ctx.slotList.length === 0) {
        await whatsappService.sendMessage(conv.waId, 'No hay horarios disponibles ese día. Elige otro. 📅');
        await whatsappService.sendMessage(conv.waId, menu.buildDayMenu(days));
        return;
      }
      await whatsappService.sendMessage(conv.waId, menu.buildSlotMenu(ctx.slotList));
    } catch (err) {
      Utils.log('warn', `dayStep: ${err.message}`);
      await whatsappService.sendMessage(conv.waId, 'No pudimos ver los horarios. Intenta de nuevo. 🙁');
    }
  }

  async #slotStep(conv, ctx, text) {
    const slots = ctx.slotList || [];
    const idx = menu.pickIndex(text, slots.length);
    if (idx == null) {
      await whatsappService.sendMessage(conv.waId, menu.buildSlotMenu(slots));
      return;
    }
    ctx.current.slotStart = slots[idx].start;
    ctx.flow = 'confirm';
    await dbService.upsertConversation(conv.phone, { context: ctx });
    const when = Utils.formatSlotLocal(ctx.current.slotStart, ctx.tenant.timezone);
    const summary =
      `*Confirma tu reserva* 📋\n\n` +
      `🏪 Negocio: ${ctx.tenant.name}\n` +
      `💈 Servicio: ${ctx.current.serviceName}\n` +
      `🧑‍🔬 Profesional: ${ctx.current.professional.name}\n` +
      `🕐 Fecha: ${when}\n` +
      `💰 Precio: ${Utils.money(ctx.current.price, ctx.current.currency)}\n\n` +
      `¿Confirmas?`;
    await whatsappService.sendButtons(conv.waId, summary, [
      { id: 'confirm:yes', title: '✔️ Confirmar' },
      { id: 'confirm:no', title: '❌ Cancelar' },
    ]);
  }

  async #confirmStep(conv, ctx, text, messageId) {
    if (/^confirm:no$/i.test(text)) {
      await dbService.clearContext(conv.phone);
      await whatsappService.sendMessage(conv.waId, 'Listo, cancelamos. ¿Buscas algo más? 😉');
      return whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
    }
    if (/^confirm:yes$/i.test(text) || /^(si|sí|confirmar|confirmo|adelante)$/i.test(text)) {
      await this.#doBooking(conv, ctx, messageId);
      return;
    }
    await whatsappService.sendMessage(conv.waId, 'Responde con *Confirmar* o *Cancelar*.');
  }

  async #payStep(conv, ctx, text) {
    const pending = ctx.pendingPayment;
    if (!pending || !pending.appointmentId) {
      await dbService.clearContext(conv.phone);
      return whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
    }
    const mode = /^pay:full$/i.test(text) || /^(pagar.*todo|total|full)$/i.test(text)
      ? 'full'
      : /^pay:advance$/i.test(text) || /^(anticipo|advance)$/i.test(text)
        ? 'advance'
        : null;
    if (!mode) {
      await whatsappService.sendMessage(conv.waId, 'Elige *Anticipo* o *Pagar todo*. 🙂');
      return;
    }
    try {
      const session = await reservaYaApi.createPaymentSession(pending.tenantId, pending.appointmentId, mode);
      const amount = session.amount ?? (mode === 'full' ? pending.full : pending.advance);
      const label = mode === 'full' ? 'Total' : 'Anticipo';
      const msg =
        `*Enlace de pago seguro* 🔐\n\n` +
        `🏪 ${pending.tenantName}\n` +
        `🕐 ${pending.when}\n` +
        `💰 ${label}: ${Utils.money(amount, session.currency || pending.currency)}\n` +
        `\n${session.url}\n\n` +
        `_El enlace expira en unos minutos; si no completas el pago, tu horario se libera._`;
      await whatsappService.sendMessage(conv.waId, msg);
    } catch (err) {
      Utils.log('warn', `payStep ${pending.tenantName}: ${err.message}`);
      await whatsappService.sendMessage(conv.waId, 'No pudimos generar el enlace de pago. Intenta de nuevo. 🙁');
    }
    await dbService.clearContext(conv.phone);
    await whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
  }

  async #doBooking(conv, ctx, messageId) {
    try {
      const freshSlots = await reservaYaApi.getSlots(ctx.tenant.tenantId, {
        professionalId: ctx.current.professional.id,
        date: ctx.current.day,
        durationMinutes: ctx.current.durationMinutes,
      });
      const stillAvailable = freshSlots.some(
        (s) => s.start === ctx.current.slotStart && s.available && !s.blocked,
      );
      if (!stillAvailable) {
        await whatsappService.sendMessage(conv.waId, 'Ese horario ya fue tomado. Elige otro. ⏰');
        await this.#slotStep(conv, ctx, ' ');
        return;
      }
      const phone = Utils.normalizePhoneE164(conv.phone) || `+${conv.phone}`;
      const result = await reservaYaApi.createAppointment(ctx.tenant.tenantId, {
        serviceId: ctx.current.serviceId,
        professionalId: ctx.current.professional.id,
        startTime: ctx.current.slotStart,
        source: 'whatsapp',
        idempotencyKey: messageId ? `whatsapp:${messageId}` : undefined,
        clientInfo: {
          name: conv.name || 'Usuario WhatsApp',
          phone,
          habeasDataConsent: true,
        },
      });
      const when = Utils.formatSlotLocal(ctx.current.slotStart, ctx.tenant.timezone);
      const advance = result?.intent?.advanceAmount;
      const ref = result?.intent?.paymentReference;
      const appointmentId = result?.appointment?.id;
      let msg =
        result?.replay
          ? 'Ya tenías una reserva activa para ese horario. ✅'
          : `*¡Reserva registrada!* 🎉\n\n` +
            `🏪 ${ctx.tenant.name}\n` +
            `💈 ${ctx.current.serviceName}\n` +
            `🧑‍🔬 ${ctx.current.professional.name}\n` +
            `🕐 ${when}\n` +
            (advance > 0 ? `💰 Anticipo: ${Utils.money(advance, ctx.current.currency || 'COP')}\n` : '') +
            (ref ? `🧾 Ref: ${ref}\n` : '') +
            `\nEl negocio ya fue notificado. Te recordaremos la cita antes. 📲`;
      if (result?.replay || !appointmentId || advance <= 0) {
        msg += `\n\n_Estado: confirmada._`;
        await whatsappService.sendMessage(conv.waId, msg);
        await dbService.clearContext(conv.phone);
        return whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
      }
      await whatsappService.sendMessage(conv.waId, msg);
      ctx.pendingPayment = {
        tenantId: ctx.tenant.tenantId,
        tenantName: ctx.tenant.name,
        appointmentId,
        when,
        advance,
        full: result?.intent?.fullAmount || ctx.current.price,
        currency: ctx.current.currency || 'COP',
      };
      ctx.flow = 'pay';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      const paySummary =
        `_Tu reserva quedó en estado pendiente de pago._ ⏳\n\n` +
        `💰 Anticipo: *${Utils.money(advance, ctx.current.currency || 'COP')}*\n` +
        `💳 Total: *${Utils.money(ctx.current.price, ctx.current.currency || 'COP')}*\n\n` +
        `Para confirmarla definitivamente paga el *anticipo* o el *total*, con un enlace seguro de pago. ` +
        `_El horario se libera si el pago no se completa a tiempo._`;
      return whatsappService.sendButtons(conv.waId, paySummary, [
        { id: 'pay:advance', title: '💰 Anticipo' },
        { id: 'pay:full', title: '💳 Pagar todo' },
      ]);
    } catch (err) {
      const data = err?.response?.data?.error;
      Utils.log('warn', `doBooking ${ctx.tenant?.name}: ${err.message} ${JSON.stringify(data || {})}`);
      const hint = data?.code === 'AVAILABILITY_CONFLICT' ? 'Ese horario ya fue tomado. Elige otro. ⏰' : 'No pudimos confirmar la reserva. Intenta con otro horario. 🙁';
      await whatsappService.sendMessage(conv.waId, hint);
      await this.#slotStep(conv, ctx, ' ');
      return;
    }
  }

  // ---------- Mis reservas ----------
  async #misReservas(conv) {
    const phone = Utils.normalizePhoneE164(conv.phone) || `+${conv.phone}`;
    let rows = [];
    try {
      const directory = await this.#directory();
      for (const t of directory) {
        try {
          const full = await reservaYaApi.getTenantBySlug(t.slug);
          const history = await reservaYaApi.getClientHistory(full.tenantId, phone);
          for (const a of history) {
            rows.push({ tenantName: t.name, timezone: full.timezone, ...a });
          }
        } catch {
          // si un negocio falla, seguimos con otros
        }
      }
    } catch (err) {
      Utils.log('warn', `misReservas: ${err.message}`);
    }

    if (rows.length === 0) {
      await whatsappService.sendMessage(conv.waId, 'No tienes reservas aún. 😊\nCuéntame qué servicio buscas y te ayudo a agendar.');
      await whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
      return;
    }

    rows.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    const top = rows.slice(0, 6);
    const lines = top.map((a) => {
      const when = a.startTime ? Utils.formatSlotLocal(a.startTime, a.timezone) : '';
      return `• *${a.serviceSnapshot?.name || a.serviceName || 'Cita'}* — ${a.tenantName}\n  ${when} · ${menu.statusLabel(a.status)}`;
    });
    const msg = `*Tus reservas* 📅\n\n${lines.join('\n\n')}${rows.length > 6 ? `\n\n_...y ${rows.length - 6} más._` : ''}`;
    await whatsappService.sendMessage(conv.waId, msg);
  }

  // ---------- Utilidades ----------
  async #directory() {
    return reservaYaApi.getDirectory().catch(() => []);
  }

  async #changeCity(conv, city) {
    await dbService.upsertConversation(conv.phone, { city });
    conv.city = city;
  }

  // Pregunta de confirmación que acompaña a los resultados de búsqueda.
  #cityPrompt(city) {
    return `📍 ¿Lo buscas en tu ciudad *${city}*?\nSi prefieres otra ciudad, escríbela (ej. Cali, Medellín) y la busco allá.`;
  }

  /**
   * Detecta si el mensaje es (o pide) una ciudad para cambiar de búsqueda.
   * Devuelve 'otra' si solo dice "en otra ciudad", el nombre de la ciudad si lo
   * menciona como palabra completa, o null si no parece una referencia de ciudad.
   */
  #cityFromText(text) {
    const n = norm(String(text ?? '').trim());
    if (!n) return null;
    if (/otra ciudad|otra ubicaci/.test(n) && n.length <= 40) return 'otra';
    if (n.length > 40) return null; // frases largas: que la IA decida
    const all = this.#distinctCities([]).concat(KNOWN_CITIES);
    const exact = all.find((c) => norm(c) === n);
    if (exact) return exact;
    if (!/(cambiar|soy de|vivo en|estoy en|me encuentro|busco en|quiero en|mud[ée]|ciudad de |ciudad es |para |en )/.test(n)) return null;
    for (const c of all) {
      const w = norm(c);
      if (w.length >= 4 && (n.includes(` ${w} `) || n.startsWith(`${w} `) || n.endsWith(` ${w}`))) return c;
    }
    return null;
  }

  /**
   * ¿El texto parece una petición de búsqueda/reserva en lenguaje natural?
   * Si menciona un servicio (categoría) o verbos de búsqueda, NO lo tratamos como
   * simple cambio de ciudad: debe resolver la búsqueda directamente.
   */
  #looksLikeServiceRequest(text) {
    const n = norm(String(text ?? '').trim());
    if (!n) return false;
    if (Utils.parseCategoryFromText(n)) return true;
    if (Utils.fuzzyCategoryFromText(n)) return true;
    if (/(necesito|quiero|busco|reserva|reservar|cita|turno|agendar|agendarme|hora para|precio|cuesta|barat|econ[óo]mic|disponible)/.test(n)) return true;
    return false;
  }

  /**
   * Intento de búsqueda directa: si el mensaje contiene una petición de servicio
   * y una categoría reconocible (con tolerancia a typos) en una ciudad opcional,
   * devolvemos los hints para saltar directamente al listado de negocios.
   * Si no se reconoce categoría, se devuelve null y el flujo cae en la IA.
   */
  #directSearch(text) {
    const n = norm(String(text ?? '').trim());
    if (!n || !this.#looksLikeServiceRequest(n)) return null;
    const category = Utils.parseCategoryFromText(n) || Utils.fuzzyCategoryFromText(n);
    if (!category) return null;
    const city = this.#cityFromText(n) || this.#cityInText(n);
    const hints = { category };
    if (city && city !== 'otra') hints.city = city;
    return hints;
  }

  // Ciudad mencionada en CUALQUIER posición (sin depender de preposiciones:
  // "peluqueria bogota", "bogota peluqueria", "busco X en cali", etc.).
  #cityInText(text) {
    const n = norm(String(text ?? '').trim());
    if (!n) return null;
    const all = this.#distinctCities([]).concat(KNOWN_CITIES);
    return all.find((c) => {
      const w = norm(c);
      if (w.length < 4) return false;
      return new RegExp(`(^|\\s)${w}(\\s|$)`).test(n);
    }) || null;
  }

  #distinctCities(directory) {
    const cities = [...new Set(directory.map((t) => t.city).filter(Boolean))];
    const sorted = cities.sort((a, b) => a.localeCompare(b));
    const def = config.defaultCity;
    if (def && sorted.some((c) => norm(c) === norm(def))) {
      return [sorted.find((c) => norm(c) === norm(def)), ...sorted.filter((c) => norm(c) !== norm(def))];
    }
    return sorted;
  }

  #matchCity(cities, text) {
    if (!text) return null;
    const n = norm(text);
    const direct = cities.find((c) => norm(c) === n);
    if (direct) return direct;
    return cities.find((c) => norm(c).includes(n) || n.includes(norm(c)));
  }

  async #reload(conv) {
    return dbService.getConversation(conv.phone);
  }
}

module.exports = new Orchestrator();