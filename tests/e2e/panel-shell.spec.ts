import { expect, test } from '@playwright/test';
import { dejarSinPublicar } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * El panel renderizado de verdad (T-A-1, T-A-2).
 *
 * Estos casos no se pueden cubrir con tests de componentes: lo que hay que comprobar es que
 * la página **se renderiza** con una sesión real, incluyendo el paso de la Server Action al
 * componente de cliente, que es donde se rompe la frontera si está mal montada.
 */

test('el panel carga con sesión y lista las secciones', async ({ page }) => {
  await crearYEntrar(page, { email: 'panel-admin@ejemplo.com', role: 'admin' });

  await expect(page.getByRole('heading', { name: 'Contenido', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Portada/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toBeVisible();
});

test('T-A-2: publicar todo dice qué se quedó fuera', async ({ page }) => {
  // El estado, puesto por el test. Dar por hecho "el sitio arranca sin publicar" funciona
  // hasta que otro test publica algo, y entonces el botón desaparece y este falla por un
  // motivo que no tiene que ver con lo que prueba.
  // Un elemento de colección **propio de este test**: los singletons son tres y fijos, así
  // que usar uno se pisa con los tests del editor. Este no lo toca nadie más.
  dejarSinPublicar('testimonials.e2e-pendiente', { author: 'Ana' }, 'testimonials');

  await crearYEntrar(page, { email: 'panel-publica@ejemplo.com', role: 'admin' });

  // Con una sección pendiente, el botón tiene que estar.
  // La primera versión de este test lo envolvía en un `if (await boton.isVisible())`, y así
  // pasaba en verde **con la página rota** — que es peor que no tenerlo.
  const boton = page.getByRole('button', { name: 'Publicar todo' });
  await expect(boton).toBeVisible();

  await boton.click();

  // Lo que importa: sale un resumen, no un silencio. Publicar y no decir qué pasó manda al
  // editor a casa creyendo que su sitio está al día.
  await expect(page.locator('[aria-live="polite"]')).not.toBeEmpty();
});

/**
 * T-208-2 y T-208-3: **salir del panel** (issue #211).
 *
 * Hasta #211 no había forma de cerrar sesión desde ninguna pantalla. No lo cazó nada porque
 * `SPEC.md` no lo menciona —sin caso en la spec no hay caso en la suite— y porque **ningún e2e
 * termina de usar el panel**: cada uno abre un contexto limpio, entra, y se acaba ahí.
 *
 * Por eso este va al final del recorrido y no comprueba solo que se llega al acceso: comprueba
 * que la cookie **dejó de valer**. Con un `signOut` que no invalidara nada, lo primero pasaría
 * igual y lo segundo no.
 */
test('T-208-2 y T-208-3: al salir se cierra la sesión, y la cookie deja de valer', async ({
  page,
}) => {
  await crearYEntrar(page, { email: 'panel-salir@ejemplo.com', role: 'editor' });

  await page.getByRole('button', { name: 'Salir' }).click();

  // A la pantalla de acceso, no a la landing: quien sale del panel tiene que ver que salió.
  await expect(page).toHaveURL(/\/admin\/login/);

  // Y lo que de verdad decide. Volver a `/admin` con la misma pestaña: si la sesión siguiera
  // viva, entraría.
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: 'Contenido', level: 1 })).toHaveCount(0);
});
