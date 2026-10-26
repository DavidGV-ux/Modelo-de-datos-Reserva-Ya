import { describe, expect, it } from 'vitest';

// Prueba intencionalmente incorrecta para demostrar que el pipeline
// detecta un cambio roto antes de llegar a main.
describe('demostración de CI', () => {
  it('falla a propósito para comprobar que el check bloquea el cambio', () => {
    const total = 2 + 2;
    expect(total).toBe(5);
  });
});
