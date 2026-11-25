import { describe, expect, it } from 'vitest';
import { isSupportedLogoFile, logoErrorKind } from './image-compression';

describe('logo: formatos y mensajes de error', () => {
  it('solo acepta PNG, JPG y WebP', () => {
    const file = (type: string) => new File([], `logo.${type}`, { type });
    expect(isSupportedLogoFile(file('image/png'))).toBe(true);
    expect(isSupportedLogoFile(file('image/jpeg'))).toBe(true);
    expect(isSupportedLogoFile(file('image/webp'))).toBe(true);
    expect(isSupportedLogoFile(file('image/svg+xml'))).toBe(false);
    expect(isSupportedLogoFile(file('image/gif'))).toBe(false);
  });

  it('traduce cada fallo de compresión a una clave de error concreta', () => {
    expect(logoErrorKind(new Error('unsupported_type'))).toBe('type');
    expect(logoErrorKind(new Error('invalid_image'))).toBe('type');
    expect(logoErrorKind(new Error('image_too_small'))).toBe('small');
    expect(logoErrorKind(new Error('file_too_large'))).toBe('size');
    expect(logoErrorKind(new Error('output_too_large'))).toBe('size');
    expect(logoErrorKind(new Error('canvas_unavailable'))).toBe('generic');
  });
});
