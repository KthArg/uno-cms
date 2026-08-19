import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RUTAS_PUBLICAS, rutasDelPanel } from '../support/admin-routes';

/**
 * T-F-1 (issue #70): **los dos guards de `/admin` no pueden divergir.**
 *
 * ## Qué divergencia es la peligrosa, que no es la que parece
 *
 * Hay dos guards y no hacen lo mismo:
 *
 * - El **middleware** corre en edge y solo puede verificar la **firma** del JWT. Cubre
 *   `/admin` por prefijo, así que una ruta nueva queda protegida sola. Por ahí no se diverge.
 * - El **layout de `(panel)`** corre en Node y es el **autoritativo**: llama a `auth()` con la
 *   configuración completa, que comprueba el claim `pwdV` contra la base de datos (ADR-301).
 *   Es lo que expulsa a quien cambió su contraseña, a quien fue desactivado y a las cuentas
 *   borradas.
 *
 * La divergencia real es **una página colocada fuera del grupo `(panel)`**. Sirve la misma URL
 * —los grupos de rutas no aparecen en la dirección— y el middleware la protege igual, así que
 * a simple vista funciona: sin sesión redirige al login. Lo que pierde es la segunda
 * comprobación, y con ella todas las garantías de ADR-301: **una persona desactivada, o con la
 * contraseña ya cambiada, entraría con su cookie vieja durante siete días.**
 *
 * Ese fallo no lo detecta ningún test de "sin sesión redirige", porque sin sesión también
 * redirige. Por eso aquí se comprueba la estructura, y en el e2e se comprueba el
 * comportamiento con una sesión **invalidada**, que es el caso que los distingue.
 *
 * Se enumera el directorio en vez de listar rutas a mano: quedan cuatro pantallas por añadir en
 * este hito, y una lista escrita a mano estaría desactualizada en la primera.
 */

const MIDDLEWARE = readFileSync(
  fileURLToPath(new URL('../../middleware.ts', import.meta.url)),
  'utf8'
);

describe('#70 — los dos guards de /admin cubren lo mismo', () => {
  it('toda página del panel vive dentro del grupo que lleva el guard autoritativo', () => {
    const publicas = new Set(RUTAS_PUBLICAS.map((ruta) => ruta.url));

    const desprotegidas = rutasDelPanel()
      .filter((ruta) => !ruta.dentroDelGrupo && !publicas.has(ruta.url))
      .map((ruta) => `${ruta.fichero} → ${ruta.url}`);

    expect(
      desprotegidas,
      'estas páginas de /admin están fuera del grupo (panel), así que no pasan por el guard ' +
        'autoritativo: el middleware las protege de un anónimo, pero no expulsan a quien fue ' +
        'desactivado ni a quien cambió su contraseña (ADR-301).\n' +
        'Muévelas dentro de app/admin/(panel)/ o añádelas a RUTAS_PUBLICAS con su motivo.'
    ).toEqual([]);
  });

  it('el middleware cubre /admin por prefijo, no ruta a ruta', () => {
    // Si algún día alguien cambia esto por una lista de rutas, la primera pantalla nueva se
    // quedaría fuera del primer guard además de poder quedarse fuera del segundo.
    expect(MIDDLEWARE).toContain("path === '/admin' || path.startsWith('/admin/')");
  });

  it('la excepción del login es la única, y está justificada', () => {
    // La lista de rutas públicas del panel decide qué páginas se sirven sin sesión. Que crezca
    // sin que nadie lo note es exactamente cómo se abre un panel de administración.
    expect(RUTAS_PUBLICAS).toHaveLength(1);
    expect(RUTAS_PUBLICAS[0]?.url).toBe('/admin/login');
    expect(RUTAS_PUBLICAS[0]?.motivo.length).toBeGreaterThan(20);
  });

  it('se están enumerando rutas de verdad', () => {
    // Verificación del propio test: si la enumeración devolviera una lista vacía —porque
    // cambió la estructura de carpetas— todo lo de arriba pasaría sin comprobar nada.
    const rutas = rutasDelPanel();

    expect(rutas.length).toBeGreaterThanOrEqual(3);
    expect(rutas.map((ruta) => ruta.url)).toContain('/admin/login');
    expect(rutas.map((ruta) => ruta.url)).toContain('/admin');
  });
});
