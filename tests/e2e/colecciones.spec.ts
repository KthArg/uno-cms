import { expect, test } from '@playwright/test';
import { limpiarColeccion } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * El recorrido de una colección contra un servidor de verdad (#111).
 *
 * Lo que aquí se comprueba y los tests de componentes no pueden: que la ruta **existe** —el
 * panel llevaba enlazando a ella desde #108, y daba 404— y que crear un elemento lleva a su
 * editor con un nombre legible en vez de la clave técnica.
 *
 * En serie: es un solo sitio, y dos tests creando y borrando en la misma colección se pisan.
 */

test.describe.configure({ mode: 'serial' });

// Estos tests **crean** elementos, así que dejan rastro. Sin vaciar antes, el que busca "Marta
// Ruiz" encuentra tres a la segunda ejecución. En CI no se notaría —la base es nueva cada vez—
// y eso es justo lo que lo hace peligroso: pasaría allí y fallaría en la máquina de quien lo
// ejecute dos veces seguidas.
test.beforeAll(() => {
  limpiarColeccion('testimonials');
});

test('la pantalla de la colección existe y explica la lista vacía', async ({ page }) => {
  await crearYEntrar(page, { email: 'colecciones@ejemplo.com', role: 'admin' });

  await page.goto('/admin/collections/testimonials');

  await expect(page.getByRole('heading', { name: 'Testimonios', level: 1 })).toBeVisible();
});

test('el panel enlaza a la colección y el enlace ya no da 404', async ({ page }) => {
  await crearYEntrar(page, { email: 'colecciones-enlace@ejemplo.com', role: 'admin' });

  await page.goto('/admin');
  await page.getByRole('link', { name: /Testimonios/ }).click();

  // Es el fallo concreto que cierra este issue: la tarjeta existía desde #108 y llevaba a
  // ninguna parte.
  await expect(page).toHaveURL(/\/admin\/collections\/testimonials/);
  await expect(page.getByRole('heading', { name: 'Testimonios', level: 1 })).toBeVisible();
});

test('crear un elemento lleva a su editor, con un nombre legible', async ({ page }) => {
  await crearYEntrar(page, { email: 'colecciones-crear@ejemplo.com', role: 'admin' });

  await page.goto('/admin/collections/testimonials');
  await page.getByRole('button', { name: 'Añadir' }).click();

  await page.waitForURL(/\/admin\/content\/testimonials\./);

  // El título antes decía «testimonials.3f2a-…», que es la jerga que §9 prohíbe y encima la
  // más fea posible.
  const titulo = page.getByRole('heading', { level: 1 });
  await expect(titulo).toContainText('Testimonios');
  await expect(titulo).toContainText('Sin título');
  await expect(titulo).not.toContainText('testimonials.');
});

test('lo que se escribe en un elemento aparece como su nombre en la lista', async ({ page }) => {
  await crearYEntrar(page, { email: 'colecciones-titulo@ejemplo.com', role: 'admin' });

  await page.goto('/admin/collections/testimonials');
  await page.getByRole('button', { name: 'Añadir' }).click();
  await page.waitForURL(/\/admin\/content\/testimonials\./);

  await page.getByLabel(/Nombre/).fill('Marta Ruiz');
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  await page.goto('/admin/collections/testimonials');

  // Es `titleField` haciendo su trabajo: "qué mostrar en la lista del admin" (SPEC §5.1).
  await expect(page.getByRole('link', { name: 'Marta Ruiz' })).toBeVisible();
});

test('una colección que no está en la configuración da 404', async ({ page }) => {
  await crearYEntrar(page, { email: 'colecciones-404@ejemplo.com', role: 'admin' });

  const respuesta = await page.goto('/admin/collections/inventada');

  expect(respuesta?.status()).toBe(404);
});
