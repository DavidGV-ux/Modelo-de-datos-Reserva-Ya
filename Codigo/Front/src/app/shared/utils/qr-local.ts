import qrcode from 'qrcode-generator';

/**
 * Construye el enlace de WhatsApp con el mensaje de verificación.
 * El OTP viaja únicamente a WhatsApp, elegido por el usuario; nunca a un
 * servicio de generación de QR de terceros.
 */
export function buildWhatsappDeepLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** QR generado en el navegador: al escanearlo se abre el chat con el mensaje listo. */
export function buildQrDataUrl(deepLink: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(deepLink);
  qr.make();
  return qr.createDataURL(4, 2);
}
