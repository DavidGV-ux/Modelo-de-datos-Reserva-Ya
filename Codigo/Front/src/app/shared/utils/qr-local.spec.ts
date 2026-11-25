import { buildQrDataUrl, buildWhatsappDeepLink } from './qr-local';

describe('buildWhatsappDeepLink', () => {
  const phone = '573123054870';
  const code = '123456';
  const message = `Tu código de verificación es ${code}`;

  it('genera solo un enlace wa.me, sin dominios de terceros', () => {
    const url = buildWhatsappDeepLink(phone, message);
    const parsed = new URL(url);

    expect(url).toContain('https://wa.me/');
    expect(parsed.protocol).toBe('https:');
    expect(parsed.host).toBe('wa.me');
    expect(parsed.pathname).toBe(`/${phone}`);
  });

  it('codifica el OTP en el parámetro text del enlace wa.me', () => {
    const url = buildWhatsappDeepLink(phone, message);
    const parsed = new URL(url);

    expect(`${parsed.origin}${parsed.pathname}`).toBe(`https://wa.me/${phone}`);
    expect(parsed.searchParams.get('text')).toBe(message);
    expect(parsed.searchParams.get('text')).toContain(code);
  });

  it('genera el QR localmente como imagen del deep link, sin servicios de terceros', () => {
    const url = buildWhatsappDeepLink(phone, message);

    const dataUrl = buildQrDataUrl(url);

    expect(dataUrl).toMatch(/^data:image\/(png|gif);base64,/);
    expect(dataUrl.length).toBeGreaterThan(200);
  });
});
