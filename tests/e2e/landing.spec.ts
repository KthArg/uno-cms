import { expect, test } from '@playwright/test';

/**
 * T-G-5 y T-G-6: la landing pública contra un servidor de verdad (SPEC §6.3, §8).
 *
 * ## Lo que este fichero comprueba y lo que deja a otros
 *
 * Aquí va lo que solo se ve con un navegador: que la página se sirva sin errores y que **el
 * visitante no abra ninguna petición de datos**, que es la forma observable del "el visitante
 * nunca toca la BD en el hot path" de §8.
 *
 * Lo que **no** está aquí, y por qué:
 *
 * - **Que la landing renderice con la base vacía** (T-G-5) se comprueba con los componentes,
 *   montándolos con un proveedor sin contenido. Forzar aquí una base vacía significaría dejar
 *   sin publicar todas las secciones, y de eso viven los tests del editor, del panel y de la
 *   ruta pública. Un test que rompe a los otros ocho ficheros para probar su caso no prueba su
 *   caso: prueba que puede romperlos.
 * - **Que publicar cambie lo que sirve la landing** es T-K-2, y llega en #116. Es lo que ADR-405
 *   dejó pendiente y necesita la vista previa montada para ejercitarse entera.
 */

test('T-G-6: el navegador no pide datos, ni una vez', async ({ page }) => {
  const peticionesDeDatos: string[] = [];

  page.on('request', (peticion) => {
    // Documento, hojas de estilo, scripts e imágenes son la página; `fetch` y `xhr` serían
    // datos. Es la distinción que importa: §8 no prohíbe descargar la página, prohíbe que el
    // contenido venga en un viaje aparte.
    if (peticion.resourceType() === 'fetch' || peticion.resourceType() === 'xhr') {
      peticionesDeDatos.push(`${peticion.resourceType()} ${peticion.url()}`);
    }
  });

  const respuesta = await page.goto('/');
  expect(respuesta?.status()).toBe(200);

  // Se espera a que la página quede quieta: sin esto, el test podría pasar por mirar demasiado
  // pronto, que es la forma más común de que un test de red no pruebe nada.
  await page.waitForLoadState('networkidle');

  expect(peticionesDeDatos).toEqual([]);
});

test('la landing se sirve sin errores de cliente', async ({ page }) => {
  const errores: string[] = [];

  page.on('pageerror', (error) => errores.push(error.message));
  page.on('console', (mensaje) => {
    if (mensaje.type() === 'error') errores.push(mensaje.text());
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Una sección que revienta en el navegador deja el resto de la página muerta y no se nota
  // mirando el HTML: React desmonta el árbol y el servidor ya ha respondido 200.
  expect(errores).toEqual([]);
  await expect(page.locator('main')).toBeVisible();
});
