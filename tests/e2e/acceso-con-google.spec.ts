import { expect, test } from '@playwright/test';

/**
 * T-233-18: el viaje a Google, en un navegador de verdad (spec 13 §8).
 *
 * ## Qué comprueba esto que no comprueba ningún test unitario
 *
 * Que **la CSP de `SPEC.md` §7.2 no bloquea el viaje**. La política fija `form-action 'self'`, y
 * el botón es un `<form>` que envía a nuestro propio servidor, que a su vez contesta con una
 * redirección a `accounts.google.com`. Si el navegador tratara esa redirección como el destino
 * del formulario, la política la cortaría y el botón no haría nada — sin error en pantalla, que
 * es la peor forma de estar roto.
 *
 * Eso no se ve leyendo el código ni montando Auth.js en Node: hace falta un navegador aplicando
 * la política. Es el mismo motivo por el que existe la suite de humo.
 *
 * ## Y por qué no hablamos con Google
 *
 * La petición a `accounts.google.com` se **intercepta y se corta** antes de salir. Lo que hay
 * que comprobar es que el navegador llegue a hacerla y con qué; completar el acceso exigiría
 * una cuenta de Google de verdad y dejaría la suite dependiendo de la red y de un tercero.
 *
 * Las credenciales que usa el servidor de la suite son de mentira y están en
 * `playwright.config.ts`.
 */

const CLIENT_ID_DE_LA_SUITE = 'e2e.apps.googleusercontent.com';

test.describe('entrar con Google', () => {
  test('T-233-16: el botón está, y el formulario de siempre también', async ({ page }) => {
    await page.goto('/admin/login');

    await expect(page.getByRole('button', { name: 'Entrar con Google' })).toBeVisible();

    // ADR-900: el acceso por contraseña no se retira nunca. Comprobarlo aquí y no solo en los
    // unitarios porque es la pantalla real la que podría perderlo en un rediseño.
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  });

  test('T-233-18: pulsarlo lleva a Google, con nuestro identificador y nuestra vuelta', async ({
    page,
  }) => {
    let destino: URL | undefined;

    await page.route('https://accounts.google.com/**', async (route) => {
      destino = new URL(route.request().url());
      // Se corta aquí: la suite no habla con Google. Un cuerpo vacío basta — lo que se estaba
      // comprobando ya ha pasado en cuanto el navegador ha intentado la petición.
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' });
    });

    await page.goto('/admin/login');
    await page.getByRole('button', { name: 'Entrar con Google' }).click();

    await expect
      .poll(() => destino?.origin, { message: 'el navegador nunca llegó a pedirle nada a Google' })
      .toBe('https://accounts.google.com');

    expect(destino?.pathname).toContain('/o/oauth2');
    expect(destino?.searchParams.get('client_id')).toBe(CLIENT_ID_DE_LA_SUITE);
    // La vuelta tiene que ser **nuestra**. Si esto apuntara a otro sitio, el código de Google
    // acabaría en manos de quien controle ese dominio.
    expect(destino?.searchParams.get('redirect_uri')).toContain('/api/auth/callback/google');
  });

  test('T-233-17: un rechazo se cuenta con su motivo, sin tocar el mensaje único', async ({
    page,
  }) => {
    // ADR-902: los dos mensajes conviven a propósito y con razones distintas. Se comprueban
    // juntos para que a nadie le dé por unificarlos por limpieza.
    // Acotado a `main`: Next mete su propio `role="alert"` en la página —el anunciador de
    // navegación— y `getByRole('alert')` a secas resuelve a dos elementos.
    const aviso = page.locator('main').getByRole('alert');

    await page.goto('/admin/login?error=AccessDenied');
    await expect(aviso).toContainText('no puede entrar aquí');

    await page.goto('/admin/login?error=CredentialsSignin');
    await expect(aviso).toContainText('Revisa el correo y la contraseña');
  });
});
