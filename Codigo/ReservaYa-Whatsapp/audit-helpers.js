'use strict';

// Acepta el código exacto de 6 dígitos (legacy) o el mensaje predefinido del
// deep link, que trae un token RY-... firmado por el Back. No acepta texto
// ajeno que simplemente contenga 6 dígitos (evita falsos positivos).
function matchVerificationCode(messageBody) {
  const text = String(messageBody || '').trim();
  const exact = text.match(/^\d{6}$/);
  if (exact) return exact;
  const deepLink = text.match(/^ReservaYa:[\s\S]*\b(RY-[0-9a-f]{12})\b/i);
  return deepLink ? [deepLink[1]] : null;
}

module.exports = { matchVerificationCode };
