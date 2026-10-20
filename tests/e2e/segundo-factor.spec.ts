import { expect, test } from '@playwright/test';
import { codigoTotp } from '../../cms/segundo-factor';
import { CONTRASENA, crearYEntrar } from './support/session';

/**
 * T-V-9 y T-V-16: la verificación en dos pasos, en un navegador de verdad (spec 20).
 *
 * Lo que solo se ve aquí: que el middleware y el layout de verdad mandan una sesión a medio entrar
 * a darla de alta, y que el recorrido entero —QR, código, códigos de recuperación, volver a
 * entrar— deja a la cuenta dentro del panel.
 */

const NUEVA = 'estrena-2fa@ejemplo.com';

test('T-V-16: una cuenta nueva da de alta la 2FA y vuelve a entrar con código', async ({
  page,
}) => {
  await crearYEntrar(page, { email: NUEVA, role: 'editor', sinSegundoFactor: true });

  // T-V-9: con la sesión a medio entrar, el panel no se abre: lleva a darla de alta. Justo después
  // de entrar se mira el **contenido** y no la dirección: la redirección ocurre dentro de la
  // navegación de la action de acceso, y Next sirve la página de destino con la barra aún en
  // `/admin`. Lo que importa es que no se pinte el panel; la dirección se mira abajo, con una
  // navegación de verdad.
  await expect(page.getByRole('heading', { name: /Activa la verificación/ })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.goto('/admin/media');
  await expect(page).toHaveURL(/\/admin\/verificacion$/);

  await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();

  // La clave en texto, como la escribiría a mano quien no puede escanear.
  const secreto = ((await page.locator('code').textContent()) ?? '').replace(/\s/g, '');
  expect(secreto).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel('El código que enseña la app').fill(codigoTotp(secreto));
  await page.getByRole('button', { name: 'Activar' }).click();

  const lista = page.getByRole('list', { name: 'Códigos de recuperación' });
  await expect(lista).toBeVisible({ timeout: 10_000 });
  await expect(lista.getByRole('listitem')).toHaveCount(10);

  await page.getByRole('button', { name: /Ya los he guardado/ }).click();
  await expect(page.getByText(/Verificación en dos pasos activada/)).toBeVisible({
    timeout: 10_000,
  });

  // Con el código del paso siguiente: el de este ya se gastó al activar, y repetirlo no vale.
  await page.getByLabel('Correo').fill(NUEVA);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page
    .getByLabel('Código de verificación')
    .fill(codigoTotp(secreto, new Date(Date.now() + 30_000)));
  await page.getByRole('button', { name: /entrar/i }).click();

  await page.waitForURL(/\/admin(?!\/login|\/verificacion)/);
  await page.goto('/admin/media');
  await expect(page).toHaveURL(/\/admin\/media$/);
});

test('T-V-11: con la verificación hecha, la página de alta devuelve al panel', async ({ page }) => {
  await crearYEntrar(page, { email: 'ya-tiene-2fa@ejemplo.com', role: 'editor' });

  await page.goto('/admin/verificacion');
  await expect(page).toHaveURL(/\/admin$/);
});
