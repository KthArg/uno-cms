import { describe, expect, it } from 'vitest';
import { ACCESO_DECLARADO, compruebaSesion, leerFuente, rutasDeApi } from '../support/api-routes';

/**
 * El nivel de acceso de cada ruta de `/api` (issue #104, viene de la revisión de #126).
 *
 * Los guards de #70 vigilan `/admin`. Una ruta bajo `/api` **no pasa por el middleware**: se
 * protege sola. Eso es correcto —hay rutas públicas a propósito— pero deja el nivel de acceso
 * como una decisión suelta que no vigila nadie, y **una ruta nueva es pública por omisión**.
 *
 * Aquí cada una tiene que estar declarada con su motivo, y lo declarado tiene que coincidir con
 * lo que hace el código.
 */

describe('#104 — toda ruta de /api declara su nivel de acceso', () => {
  it('no hay ninguna ruta sin declarar', () => {
    const sinDeclarar = rutasDeApi()
      .filter((ruta) => !(ruta.url in ACCESO_DECLARADO))
      .map((ruta) => `${ruta.fichero} → ${ruta.url}`);

    expect(
      sinDeclarar,
      'estas rutas de API no dicen si son públicas o exigen sesión.\n' +
        'Decláralas en tests/support/api-routes.ts con su motivo: una ruta sin declarar es ' +
        'pública por omisión, y eso no puede decidirlo un olvido.'
    ).toEqual([]);
  });

  it('lo declarado coincide con lo que hace el código', () => {
    const discrepancias: string[] = [];

    for (const ruta of rutasDeApi()) {
      const declarado = ACCESO_DECLARADO[ruta.url];
      if (declarado === undefined) continue;

      const comprueba = compruebaSesion(leerFuente(ruta.fichero));

      if (declarado.nivel === 'con-sesion' && !comprueba) {
        discrepancias.push(`${ruta.url} se declara con sesión y no la comprueba`);
      }
      if (declarado.nivel === 'publica' && comprueba) {
        // También al revés: una ruta declarada pública que empieza a comprobar sesión es una
        // decisión que cambió sin que la declaración se enterara.
        discrepancias.push(`${ruta.url} se declara pública y comprueba sesión`);
      }
    }

    expect(discrepancias).toEqual([]);
  });

  it('cada declaración explica por qué', () => {
    // Esta lista decide qué partes de la API responden a cualquiera. Una entrada sin
    // explicación es una decisión que nadie recuerda haber tomado.
    for (const [url, declarado] of Object.entries(ACCESO_DECLARADO)) {
      expect(declarado.motivo.length, url).toBeGreaterThan(40);
    }
  });

  it('se están enumerando rutas de verdad', () => {
    // Si la enumeración devolviera una lista vacía, todo lo de arriba pasaría sin comprobar
    // nada.
    const urls = rutasDeApi().map((ruta) => ruta.url);

    expect(urls).toContain('/api/health');
    expect(urls).toContain('/api/media/upload');
  });
});
