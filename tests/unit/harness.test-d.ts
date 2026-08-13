import { describe, expectTypeOf, it } from 'vitest';

/**
 * T-05-3: comprueba que los tests de tipos se ejecutan de verdad.
 *
 * M1 depende de esto: la inferencia de `cms.config.ts` (SPEC §5.1, `Content<'hero'>`) solo
 * puede verificarse con `expectTypeOf`, y un runner de tipos mal configurado da verde sin
 * comprobar nada.
 */
describe('harness de tipos', () => {
  it('distingue tipos que en runtime serían idénticos', () => {
    type Singleton = { readonly title: string; readonly subtitle?: string };

    expectTypeOf<Singleton>().toHaveProperty('title');
    expectTypeOf<Singleton['title']>().toEqualTypeOf<string>();
    expectTypeOf<Singleton['title']>().not.toEqualTypeOf<string | undefined>();
    expectTypeOf<Singleton['subtitle']>().toEqualTypeOf<string | undefined>();
  });
});
