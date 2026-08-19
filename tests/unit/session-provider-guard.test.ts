import { afterEach, describe, expect, it } from 'vitest';
import { setSessionProviderForTests } from '@/cms/actions/pipeline';

/**
 * `setSessionProviderForTests` no es como los demás `*ForTests` del proyecto: los otros
 * reinician estado, este **sustituye de dónde sale la sesión**. Llamarlo fuera de un test
 * convierte el guard de rol de SPEC §7.1 en decorativo, y bastaría con un import despistado
 * desde una ruta para conseguirlo.
 */

describe('el sustituto de sesión solo funciona en tests', () => {
  const original = process.env['NODE_ENV'];

  // `NODE_ENV` está tipado como solo lectura y se escribe a través del objeto: aquí hay que
  // cambiarlo de verdad, porque lo que se prueba es precisamente el comportamiento en otro
  // entorno.
  const setNodeEnv = (value: string): void => {
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = value;
  };

  afterEach(() => {
    setNodeEnv(original);
    setSessionProviderForTests(null);
  });

  it('fuera del entorno de test, lanza', () => {
    setNodeEnv('production');

    expect(() => setSessionProviderForTests(async () => null)).toThrow(/solo puede usarse/);
  });

  it('en el entorno de test, funciona', () => {
    expect(() => setSessionProviderForTests(async () => null)).not.toThrow();
  });
});
