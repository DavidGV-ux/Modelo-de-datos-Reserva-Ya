// Services/groqService.js - IA conversacional (Groq, fetch nativo)
const config = require('../config');
const Utils = require('../utils');

const SYSTEM_INTENT = `Eres el "motor de intención" del asistente de WhatsApp de ReservaYa (plataforma de reservas de servicios en Colombia: peluquerías, cafés, clínicas, restaurantes, etc.).
El usuario escribe en lenguaje natural. Devuelve ÚNICAMENTE un JSON válido sin texto adicional:

{
  "intent": "book" | "menu" | "appointments" | "help" | "city_change" | "chitchat",
  "category": "beauty" | "health" | "pets" | "food" | "bars_cafes" | "leisure" | "sports" | "education" | "home" | "shopping" | "events" | "other" | null,
  "business": "nombre del negocio mencionado o null",
  "city": "ciudad mencionada (ej. Bogotá, Medellín) o null",
  "maxPrice": numero en pesos o null,
  "currency": "COP" | "USD" | null,
  "reply": "respuesta corta y amable en español SOLO si intent es chitchat o help"
}

Reglas:
- "necesito un cafe con reserva por menos de 10.000 pesos" -> intent "book", category "bars_cafes", maxPrice 10000, currency COP.
- "quiero agendar un corte en bogota" -> intent "book", category "beauty", city "Bogotá".
- "mis citas" / "mis reservas" -> intent "appointments".
- "cambiar a medellin" / "soy de cali" -> intent "city_change", city "Medellín"/"Cali".
- "hola", "ayuda", "que haces" -> intent "help".
- Cualquier otra cosa sin intención accionable -> intent "chitchat" con reply breve.`;

class GroqService {
  async callCompletions({ messages, max_tokens = config.groq.maxTokens, temperature = config.groq.temperature }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.groq.intentTimeoutMs);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.groq.apiKey}`,
        },
        body: JSON.stringify({
          model: config.groq.model,
          messages,
          max_tokens,
          temperature,
        }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(`${response.status} ${body?.error?.message || 'Groq error'}`);
        err.status = response.status;
        throw err;
      }
      return body.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  parseJson(raw) {
    const match = String(raw ?? '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  sanitizeIntent(json) {
    const allowed = ['book', 'menu', 'appointments', 'help', 'city_change', 'chitchat'];
    const categories = [
      'beauty', 'health', 'pets', 'food', 'bars_cafes', 'leisure', 'sports',
      'education', 'home', 'shopping', 'events', 'other',
    ];
    const intent = allowed.includes(json.intent) ? json.intent : 'menu';
    return {
      intent,
      category: categories.includes(json.category) ? json.category : null,
      business: typeof json.business === 'string' ? json.business.trim().toLowerCase() : null,
      city: typeof json.city === 'string' ? json.city.trim() : null,
      maxPrice:
        typeof json.maxPrice === 'number' && json.maxPrice > 0 ? json.maxPrice : null,
      currency: json.currency === 'USD' ? 'USD' : json.currency === 'COP' ? 'COP' : null,
      reply: typeof json.reply === 'string' ? json.reply : '',
    };
  }

  fallbackIntent(text) {
    const lower = text.toLowerCase();
    if (/(mis citas|mis reservas|mis agendamientos|donde tengo)/.test(lower)) {
      return { intent: 'appointments', category: null, business: null, city: null, maxPrice: null, currency: null, reply: '' };
    }
    if (/(cambiar|soy de|ubicad|ciudad)/.test(lower) && /(bogot|medell|cali|barranquill|cartagena|pereira|bucaramanga|manizales)/.test(lower)) {
      const m = lower.match(/(bogot|medell|cali|barranquill|cartagena|pereira|bucaramanga|manizales)/);
      const city = m?.[0]?.replace(/bogot/, 'Bogotá')?.replace(/medell/, 'Medellín')?.replace(/barranquill/, 'Barranquilla') ?? '';
      return { intent: 'city_change', category: null, business: null, city, maxPrice: null, currency: null, reply: '' };
    }
    const maxPrice = lower.match(/menos de\s*([0-9.,]+)/i) || lower.match(/([0-9.,]+)\s*(mil|\$)/);
    const category = Utils.parseCategoryFromText(lower) || Utils.fuzzyCategoryFromText(lower);
    // La petición de búsqueda va ANTES del saludo/ayuda: "hola, necesito una
    // peluquería en Bogotá" debe clasificarse como book, no como help.
    if (category || /(reserva|agenda|necesito|quiero|busco|cita|turno|agendar|agendarme|disponible)/.test(lower)) {
      let city = null;
      const cm = lower.match(/(bogot|medell|cali|barranquill|cartagena|pereira|bucaramanga|manizales|cucuta|valledupar|ibague|pasto)/);
      if (cm) {
        city = cm[0].replace(/bogot/, 'Bogotá').replace(/medell/, 'Medellín').replace(/cali/i, 'Cali').replace(/barranquill/, 'Barranquilla').replace(/cartagena/i, 'Cartagena').replace(/pereira/i, 'Pereira').replace(/bucaramanga/i, 'Bucaramanga').replace(/manizales/i, 'Manizales');
      }
      return {
        intent: 'book',
        category,
        business: null,
        city,
        maxPrice: maxPrice ? Number(String(maxPrice[1]).replace(/[.,]/g, '')) : null,
        currency: maxPrice ? 'COP' : null,
        reply: '',
      };
    }
    if (/(hola|buenas|ayuda|ayudame|que haces|saludos)/.test(lower)) {
      return { intent: 'help', category: null, business: null, city: null, maxPrice: null, currency: null, reply: '' };
    }
    return { intent: 'menu', category: null, business: null, city: null, maxPrice: null, currency: null, reply: '' };
  }

  async extractIntent(text) {
    try {
      const raw = await this.callCompletions({
        messages: [
          { role: 'system', content: SYSTEM_INTENT },
          { role: 'user', content: text },
        ],
        max_tokens: 200,
        temperature: 0.1,
      });
      const json = this.parseJson(raw);
      if (json?.intent) return this.sanitizeIntent(json);
    } catch (err) {
      Utils.log('warn', `Groq intent falló (${err.message}); usaré regex`);
    }
    return this.fallbackIntent(text);
  }
}

module.exports = new GroqService();