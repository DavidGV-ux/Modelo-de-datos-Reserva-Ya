import { describe, expect, it } from 'vitest';

// Prueba de humo que quedó después de corregir el error intencional:
// primero falló con "expected 4 to be 5" y ahora debe pasar.
describe('demostración de CI', () => {
  it('confirma que el pipeline vuelve a verde después de la corrección', () => {
    const total = 2 + 2;
    expect(total).toBe(4);
  });
});
