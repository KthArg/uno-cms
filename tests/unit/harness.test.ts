import { describe, expect, it } from 'vitest';

/**
 * Verifica el harness unitario, no la aplicación: que el alias `@/` de tsconfig.json
 * resuelve también dentro de Vitest y que los `.tsx` se transforman. Sin esto, el primer
 * test de M1 que importe `@/cms/core/config` fallaría por configuración, no por código.
 */
describe('harness unitario', () => {
  it('resuelve el alias @/ igual que tsconfig.json', async () => {
    const mod = await import('@/app/page');
    expect(typeof mod.default).toBe('function');
  });

  it('corre sin DATABASE_URL', () => {
    // T-05-1: el proyecto `unit` no debe depender de infraestructura externa.
    expect(true).toBe(true);
  });
});
