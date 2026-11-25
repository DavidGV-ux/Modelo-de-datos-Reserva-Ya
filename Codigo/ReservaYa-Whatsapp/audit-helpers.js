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

const VERIFICATION_FAILURE_MESSAGES = {
  CODE_EXPIRED: '⏰ Tu código venció. Vuelve a la página de registro para generar uno nuevo.',
  NO_PENDING_REGISTRATION:
    'No encontramos un registro pendiente para este número. Usa el WhatsApp con el que te registraste o inicia el registro de nuevo en la web.',
  INVALID_CODE:
    'El código o token no es correcto. Cópialo exactamente como aparece en la página de registro y envíalo desde el mismo número de WhatsApp.',
  TOO_MANY_ATTEMPTS:
    'Hubo demasiados intentos fallidos. Vuelve a la página de registro para generar un código nuevo.',
};

function verificationFailureMessage(error) {
  const code = error?.response?.data?.error?.code || error?.code || '';
  return (
    VERIFICATION_FAILURE_MESSAGES[code] ||
    'No pudimos verificar tu cuenta en este momento. Inténtalo de nuevo desde la página de registro.'
  );
}

module.exports = { matchVerificationCode, verificationFailureMessage };
