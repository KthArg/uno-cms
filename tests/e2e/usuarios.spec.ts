import { expect, test } from '@playwright/test';
import { ejecutarSql } from './support/db';
import { CONTRASENA, crearYEntrar } from './support/session';

/**
 * T-E-4, T-E-5 y T-E-6: personas e invitación, contra un servidor de verdad.
 *
 * Lo que solo se puede comprobar aquí: que **la ruta cierra** para un editor —no el menú— y que
 * el recorrido entero de una invitación funciona de punta a punta, desde el enlace que ve quien
 * invita hasta la sesión de quien lo canjea.
 */

test.describe.configure({ mode: 'serial' });

/** El correo de la persona invitada. Se rehace en cada ejecución para no depender de la anterior. */
const INVITADA = 'invitada-e2e@ejemplo.com';
const CONTRASENA_ELEGIDA = 'la-que-elige-quien-canjea-2026';

test.beforeAll(() => {
  ejecutarSql('delete from users where email = $1', [INVITADA]);
});

test('T-E-4: un editor no entra en Personas aunque escriba la dirección', async ({ page }) => {
  await crearYEntrar(page, { email: 'editora-e2e@ejemplo.com', role: 'editor' });

  const respuesta = await page.goto('/admin/users');

  // 404 y no 403: un 403 confirmaría que la ruta existe y que hay algo detrás. Y esto es la
  // puerta, no el menú — el menú ya no le ofrece la entrada, pero eso no cierra nada.
  expect(respuesta?.status()).toBe(404);

  const ajustes = await page.goto('/admin/settings');
  expect(ajustes?.status()).toBe(404);
});

test('T-E-5 y T-E-6: invitar, canjear, entrar, y que el enlace no valga dos veces', async ({
  page,
  browser,
}) => {
  await crearYEntrar(page, { email: 'jefa-e2e@ejemplo.com', role: 'admin' });

  await page.goto('/admin/users');
  await page.getByLabel('Nombre').fill('Invitada');
  await page.getByLabel('Correo').fill(INVITADA);
  await page.getByRole('button', { name: 'Invitar' }).click();

  // El enlace sale en un campo de solo lectura: es el único sitio donde existe, porque §10.2
  // deja el correo fuera del MVP y no se lo manda nadie.
  const campo = page.getByLabel('Enlace de invitación');
  await expect(campo).toBeVisible({ timeout: 10_000 });
  const enlace = await campo.inputValue();
  expect(enlace).toContain('/admin/invitacion?c=');

  await expect(page.getByText(/Caduca en 24 horas/)).toBeVisible();

  // En un contexto aparte: quien canjea no es quien invita, y compartir la sesión del
  // administrador haría pasar el test por el motivo equivocado.
  const contexto = await browser.newContext();
  const invitada = await contexto.newPage();

  try {
    await invitada.goto(enlace);
    await expect(invitada.getByText(/Hola, Invitada/)).toBeVisible();

    await invitada.getByLabel('Tu contraseña').fill(CONTRASENA_ELEGIDA);
    await invitada.getByLabel('Repítela').fill(CONTRASENA_ELEGIDA);
    await invitada.getByRole('button', { name: 'Guardar y entrar' }).click();

    // Se vuelve al acceso, y con un aviso: llegar a un formulario mudo después de poner la
    // contraseña deja sin saber si se guardó.
    await expect(invitada.getByText(/Tu contraseña ya está puesta/)).toBeVisible({
      timeout: 10_000,
    });

    // T-E-5: la cuenta entra de verdad. Es la única prueba de que la invitación sirvió.
    await invitada.getByLabel('Correo').fill(INVITADA);
    await invitada.getByLabel('Contraseña').fill(CONTRASENA_ELEGIDA);
    await invitada.getByRole('button', { name: /entrar/i }).click();
    await invitada.waitForURL(/\/admin(?!\/login)/);

    // T-E-6: el mismo enlace, otra vez. Da 404 igual que uno inventado: distinguir "ya usado"
    // de "no existe" confirmaría que ese enlace fue real alguna vez.
    const segunda = await contexto.newPage();
    const respuesta = await segunda.goto(enlace);
    expect(respuesta?.status()).toBe(404);
  } finally {
    await contexto.close();
  }
});

test('T-E-6: un enlace manipulado tampoco vale', async ({ page }) => {
  // La firma cubre el contenido entero, así que cambiar un carácter del payload la rompe. Sin
  // esta comprobación, "de un solo uso" sería lo único que separa una cuenta ajena de
  // cualquiera que sepa componer la dirección.
  const respuesta = await page.goto('/admin/invitacion?c=eyJhIjoxfQ.firmainventada');

  expect(respuesta?.status()).toBe(404);
});

test('cambiar la propia contraseña cierra la sesión', async ({ page }) => {
  const correo = 'cambia-e2e@ejemplo.com';
  await crearYEntrar(page, { email: correo, role: 'editor' });

  await page.goto('/admin/account');
  await page.getByLabel('Tu contraseña actual').fill(CONTRASENA);
  await page.getByLabel('La nueva', { exact: true }).fill('otra-contrasena-larga-y-nueva');
  await page.getByLabel('Repite la nueva').fill('otra-contrasena-larga-y-nueva');
  await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();

  // Que expulse no es un efecto molesto: es el punto (ADR-301). Y la pantalla de acceso lo
  // explica, para que no parezca que algo se ha roto.
  await expect(page.getByText(/Se han cerrado todas las sesiones/)).toBeVisible({
    timeout: 10_000,
  });

  // Y la sesión vieja ya no abre el panel.
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
});
