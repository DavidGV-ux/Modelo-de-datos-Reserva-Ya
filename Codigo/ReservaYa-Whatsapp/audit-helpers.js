'use strict';

// El mensaje entrante sólo cuenta como código si es exactamente un código de 6 dígitos
// (se ignoran espacios y texto como "pedido 123456" que antes disparaban falsos positivos).
function matchVerificationCode(messageBody) {
  return String(messageBody || '').trim().match(/^\d{6}$/);
}

module.exports = { matchVerificationCode };
