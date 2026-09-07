import { describe, expect, it } from 'vitest';
import { defineConfig, s } from '@/cms/core/config';
import { SETTINGS_SCHEMAS } from '@/cms/core/esquemas-de-ajustes';

/**
 * T-243-1 y T-243-2: **la configuración no puede traer un valor que su propio esquema rechaza**
 * (issue #243, ADR-930).
 *
 * ## La incoherencia que cierra
 *
 * `SETTINGS_SCHEMAS.site` exige `siteName` no vacío. Ese esquema gobierna lo que se guarda desde
 * la pantalla de ajustes. Pero el valor **por defecto** —el que se usa mientras nadie ha guardado
 * nada— salía de `cms.config.ts` y no pasaba por él: un `siteName: ''` se aceptaba y llegaba a
 * `readSettings('site')` como si fuera válido.
 *
 * O sea que la misma cadena estaba prohibida por un camino y permitida por el otro. Importa poco
 * en la práctica —hay que escribirlo a mano— y importa que un CMS pensado para montarse sobre la
 * landing de otro acepte en silencio una configuración que su propia validación considera mala.
 */

const SECCION = s.object({ title: s.text({ label: 'Título', required: true }) });

function configuracionCon(siteName: string) {
  return () => defineConfig({ siteName, singletons: { hero: SECCION } });
}

describe('T-243-1 — el nombre del sitio pasa por el esquema de los ajustes', () => {
  it('una cadena vacía se rechaza al definir la configuración', () => {
    expect(configuracionCon('')).toThrow(/siteName/);
  });

  it('y una que solo tiene espacios, también', () => {
    // El esquema lleva `.trim()` antes del `.min(1)`, así que «   » es tan vacío como ''. Si la
    // validación se hiciera a mano con `length > 0`, este caso pasaría — es el que distingue
    // «usa el esquema» de «comprueba algo parecido».
    expect(configuracionCon('   ')).toThrow(/siteName/);
  });

  it('y una más larga que el máximo, también', () => {
    expect(configuracionCon('x'.repeat(121))).toThrow(/siteName/);
  });

  it('un nombre normal se acepta y llega entero', () => {
    // El caso feliz, que es el que da sentido a los tres de arriba: sin él, una validación que
    // rechazara todo también los pasaría.
    expect(defineConfig({ siteName: 'Mi sitio', singletons: { hero: SECCION } }).siteName).toBe(
      'Mi sitio'
    );
  });
});

describe('T-243-2 — y es el mismo esquema, no uno parecido', () => {
  it('lo que acepta la configuración es exactamente lo que acepta guardar', () => {
    /*
     * La invariante de verdad. Un test que comprobara «rechaza la cadena vacía» seguiría pasando
     * el día que alguien escriba la comprobación a mano con otro límite, y volvería a haber dos
     * verdades — que es el fallo que este issue describe.
     *
     * Aquí se recorren los casos por los dos caminos y se exige que coincidan.
     */
    for (const nombre of ['', '   ', 'x', 'Mi sitio', 'x'.repeat(120), 'x'.repeat(121)]) {
      const loAceptaGuardar = SETTINGS_SCHEMAS.site.safeParse({ siteName: nombre }).success;
      const loAceptaLaConfiguracion = (() => {
        try {
          defineConfig({ siteName: nombre, singletons: { hero: SECCION } });
          return true;
        } catch {
          return false;
        }
      })();

      expect(loAceptaLaConfiguracion, `discrepan para ${JSON.stringify(nombre)}`).toBe(
        loAceptaGuardar
      );
    }
  });
});
