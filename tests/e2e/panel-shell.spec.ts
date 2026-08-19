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
