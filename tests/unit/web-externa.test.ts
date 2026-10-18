import { describe, expect, it } from 'vitest';
import { ConfigError, defineConfig, s } from '@/cms/core/config';
import { webExterna } from '@/cms/core/web-externa';

/**
 * T-18-1 a T-18-3, T-18-8 y T-18-9: qué decide que la web vive fuera (spec 18, ADR-1200, #314).
 *
 * `webExterna()` recibe lo declarado y las dos variables por parámetro, así que aquí no se toca ni
 * `cms.config.ts` ni el entorno del proceso.
 */

const ORIGENES = 'https://mi-web.com';
const URL_COHERENTE = 'https://mi-web.com/';

describe('T-18-1 a T-18-3 — la declaración o la vista previa, y basta con una', () => {
  it('T-18-1: declarada y sin variables de vista previa, vive fuera', () => {
    // Es el caso de #314: un CMS para una web de fuera sin la vista previa remota puesta todavía.
    expect(webExterna(true, '', '')).toBe(true);
  });

  it('T-18-2: sin declarar y sin variables, no vive fuera', () => {
    expect(webExterna(false, '', '')).toBe(false);
  });

  it('T-18-3: sin declarar y con la vista previa coherente, vive fuera como hasta ahora', () => {
    expect(webExterna(false, URL_COHERENTE, ORIGENES)).toBe(true);
  });

  it('y sin declarar, la vista previa incoherente sigue sin contar (spec 08 §4.1)', () => {
    expect(webExterna(false, 'https://otra-web.com/', ORIGENES)).toBe(false);
  });
});

describe('T-18-8 y T-18-9 — `defineConfig`', () => {
  const minima = { siteName: 'X', singletons: { hero: s.object({ t: s.text({ label: 'T' }) }) } };

  it('T-18-8: sin declarar vale false, y declarada vale lo declarado', () => {
    expect(defineConfig(minima).webExterna).toBe(false);
    expect(defineConfig({ ...minima, webExterna: true }).webExterna).toBe(true);
    expect(defineConfig({ ...minima, webExterna: false }).webExterna).toBe(false);
  });

  it('T-18-9: algo que no es un booleano se rechaza nombrando el campo', () => {
    // Lo que escribiría quien monta el CMS en JavaScript, o con un `as`.
    for (const valor of ['false', 'true', 1, 0, null]) {
      expect(() => defineConfig({ ...minima, webExterna: valor as unknown as boolean })).toThrow(
        ConfigError
      );
      expect(() => defineConfig({ ...minima, webExterna: valor as unknown as boolean })).toThrow(
        /webExterna/
      );
    }
  });
});
