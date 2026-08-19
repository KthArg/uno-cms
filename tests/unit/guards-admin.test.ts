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

  it('las excepciones son exactamente estas dos, y las dos están justificadas', () => {
    // La lista de rutas públicas del panel decide qué páginas se sirven sin sesión. Que crezca
    // sin que nadie lo note es exactamente cómo se abre un panel de administración, así que se
    // fija el conjunto entero: añadir una obliga a pasar por aquí y a decir cuál y por qué.
    expect(RUTAS_PUBLICAS.map((ruta) => ruta.url).sort()).toEqual([
      '/admin/invitacion',
      '/admin/login',
    ]);

    // Y el motivo tiene que ser una explicación, no una palabra. Un umbral bajo dejaría pasar
    // "hace falta", que no dice nada a quien lo lea dentro de un año.
    for (const ruta of RUTAS_PUBLICAS) {
      expect(ruta.motivo.length).toBeGreaterThan(40);
    }
  });

  it('el middleware y este test miran la MISMA lista', () => {
    // Dos copias permitirían abrir una ruta en el middleware sin tocar el test: la página se
    // quedaría sin guard y el test seguiría en verde. Por eso el middleware no puede tener su
    // propia condición para el acceso.
    expect(MIDDLEWARE).toContain('esRutaPublicaDelPanel(path)');
    expect(MIDDLEWARE).not.toContain("path === '/admin/login'");
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

/**
 * T-E-4: el rol se comprueba **en la ruta**, no solo en el menú.
 *
 * El layout de `(panel)` comprueba que haya sesión. Lo que no puede comprobar es el rol, porque
 * no todas las pantallas piden lo mismo, así que cada página de administración tiene que
 * cerrarse ella. Esconder su entrada del menú se parece mucho a protegerla y no protege nada:
 * la dirección se escribe a mano.
 *
 * El e2e comprueba que `/admin/users` y `/admin/settings` responden 404 a un editor. Esto es lo
 * que cubre **la siguiente** pantalla de administración que alguien añada: si no declara qué
 * acceso pide, el test falla; si declara que es de administración y no llama a `soloAdmin()`,
 * también.
 */
describe('T-E-4 — cada pantalla del panel declara qué acceso pide', () => {
  /**
   * El acceso de cada pantalla, con su motivo.
   *
   * Escribir el motivo no es burocracia: es lo que obliga a pensar si una pantalla nueva enseña
   * algo que un editor no debería ver. `sesion` significa "cualquiera que haya entrado".
   */
  const ACCESO: Record<string, { nivel: 'sesion' | 'solo-admin'; motivo: string }> = {
    '/admin': {
      nivel: 'sesion',
      motivo: 'El listado de secciones es el trabajo diario de quien escribe.',
    },
    '/admin/content/hero': {
      nivel: 'sesion',
      motivo: 'Editar y publicar contenido es exactamente lo que hace el rol editor.',
    },
    '/admin/collections/hero': {
      nivel: 'sesion',
      motivo:
        'Lo mismo que el editor: la colección es contenido. Eliminar sí pide admin, y eso lo comprueba la action.',
    },
    '/admin/history/hero': {
      nivel: 'sesion',
      motivo:
        'Volver a una versión anterior escribe en el borrador, que es lo que ya puede hacer un editor.',
    },
    '/admin/media': {
      nivel: 'sesion',
      motivo:
        'Subir imágenes es parte de escribir. Borrarlas pide admin, y eso lo comprueba la action.',
    },
    '/admin/account': {
      nivel: 'sesion',
      motivo:
        'Cada cual cambia la suya. El objetivo sale de la sesión, no de la entrada, así que no hay forma de tocar la de otra persona.',
    },
    '/admin/users': {
      nivel: 'solo-admin',
      motivo:
        'Enseña todas las cuentas y permite invitar y quitar acceso. Un editor que la abriera vería el equipo entero y podría dar acceso a quien quisiera.',
    },
    '/admin/settings': {
      nivel: 'solo-admin',
      motivo:
        'No es contenido: cambia cómo se comporta el sitio entero, y tiene efecto inmediato sin publicar.',
    },
    '/admin/login': {
      nivel: 'sesion',
      motivo:
        'Es pública y está declarada como tal en cms/routes.ts; aquí solo consta para que la lista esté completa.',
    },
    '/admin/invitacion': {
      nivel: 'sesion',
      motivo:
        'Es pública y está declarada como tal en cms/routes.ts; lo que autoriza es el enlace firmado, no una sesión.',
    },
  };

  it('ninguna pantalla se queda sin declarar', () => {
    const sinDeclarar = rutasDelPanel()
      .map((ruta) => ruta.url)
      .filter((url) => !(url in ACCESO));

    expect(sinDeclarar, 'Declara el acceso de estas pantallas en ACCESO, con su motivo.').toEqual(
      []
    );
  });

  it('lo declarado como de administración llama al guard de rol', () => {
    const sinGuard = rutasDelPanel()
      .filter((ruta) => ACCESO[ruta.url]?.nivel === 'solo-admin')
      .filter((ruta) => !readFileSync(ruta.fichero, 'utf8').includes('soloAdmin()'))
      .map((ruta) => ruta.fichero);

    // Que la pantalla no ofrezca los botones no basta: la página se sirve entera al pedirla.
    expect(sinGuard, 'Estas pantallas dicen ser de administración y no cierran la puerta.').toEqual(
      []
    );
  });

  it('y hay al menos una de administración, o esto no prueba nada', () => {
    const deAdmin = Object.values(ACCESO).filter((acceso) => acceso.nivel === 'solo-admin');

    expect(deAdmin.length).toBeGreaterThan(0);
    for (const acceso of Object.values(ACCESO)) {
      expect(acceso.motivo.length).toBeGreaterThan(40);
    }
  });
});
