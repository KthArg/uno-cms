import { expect, test } from '@playwright/test';
import { crearYEntrar } from './support/session';

/**
 * El editor de una entrada, contra un servidor y un navegador de verdad.
 *
 * Aquí van los casos que los tests de componentes **no pueden** cubrir:
 *
 * - Que la Server Action llegue al servidor y vuelva. Un componente montado con Testing
 *   Library nunca cruza esa frontera, y ahí es donde se rompió el panel en #108.
 * - Que el cursor se quede donde el editor lo dejó. jsdom no maqueta, así que ProseMirror no
 *   puede situar el punto de inserción: allí todo lo tecleado entra al principio del
 *   documento, con y sin el código que se quería probar (#121).
 *
 * ## En serie, y no por comodidad
 *
 * Un CMS acoplado 1:1 a una landing es **un solo sitio**: no hay forma de darle a cada test su
 * propia sección `hero`. En paralelo, dos tests editando la misma sección son dos editores
 * peleándose por ella, y el segundo recibe un `VERSION_CONFLICT` — que es el comportamiento
 * correcto y no lo que estos casos quieren medir.
 *
 * Lo aprendí al primer intento: el test de guardado falló con el aviso de conflicto en
 * pantalla, y el aviso decía exactamente la verdad.
 */

test.describe.configure({ mode: 'serial' });

test('el editor carga, guarda solo y lo dice', async ({ page }) => {
  await crearYEntrar(page, { email: 'editor-e2e@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/hero');
  await expect(page.getByRole('heading', { name: 'Portada', level: 1 })).toBeVisible();

  await page.getByLabel(/Título principal/).fill('Bienvenidos a mi empresa');

  // El indicador es la única señal de que el trabajo está a salvo (SPEC §8).
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  // Y sobrevive a una recarga: es lo que demuestra que llegó a la base de datos y no se quedó
  // en el estado de React.
  await page.reload();
  await expect(page.getByLabel(/Título principal/)).toHaveValue('Bienvenidos a mi empresa');
});

test('publicar dice que se ha publicado', async ({ page }) => {
  await crearYEntrar(page, { email: 'editor-publica@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/hero');
  await page.getByLabel(/Título principal/).fill('Un título publicable');
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Publicar cambios' }).click();

  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });
});

test('publicar sin un campo obligatorio dice cuál y dónde', async ({ page }) => {
  await crearYEntrar(page, { email: 'editor-valida@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/about');
  // `about.heading` es obligatorio: se vacía para provocar el aviso.
  await page.getByLabel(/Encabezado/).fill('');
  await page.getByRole('button', { name: 'Publicar cambios' }).click();

  // SPEC §9: "Falta el Título principal en Portada". Nombre del campo y de la sección, nunca
  // la clave técnica.
  await expect(page.getByText(/Falta Encabezado en Sobre nosotros/)).toBeVisible({
    timeout: 10_000,
  });
});

test('#121: el cursor se queda donde el editor lo dejó', async ({ page }) => {
  // El caso que jsdom no puede comprobar. Con navegador de verdad sí hay maquetación, así que
  // ProseMirror sitúa el punto de inserción y se puede escribir en medio de un párrafo.
  await crearYEntrar(page, { email: 'editor-cursor@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/about');

  const cuerpo = page.locator('#campo-body');
  await cuerpo.click();
  await page.keyboard.type('hola mundo');

  // Se coloca el cursor detrás de «hola» y se escribe: el texto tiene que quedar ahí, no al
  // principio del documento.
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' cruel');

  await expect(cuerpo).toContainText('hola cruel mundo');
});

test('una clave que no existe da 404', async ({ page }) => {
  await crearYEntrar(page, { email: 'editor-404@ejemplo.com', role: 'admin' });

  const respuesta = await page.goto('/admin/content/inventada');

  expect(respuesta?.status()).toBe(404);
});
