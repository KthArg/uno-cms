import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/**
 * Abrir la landing desde un test e2e **sabiendo que es la landing** (#336).
 *
 * ## Por qué no basta con `page.goto('/')`
 *
 * Porque `goto` y `request.get` siguen las redirecciones sin decir nada. Con `webExterna: true`
 * en `cms.config.ts` (spec 18) la raíz lleva al panel, y un test escrito para la landing acaba
 * mirando la pantalla de login. Unos fallan con un mensaje que no apunta a la causa; otros
 * **pasan sin probar nada**: «un borrador no se asoma a la landing» busca su texto en el login,
 * no lo encuentra, y sale verde. Se vio en la primera instancia con la web fuera.
 *
 * Así que cada test de la landing pasa por aquí, y aquí se comprueba lo que todos daban por
 * hecho: que la ruta respondió ella misma, con un 200 y sin redirigir.
 */

/** Por qué falla, dicho de forma que lleve a la causa y no al síntoma. */
function noEsLaLanding(ruta: string, acabo: string): string {
  return (
    `«${ruta}» no sirvió la landing: ${acabo}. Si cms.config.ts declara \`webExterna: true\`, ` +
    'este despliegue no sirve landing y este test no aplica tal cual: hay que adaptarlo a lo que ' +
    'sí se sirve. Cómo, test a test: docs/DEVELOPER.md, «Los tests e2e de la landing, que tendrás ' +
    'que adaptar».'
  );
}

/** Navega a la landing en `ruta` y falla si la respuesta no fue ella misma, con un 200. */
export async function abrirLanding(page: Page, ruta = '/'): Promise<void> {
  const respuesta = await page.goto(ruta);
  const llegada = new URL(page.url()).pathname;

  expect(llegada, noEsLaLanding(ruta, `acabó en ${llegada}`)).toBe(ruta);
  expect(respuesta?.status(), noEsLaLanding(ruta, `respondió ${String(respuesta?.status())}`)).toBe(
    200
  );
}

/**
 * La respuesta de la landing en `ruta`, **sin seguir redirecciones**: para mirar sus cabeceras.
 *
 * Siguiéndola, una cabecera que falta en la raíz se leería en la página de destino.
 */
export async function pedirLanding(
  request: APIRequestContext,
  ruta = '/',
  opciones: { headers?: Record<string, string> } = {}
): Promise<APIResponse> {
  const respuesta = await request.get(ruta, { ...opciones, maxRedirects: 0 });

  expect(
    respuesta.status(),
    noEsLaLanding(
      ruta,
      `respondió ${String(respuesta.status())} ${respuesta.headers()['location'] ?? ''}`.trim()
    )
  ).toBe(200);

  return respuesta;
}
