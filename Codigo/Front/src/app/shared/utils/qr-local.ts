/**
 * Construye el enlace de WhatsApp con el mensaje de verificación.
 * El OTP viaja únicamente a WhatsApp, elegido por el usuario; nunca a un
 * servicio de generación de QR de terceros.
 */
// shortcut: sin QR local (un codificador byte-mode con Reed-Solomon superaría las 120 líneas); se muestra el código en texto y un enlace wa.me, upgrade si se exige QR visual con librería auditada.
export function buildWhatsappDeepLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
