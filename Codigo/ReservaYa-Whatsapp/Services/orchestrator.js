// Services/orchestrator.js - Máquina de estados del asistente WhatsApp de ReservaYa
const Utils = require('../utils');
const config = require('../config');
const dbService = require('./dbService');
const reservaYaApi = require('./reservaYaApi');
const roleService = require('./roleService');
const groqService = require('./groqService');
const whatsappService = require('./whatsappService');
const menu = require('./menuService');
const advisor = require('./availabilityAdvisor');
const { parseTimeRequest, parseDayRequest, todayInZone } = require('./timeParser');
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
      case 'time_meridiem':
        return this.#timeMeridiemStep(conv, ctx, text);
      case 'time_choice':
        return this.#timeChoiceStep(conv, ctx, text);
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
      ctx.tenant = {
        tenantId: full.tenantId,
        slug: full.slug,
        name: full.name,
        timezone: full.timezone,
        category: full.category,
        currency: full.currency,
        settings: full.settings || {},
      };
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
    if (idx != null) {
      ctx.current.professional = pros[idx];
      ctx.current.anyProfessional = false;
      return this.#loadDays(conv, ctx);
    }
    const n = norm(text);
    if (/^(cualquiera|me da igual|el que sea|quien sea|disponible|el primero|random|lo que sea)$/.test(n)) {
      ctx.current.professional = null;
      ctx.current.anyProfessional = true;
      return this.#loadDays(conv, ctx);
    }
    const matches = advisor.matchProfessionals(pros, text);
    if (matches.length === 1) {
      ctx.current.professional = matches[0];
      ctx.current.anyProfessional = false;
      return this.#loadDays(conv, ctx);
    }
    await whatsappService.sendMessage(
      conv.waId,
      `${matches.length > 1 ? 'Tengo varios profesionales con ese nombre. ' : ''}${menu.buildProfessionalMenu(pros)}`,
    );
  }

  #professionalsFor(ctx) {
    const all = ctx.current?.professionals || [];
    if (ctx.current?.professional) return [ctx.current.professional];
    return all;
  }

  #resolveProfessional(ctx, id) {
    const all = ctx.current?.professionals || [];
    if (id) {
      const found = all.find((p) => p.id === id);
      if (found) return found;
    }
    return ctx.current?.professional || all[0] || null;
  }

  async #loadDays(conv, ctx) {
    try {
      const pros = this.#professionalsFor(ctx);
      const days = await reservaYaApi.getAvailabilityDays(
        ctx.tenant.tenantId,
        pros.map((p) => p.id),
        14,
      );
      ctx.dayList = Array.isArray(days) ? days : [];
      ctx.flow = 'day';
      delete ctx.dayAvailability;
      delete ctx.slotList;
      delete ctx.pendingTime;
      delete ctx.suggestion;
      delete ctx.lastUnavailable;
      await dbService.upsertConversation(conv.phone, { context: ctx });
      if (ctx.dayList.length === 0) {
        await whatsappService.sendMessage(
          conv.waId,
          'No encontré turnos en los próximos días para esa selección. 😕' +
            (ctx.current?.professional ? '\nPuedes elegir otro profesional escribiendo *profesional*.' : ''),
        );
        if ((ctx.current?.professionals || []).length > 1) {
          ctx.flow = 'professional';
          await dbService.upsertConversation(conv.phone, { context: ctx });
          await whatsappService.sendMessage(conv.waId, menu.buildProfessionalMenu(ctx.current.professionals));
        }
        return;
      }
      await whatsappService.sendMessage(conv.waId, menu.buildDayMenu(ctx.dayList, ctx.tenant.timezone));
    } catch (err) {
      Utils.log('warn', `loadDays: ${err.message}`);
      await whatsappService.sendMessage(conv.waId, 'No pudimos cargar la disponibilidad. Intenta de nuevo. 🙁');
    }
  }

  async #dayStep(conv, ctx, text) {
    const days = ctx.dayList || [];
    const timeReq = parseTimeRequest(text, { context: 'day' });
    const today = todayInZone(ctx.tenant.timezone);
    const dayReq = parseDayRequest(text, { today });
    const idx = menu.pickIndex(text, days.length);

    let chosen = null;
    if (idx != null) chosen = days[idx];
    else if (dayReq) chosen = dayReq.date;
    else if (timeReq.kind !== 'none' && days.length) chosen = days[0];

    if (!chosen) {
      await whatsappService.sendMessage(conv.waId, menu.buildDayMenu(days, ctx.tenant.timezone));
      return;
    }

    // Si el día pedido no está en la lista (día cerrado o fuera de ventana),
    // igual intentamos consultar sus horas; si no hay, ofrecemos el siguiente.
    const loaded = await this.#loadSlotsForDay(
      conv,
      ctx,
      chosen,
      timeReq.kind !== 'none' ? timeReq : null,
    );
    if (!loaded) {
      const next = await advisor.nextAvailableDay({
        tenant: ctx.tenant,
        professionals: ctx.current.professionals || [],
        afterDate: Utils.addDays(chosen, -1),
        durationMinutes: ctx.current.durationMinutes,
        targetMinutes: timeReq.kind === 'exact' ? (timeReq.hour * 60 + timeReq.minute) : 9 * 60,
      });
      if (!next) {
        await whatsappService.sendMessage(
          conv.waId,
          'No encontré disponibilidad en los próximos días. 😔 Prueba con otro servicio u otro negocio.',
        );
        await dbService.clearContext(conv.phone);
        return;
      }
      ctx.suggestion = this.#suggestionFromNextDay(ctx, next);
      ctx.flow = 'time_choice';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      await whatsappService.sendMessage(
        conv.waId,
        `Ese día no hay cupo. La opción más cercana es *${Utils.formatDayLabel(next.date)}* a las *${Utils.formatTimeLocal(next.slot.start, ctx.tenant.timezone)}*. ¿Te sirve?`,
      );
      return whatsappService.sendButtons(conv.waId, '¿Reservamos esa opción?', [
        { id: 'time:nextday', title: '✅ Sí, esa' },
        { id: 'time:other', title: '🕐 Otra hora' },
      ]);
    }
  }

  /**
   * Carga las horas de un día. Devuelve true si encontró al menos una.
   * Si `timeReq` viene, intenta resolverla directamente.
   */
  async #loadSlotsForDay(conv, ctx, date, timeReq = null, preselectStart = null) {
    try {
      const pros = ctx.current.professionals || [];
      const availability = await advisor.loadAvailability({
        tenant: ctx.tenant,
        professionals: pros,
        date,
        durationMinutes: ctx.current.durationMinutes,
      });
      ctx.dayAvailability = {
        date,
        timezone: availability.timezone,
        policy: availability.policy,
        merged: availability.merged,
        available: availability.available,
      };
      const chosen = ctx.current.professional;
      const visible = availability.available.filter(
        (e) => !chosen || e.professionalIds.includes(chosen.id),
      );
      ctx.current.day = date;
      ctx.slotList = visible.map((e) => ({
        start: e.start,
        end: e.end,
        available: true,
        blocked: false,
        professionalIds: e.professionalIds,
        professionalNames: e.professionalNames,
        timezone: e.timezone,
      }));
      ctx.allSlots = ctx.slotList;
      ctx.flow = 'slot';
      delete ctx.pendingTime;
      delete ctx.suggestion;
      await dbService.upsertConversation(conv.phone, { context: ctx });

      if (preselectStart) {
        const entry = availability.available.find((e) => e.start === preselectStart);
        if (entry) {
          await this.#selectSlot(conv, ctx, entry);
          return true;
        }
      }

      if (ctx.slotList.length === 0) {
        // El profesional elegido no tiene cupo, pero otro sí: ofrecerlo.
        if (chosen && availability.available.length > 0) {
          const first = availability.available[0];
          const otherId = first.professionalIds.find((id) => id !== chosen.id) || first.professionalIds[0];
          const other = this.#resolveProfessional(ctx, otherId);
          ctx.suggestion = {
            type: 'other_professional',
            start: first.start,
            date,
            professionalId: other?.id || otherId,
            reason: 'other_professional',
          };
          ctx.flow = 'time_choice';
          await dbService.upsertConversation(conv.phone, { context: ctx });
          await whatsappService.sendMessage(
            conv.waId,
            `*${chosen.name}* no tiene cupo el ${Utils.formatDayLabel(date)}. 😕\n` +
              `Pero *${other?.name || 'otro profesional'}* sí tiene a las *${Utils.formatTimeLocal(first.start, ctx.tenant.timezone)}*. ¿Quieres agendar con esa persona?`,
          );
          return whatsappService.sendButtons(conv.waId, '¿Con otro profesional?', [
            { id: 'time:otherpro', title: '✅ Sí, con esa' },
            { id: 'time:other', title: '🕐 Otra hora' },
          ]);
        }
        await whatsappService.sendMessage(
          conv.waId,
          `No hay horarios disponibles el ${Utils.formatDayLabel(date)}. 📅`,
        );
        return false;
      }

      if (timeReq) {
        ctx.flow = 'slot';
        await this.#handleTimeRequest(conv, ctx, timeReq);
        return true;
      }
      await whatsappService.sendMessage(
        conv.waId,
        menu.buildSlotMenu(ctx.slotList, ctx.tenant.timezone),
      );
      return true;
    } catch (err) {
      Utils.log('warn', `loadSlotsForDay ${date}: ${err.message}`);
      await whatsappService.sendMessage(conv.waId, 'No pudimos ver los horarios. Intenta de nuevo. 🙁');
      return false;
    }
  }

  async #slotStep(conv, ctx, text) {
    const slots = ctx.slotList || [];
    const clean = String(text ?? '').trim();
    const n = norm(clean);

    if (/^(otro dia|otra fecha|siguiente dia|manana|pasado manana|el viernes|el lunes|el martes|el miercoles|el jueves|el sabado|el domingo)$/.test(n)) {
      const dayReq = parseDayRequest(clean, { today: todayInZone(ctx.tenant.timezone) });
      if (dayReq) {
        ctx.flow = 'day';
        await dbService.upsertConversation(conv.phone, { context: ctx });
        return this.#dayStep(conv, ctx, clean);
      }
    }
    if (/^(cualquiera|la primera|lo que sea|el primero|la mas pronto|lo mas pronto|disponible)$/.test(n) && slots.length) {
      return this.#selectSlot(conv, ctx, slots[0]);
    }
    if (/^(otro profesional|cambiar profesional|profesional)$/.test(n)) {
      ctx.flow = 'professional';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return whatsappService.sendMessage(conv.waId, menu.buildProfessionalMenu(ctx.current.professionals || []));
    }

    const idx = menu.pickIndex(clean, slots.length);
    if (idx != null) {
      // Un número dentro del menú se interpreta como opción. Para una hora
      // escrita (ej. "3 pm") el usuario debe incluir el meridiem.
      return this.#selectSlot(conv, ctx, slots[idx]);
    }

    const timeReq = parseTimeRequest(clean, { context: 'slot' });
    if (timeReq.kind !== 'none') {
      return this.#handleTimeRequest(conv, ctx, timeReq);
    }
    await whatsappService.sendMessage(
      conv.waId,
      menu.buildSlotMenu(slots, ctx.tenant.timezone),
    );
  }

  async #timeMeridiemStep(conv, ctx, text) {
    const pending = ctx.pendingTime;
    if (!pending) {
      ctx.flow = 'slot';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return this.#slotStep(conv, ctx, text);
    }
    const n = norm(text);

    // Rango pendiente: "de 3 a 5" -> ¿mañana o tarde?
    if (pending.kind === 'range') {
      const mer = text === 'time:range_pm' || /\b(pm|tarde|noche)\b/.test(n)
        ? 'pm'
        : text === 'time:range_am' || /\b(am|manana|madrugada)\b/.test(n)
          ? 'am'
          : null;
      if (!mer) {
        if (text === 'time:other' || /^(otra|otra hora|cambiar|no|mejor no)$/.test(n)) {
          ctx.flow = 'slot';
          delete ctx.pendingTime;
          await dbService.upsertConversation(conv.phone, { context: ctx });
          return whatsappService.sendMessage(conv.waId, menu.buildSlotMenu(this.#fullSlots(ctx), ctx.tenant.timezone));
        }
        return whatsappService.sendButtons(conv.waId, '¿Ese rango es de la mañana o de la tarde? 🌅🌇', [
          { id: 'time:range_am', title: '🌅 Mañana' },
          { id: 'time:range_pm', title: '🌇 Tarde' },
          { id: 'time:other', title: '🕐 Otra hora' },
        ]);
      }
      const fix = (endpoint) => {
        if (!endpoint || endpoint.kind === 'exact') return endpoint;
        const hour = endpoint.candidates.find((h) => (mer === 'pm' ? h >= 12 : h < 12));
        return { ...endpoint, kind: 'exact', hour, meridiem: mer };
      };
      let from = fix(pending.from);
      const to = fix(pending.to);
      // "de 11 a 1" + tarde = 11:00 a. m. a 1:00 p. m., no 11:00 p. m. a 1:00 p. m.
      if (mer === 'pm' && from.kind === 'exact' && to.kind === 'exact'
        && from.hour >= 12 && to.hour >= 12 && from.hour > to.hour) {
        const amStart = (pending.from.candidates || []).find((h) => h < 12);
        if (amStart != null) from = { ...from, hour: amStart, meridiem: 'am' };
      }
      ctx.flow = 'slot';
      delete ctx.pendingTime;
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return this.#handleRangeRequest(conv, ctx, { from, to, text: pending.text });
    }

    let hour24 = null;
    if (text === 'time:pm') {
      hour24 = pending.candidates.find((h) => h >= 12);
    } else if (text === 'time:am') {
      hour24 = pending.candidates.find((h) => h < 12);
    } else if (/\b(pm|tarde|noche)\b/.test(n)) {
      hour24 = pending.candidates.find((h) => h >= 12);
    } else if (/\b(am|manana|madrugada)\b/.test(n)) {
      hour24 = pending.candidates.find((h) => h < 12);
    }

    if (hour24 == null) {
      if (text === 'time:other' || /^(otra|otra hora|cambiar|no|mejor no)$/.test(n)) {
        ctx.flow = 'slot';
        delete ctx.pendingTime;
        await dbService.upsertConversation(conv.phone, { context: ctx });
        return whatsappService.sendMessage(conv.waId, menu.buildSlotMenu(this.#fullSlots(ctx), ctx.tenant.timezone));
      }
      const otherTime = parseTimeRequest(text, { context: 'slot' });
      if (otherTime.kind !== 'none') {
        ctx.flow = 'slot';
        delete ctx.pendingTime;
        await dbService.upsertConversation(conv.phone, { context: ctx });
        return this.#handleTimeRequest(conv, ctx, otherTime);
      }
      return whatsappService.sendButtons(conv.waId, '¿Es de mañana o de la tarde?', this.#meridiemButtons(ctx));
    }

    const minute = pending.minute || 0;
    ctx.flow = 'slot';
    delete ctx.pendingTime;
    await dbService.upsertConversation(conv.phone, { context: ctx });
    return this.#handleExactRequest(conv, ctx, hour24, minute, pending.text);
  }

  #fullSlots(ctx) {
    return Array.isArray(ctx.allSlots) && ctx.allSlots.length ? ctx.allSlots : (ctx.slotList || []);
  }

  #meridiemButtons(ctx) {
    const pending = ctx.pendingTime;
    if (!pending) return [];
    const minute = pending.minute || 0;
    const candidates = pending.candidates || [];
    const am = candidates.find((h) => h < 12);
    const pm = candidates.find((h) => h >= 12);
    const buttons = [];
    if (am != null) buttons.push({ id: 'time:am', title: `🌅 ${Utils.formatMinutes(am * 60 + minute)}`.slice(0, 20) });
    if (pm != null) buttons.push({ id: 'time:pm', title: `🌇 ${Utils.formatMinutes(pm * 60 + minute)}`.slice(0, 20) });
    if (buttons.length < 3) buttons.push({ id: 'time:other', title: '🕐 Otra hora' });
    return buttons;
  }

  async #handleTimeRequest(conv, ctx, timeReq) {
    if (timeReq.kind === 'range') {
      return this.#handleRangeRequest(conv, ctx, timeReq);
    }
    if (timeReq.kind === 'ambiguous') {
      ctx.pendingTime = {
        kind: 'exact',
        minute: timeReq.minute || 0,
        candidates: timeReq.candidates || [],
        day: ctx.current.day,
        text: timeReq.text || '',
        modifier: timeReq.modifier || null,
      };
      ctx.flow = 'time_meridiem';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      const minute = timeReq.minute || 0;
      const labels = (timeReq.candidates || []).map((h) => Utils.formatMinutes(h * 60 + minute));
      return whatsappService.sendButtons(
        conv.waId,
        `Para no equivocarme con tu reserva: ¿te refieres a las *${labels[0]}* o a las *${labels[1]}*? 🤔`,
        this.#meridiemButtons(ctx),
      );
    }
    if (timeReq.kind === 'invalid') {
      await whatsappService.sendMessage(
        conv.waId,
        'Esa hora no existe o no es válida. 🙁 Usa una hora entre *00:00* y *23:59*, por ejemplo *3:30 pm* o *1530*.',
      );
      return whatsappService.sendMessage(
        conv.waId,
        menu.buildSlotMenu(ctx.slotList || [], ctx.tenant.timezone),
      );
    }
    if (timeReq.kind === 'exact') {
      const hour = timeReq.hour;
      const minute = timeReq.minute;
      const modifier = timeReq.modifier;
      if (modifier === 'before' || modifier === 'after') {
        return this.#handleRelativeRequest(conv, ctx, hour * 60 + minute, modifier);
      }
      return this.#handleExactRequest(conv, ctx, hour, minute, timeReq.text);
    }
    await whatsappService.sendMessage(
      conv.waId,
      menu.buildSlotMenu(ctx.slotList || [], ctx.tenant.timezone),
    );
  }

  async #handleRangeRequest(conv, ctx, timeReq) {
    const { from, to } = timeReq;
    if (from.ambiguous || to.ambiguous) {
      ctx.pendingTime = {
        kind: 'range',
        from,
        to,
        text: timeReq.text,
      };
      ctx.flow = 'time_meridiem';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return whatsappService.sendButtons(
        conv.waId,
        '¿Ese rango es de la mañana o de la tarde? 🌅🌇',
        [
          { id: 'time:range_am', title: '🌅 Mañana' },
          { id: 'time:range_pm', title: '🌇 Tarde' },
          { id: 'time:other', title: '🕐 Otra hora' },
        ],
      );
    }
    const startMin = from.hour * 60 + from.minute;
    const endMin = to.hour * 60 + to.minute;
    const inside = (ctx.slotList || []).filter((s) => {
      const m = Utils.localMinutes(s.start, ctx.tenant.timezone);
      return m >= startMin && m < endMin;
    });
    if (inside.length) {
      ctx.allSlots = ctx.allSlots || ctx.slotList;
      ctx.slotList = inside;
      ctx.flow = 'slot';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return whatsappService.sendMessage(
        conv.waId,
        `Estas son las horas disponibles entre *${Utils.formatMinutes(startMin)}* y *${Utils.formatMinutes(endMin)}*:\n\n` +
          `${menu.buildSlotMenu(inside, ctx.tenant.timezone)}`,
      );
    }
    const target = startMin;
    return this.#handleExactRequest(conv, ctx, Math.floor(target / 60), target % 60, timeReq.text);
  }

  async #handleRelativeRequest(conv, ctx, targetMinutes, modifier) {
    const candidates = (ctx.slotList || [])
      .map((s) => ({ s, m: Utils.localMinutes(s.start, ctx.tenant.timezone) }))
      .filter(({ m }) => (modifier === 'before' ? m < targetMinutes : m > targetMinutes))
      .sort((a, b) => (modifier === 'before' ? b.m - a.m : a.m - b.m));
    if (candidates.length) {
      return this.#selectSlot(conv, ctx, candidates[0].s);
    }
    return this.#handleExactRequest(conv, ctx, Math.floor(targetMinutes / 60), targetMinutes % 60, `${modifier} ${targetMinutes}`);
  }

  async #handleExactRequest(conv, ctx, hour, minute, originalText) {
    const target = hour * 60 + minute;
    const entry = advisor.exactSlot(ctx.dayAvailability, target);
    const chosen = ctx.current.professional;
    const belongsToChosen = !chosen || (entry?.professionalIds || []).includes(chosen.id);
    if (entry?.available && belongsToChosen) {
      return this.#selectSlot(conv, ctx, entry);
    }

    const diagnosis = advisor.diagnose({
      tenant: ctx.tenant,
      professionals: ctx.current.professionals || [],
      chosenProfessional: chosen,
      date: ctx.current.day,
      targetMinutes: target,
      availability: ctx.dayAvailability,
    });

    // Si el problema es que el profesional elegido está ocupado pero otro
    // tiene la misma hora, no hace falta buscar otro día.
    if (!diagnosis.sameDay && !diagnosis.otherProfessionals.length) {
      diagnosis.nextDay = await advisor.nextAvailableDay({
        tenant: ctx.tenant,
        professionals: ctx.current.professionals || [],
        afterDate: ctx.current.day,
        durationMinutes: ctx.current.durationMinutes,
        targetMinutes: target,
      });
    }

    const previous = ctx.lastUnavailable;
    const insist = Boolean(
      previous
      && previous.minutes === target
      && previous.day === ctx.current.day
      && previous.attempts >= 1,
    );
    if (insist) {
      diagnosis.insisted = true;
      diagnosis.attempts = previous.attempts + 1;
    }
    ctx.lastUnavailable = {
      minutes: target,
      day: ctx.current.day,
      text: String(originalText || ''),
      attempts: insist ? previous.attempts + 1 : 1,
    };

    return this.#sendSuggestion(conv, ctx, diagnosis, originalText);
  }

  async #sendSuggestion(conv, ctx, diagnosis, originalText) {
    const tz = ctx.tenant.timezone;
    const proName = ctx.current.professional?.name || 'el profesional';
    const requested = Utils.formatMinutes(diagnosis.targetMinutes);
    const sameDay = diagnosis.sameDay;
    const nextDay = diagnosis.nextDay;
    const otherPros = (diagnosis.otherProfessionals || [])
      .map((id) => (ctx.current.professionals || []).find((p) => p.id === id))
      .filter(Boolean);
    const otherPro = otherPros[0] || null;

    let message = '';
    if (diagnosis.reason === 'break') {
      message =
        `A las *${requested}* ${proName} está en su pausa de almuerzo ` +
        `(${Utils.formatMinutes(diagnosis.breakWindow.start)} a ${Utils.formatMinutes(diagnosis.breakWindow.end)}). 😊\n`;
    } else if (diagnosis.reason === 'before_open') {
      message = `A las *${requested}* todavía no abren. El horario es ${diagnosis.scheduleText}. ⏰\n`;
    } else if (diagnosis.reason === 'after_close') {
      message = `A las *${requested}* ya cerraron. El horario es ${diagnosis.scheduleText}. 🌙\n`;
    } else if (diagnosis.reason === 'day_off') {
      message = `Ese día ${proName} no tiene atención. 📅\n`;
    } else if (diagnosis.reason === 'outside') {
      message = `A las *${requested}* no está dentro del horario de atención (${diagnosis.scheduleText}). ⏰\n`;
    } else if (diagnosis.reason === 'full') {
      message = `A las *${requested}* ya se completó el cupo disponible. 😕\n`;
    } else {
      message = `A las *${requested}* ${proName} ya tiene una cita. 😕\n`;
    }

    if (diagnosis.insisted) {
      message =
        `Entiendo que prefieres las *${requested}*, pero ese horario no está disponible y no puedo reservarlo. ` +
        `Para cuidar tu agenda, te propongo una alternativa real. 🙏\n\n` + message;
    }

    if (otherPro && diagnosis.exact?.start) {
      ctx.suggestion = {
        type: 'other_professional',
        start: diagnosis.exact.start,
        date: diagnosis.date,
        professionalId: otherPro.id,
        reason: diagnosis.reason,
      };
      ctx.flow = 'time_choice';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      message += `\n*${otherPro.name}* sí está disponible a esa hora. ¿Reservo contigo?`;
      const buttons = [{ id: 'time:otherpro', title: `✅ Con ${otherPro.name}`.slice(0, 20) }];
      if (sameDay && sameDay.start !== diagnosis.exact.start) {
        buttons.push({ id: 'time:nearest', title: `🕐 ${Utils.formatTimeLocal(sameDay.start, tz)}`.slice(0, 20) });
      }
      buttons.push({ id: 'time:other', title: '🕐 Otra hora' });
      return whatsappService.sendButtons(conv.waId, message, buttons.slice(0, 3));
    }

    if (sameDay) {
      const proId = this.#pickSuggestionProfessional(ctx, sameDay);
      ctx.suggestion = {
        type: 'slot',
        start: sameDay.start,
        date: diagnosis.date,
        professionalId: proId,
        reason: diagnosis.reason,
      };
      ctx.flow = 'time_choice';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      message += `La hora más cercana disponible es *${Utils.formatTimeLocal(sameDay.start, tz)}*. ¿Te sirve?`;
      const buttons = [{ id: 'time:nearest', title: `✅ ${Utils.formatTimeLocal(sameDay.start, tz)}`.slice(0, 20) }];
      if (nextDay?.slot) {
        buttons.push({ id: 'time:nextday', title: `📅 ${Utils.formatDayLabel(nextDay.date).split(',')[0]}`.slice(0, 20) });
      }
      buttons.push({ id: 'time:other', title: '🕐 Otra hora' });
      return whatsappService.sendButtons(conv.waId, message, buttons.slice(0, 3));
    }

    if (nextDay?.slot) {
      ctx.suggestion = this.#suggestionFromNextDay(ctx, nextDay);
      ctx.flow = 'time_choice';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      message +=
        `No queda cupo ese día. La opción más cercana es *${Utils.formatDayLabel(nextDay.date)}* ` +
        `a las *${Utils.formatTimeLocal(nextDay.slot.start, tz)}*. ¿Te sirve?`;
      return whatsappService.sendButtons(conv.waId, message, [
        { id: 'time:nextday', title: '✅ Sí, esa' },
        { id: 'time:other', title: '🕐 Otra hora' },
      ]);
    }

    ctx.flow = 'time_choice';
    delete ctx.suggestion;
    await dbService.upsertConversation(conv.phone, { context: ctx });
    message +=
      'No encontré otra hora disponible ese día ni en los próximos días. 😔 ' +
      'Puedes probar con otro profesional u otro servicio.';
    return whatsappService.sendButtons(conv.waId, message, [
      { id: 'time:other', title: '🕐 Otra hora' },
      { id: 'menu', title: '🏠 Menú' },
    ]);
  }

  #pickSuggestionProfessional(ctx, entry) {
    const chosen = ctx.current?.professional;
    if (chosen && (entry.professionalIds || []).includes(chosen.id)) return chosen.id;
    return entry.professionalIds?.[0] || chosen?.id || null;
  }

  #suggestionFromNextDay(ctx, next) {
    const entry = next.slot;
    const proId = this.#pickSuggestionProfessional(ctx, entry);
    return {
      type: 'next_day',
      start: entry.start,
      date: next.date,
      professionalId: proId,
      reason: 'next_day',
    };
  }

  async #timeChoiceStep(conv, ctx, text) {
    const clean = String(text ?? '').trim();
    const n = norm(clean);

    if (clean === 'time:otherpro' || clean === 'time:nearest' || clean === 'time:anypro') {
      return this.#acceptSuggestion(conv, ctx);
    }
    if (clean === 'time:nextday') {
      return this.#acceptSuggestion(conv, ctx);
    }
    if (clean === 'time:other' || /^(otra|cambiar|no|mejor no|otra hora)$/.test(n)) {
      ctx.flow = 'slot';
      delete ctx.suggestion;
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return whatsappService.sendMessage(
        conv.waId,
        menu.buildSlotMenu(this.#fullSlots(ctx), ctx.tenant.timezone),
      );
    }
    if (/^(si|sí|dale|ok|okay|esa|acepto|confirmo|reserva|reservala|resérvala)$/.test(n)) {
      return this.#acceptSuggestion(conv, ctx);
    }

    const timeReq = parseTimeRequest(clean, { context: 'slot' });
    if (timeReq.kind !== 'none') {
      ctx.flow = 'slot';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return this.#handleTimeRequest(conv, ctx, timeReq);
    }
    const dayReq = parseDayRequest(clean, { today: todayInZone(ctx.tenant.timezone) });
    if (dayReq) {
      ctx.flow = 'day';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return this.#dayStep(conv, ctx, clean);
    }
    await whatsappService.sendMessage(
      conv.waId,
      'Elige una de las opciones o dime otra hora (ej. *3:30 pm*, *mañana a las 10*). 🙂',
    );
  }

  async #acceptSuggestion(conv, ctx) {
    const suggestion = ctx.suggestion;
    if (!suggestion) {
      ctx.flow = 'slot';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return whatsappService.sendMessage(
        conv.waId,
        menu.buildSlotMenu(this.#fullSlots(ctx), ctx.tenant.timezone),
      );
    }
    if (suggestion.type === 'next_day' || Utils.localDate(suggestion.start, ctx.tenant.timezone) !== ctx.current.day) {
      ctx.flow = 'slot';
      delete ctx.suggestion;
      return this.#loadSlotsForDay(conv, ctx, suggestion.date, null, suggestion.start);
    }
    const professional = this.#resolveProfessional(ctx, suggestion.professionalId);
    const entry = (ctx.dayAvailability?.available || []).find((e) => e.start === suggestion.start)
      || {
        start: suggestion.start,
        end: suggestion.start,
        timezone: ctx.tenant.timezone,
        professionalIds: professional ? [professional.id] : [],
        professionalNames: professional ? [professional.name] : [],
      };
    if (professional) ctx.current.professional = professional;
    return this.#selectSlot(conv, ctx, entry, suggestion.professionalId);
  }

  async #selectSlot(conv, ctx, entry, professionalId = null) {
    const professional = this.#resolveProfessional(ctx, professionalId || entry?.professionalIds?.[0]);
    if (!professional) {
      await whatsappService.sendMessage(conv.waId, 'No pude identificar al profesional. Elige otro, por favor. 🙁');
      return;
    }
    ctx.current.professional = professional;
    ctx.current.anyProfessional = false;
    ctx.current.slotStart = entry.start;
    const localDate = Utils.localDate(entry.start, ctx.tenant.timezone);
    if (localDate) ctx.current.day = localDate;
    ctx.flow = 'confirm';
    delete ctx.pendingTime;
    delete ctx.suggestion;
    delete ctx.lastUnavailable;
    await dbService.upsertConversation(conv.phone, { context: ctx });
    const when = Utils.formatSlotLocal(entry.start, ctx.tenant.timezone);
    const summary =
      `*Confirma tu reserva* 📋\n\n` +
      `🏪 Negocio: ${ctx.tenant.name}\n` +
      `💈 Servicio: ${ctx.current.serviceName}\n` +
      `🧑‍🔬 Profesional: ${professional.name}\n` +
      `🕐 Fecha: ${when}\n` +
      `💰 Precio: ${Utils.money(ctx.current.price, ctx.current.currency)}\n\n` +
      `¿Confirmas?`;
    await whatsappService.sendButtons(conv.waId, summary, [
      { id: 'confirm:yes', title: '✔️ Confirmar' },
      { id: 'confirm:no', title: '❌ Cancelar' },
    ]);
  }

  async #confirmStep(conv, ctx, text, messageId) {
    const clean = String(text ?? '').trim();
    const n = norm(clean);
    if (/^confirm:no$/i.test(clean) || /^(no|cancelar|mejor no)$/.test(n)) {
      await dbService.clearContext(conv.phone);
      await whatsappService.sendMessage(conv.waId, 'Listo, cancelamos. ¿Buscas algo más? 😉');
      return whatsappService.sendMessage(conv.waId, menu.buildMainMenu(conv.name, conv.city));
    }
    if (/^confirm:yes$/i.test(clean) || /^(si|sí|confirmar|confirmo|adelante|dale)$/.test(n)) {
      await this.#doBooking(conv, ctx, messageId);
      return;
    }
    if (/^(cambiar|otra hora|elegir otra|atras|volver|cambiar hora)$/.test(n)) {
      ctx.flow = 'slot';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return whatsappService.sendMessage(
        conv.waId,
        menu.buildSlotMenu(this.#fullSlots(ctx), ctx.tenant.timezone),
      );
    }
    // Si desde la confirmación escribe otra hora o día, lo llevamos al flujo
    // de selección sin perder el contexto de servicio/profesional.
    const timeReq = parseTimeRequest(clean, { context: 'slot' });
    if (timeReq.kind !== 'none') {
      ctx.flow = 'slot';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return this.#handleTimeRequest(conv, ctx, timeReq);
    }
    const dayReq = parseDayRequest(clean, { today: todayInZone(ctx.tenant.timezone) });
    if (dayReq) {
      ctx.flow = 'day';
      await dbService.upsertConversation(conv.phone, { context: ctx });
      return this.#dayStep(conv, ctx, clean);
    }
    await whatsappService.sendMessage(conv.waId, 'Responde con *Confirmar* o *Cancelar*, o dime otra hora (ej. *3:30 pm*).');
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
        await whatsappService.sendMessage(conv.waId, 'Ese horario acaba de ocuparse. Te busco la mejor alternativa. ⏰');
        const target = Utils.localMinutes(ctx.current.slotStart, ctx.tenant.timezone);
        ctx.flow = 'slot';
        await dbService.upsertConversation(conv.phone, { context: ctx });
        await this.#loadSlotsForDay(conv, ctx, ctx.current.day, {
          kind: 'exact',
          hour: Math.floor(target / 60),
          minute: target % 60,
          text: 'reselection',
        });
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
      if (data?.code === 'AVAILABILITY_CONFLICT') {
        await whatsappService.sendMessage(conv.waId, 'Ese horario acaba de ocuparse. Te busco la mejor alternativa. ⏰');
        const target = Utils.localMinutes(ctx.current.slotStart, ctx.tenant.timezone);
        ctx.flow = 'slot';
        await dbService.upsertConversation(conv.phone, { context: ctx });
        await this.#loadSlotsForDay(conv, ctx, ctx.current.day, {
          kind: 'exact',
          hour: Math.floor(target / 60),
          minute: target % 60,
          text: 'reselection',
        });
        return;
      }
      await whatsappService.sendMessage(conv.waId, 'No pudimos confirmar la reserva. Intenta con otro horario. 🙁');
      ctx.flow = 'slot';
      return this.#slotStep(conv, ctx, ' ');
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