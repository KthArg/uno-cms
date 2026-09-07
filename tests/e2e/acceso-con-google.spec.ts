import { expect, test } from '@playwright/test';

/**
 * T-233-19: **el acceso con Google está apagado, y se comprueba con las variables puestas**.
 *
 * El servidor de esta suite arranca con `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET` definidas (ver
 * `playwright.config.ts`), y eso es lo que hace que estos casos digan algo: si el apagado fuera
 * «no pongas las variables», comprobarlo sin ellas sería comprobar que no pasa nada cuando no hay
 * nada. Con ellas puestas, lo que se afirma es que **manda el interruptor**.
 *
 * ## Lo que estaba aquí y ya no
 *
 * T-233-16 y T-233-18 —que el botón se ve, y que pulsarlo llega a `accounts.google.com` sin que
 * la CSP de §7.2 lo corte— **no se pueden ejercitar con la función apagada**, porque no hay botón
 * que pulsar. Estuvieron escritos y en verde antes de apagarla; vuelven con ella. Quedan en el
 * historial de este fichero y anotados en `docs/PENDIENTES.md`, junto al interruptor.
 *
 * No se dejan como `test.skip`: un test saltado se queda saltado para siempre y da una sensación
 * de cobertura que no existe. Lo que queda es el caso del estado real de hoy.
 */

test.describe('entrar con Google, apagado', () => {
  test('T-233-19: no hay botón de Google, con las dos variables definidas', async ({ page }) => {
    await page.goto('/admin/login');

    await expect(page.getByRole('button', { name: 'Entrar con Google' })).toHaveCount(0);

    // Y el acceso de siempre entero, que es lo que no puede faltar nunca (ADR-900).
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  });

  test('T-233-19: y Auth.js no anuncia el proveedor', async ({ page }) => {
    /**
     * Esto es lo que separa «el botón no se ve» de «está apagado», y la primera versión de este
     * caso **no lo separaba**: pedía `/api/auth/signin/google` y comprobaba que no redirigiera a
     * Google. Al mutar el interruptor a `true` **siguió pasando**, porque esa ruta por GET pinta
     * una página y solo redirige con un POST. O sea que no distinguía los dos estados: un test de
     * adorno, cazado por la mutación como el de `lower()`.
     *
     * `/api/auth/providers` sí distingue: es la lista que Auth.js publica de lo que tiene
     * configurado, y es lo primero que miraría quien fuera tanteando qué puertas hay.
     */
    const respuesta = await page.request.get('/api/auth/providers');
    const proveedores = (await respuesta.json()) as Record<string, unknown>;

    expect(Object.keys(proveedores)).not.toContain('google');
    // Y el de siempre anunciado, que es la otra mitad: apagar Google no puede apagar el acceso.
    expect(Object.keys(proveedores)).toContain('credentials');
  });

  test('T-233-17: el mensaje único de §7.1 sigue en pie', async ({ page }) => {
    // Acotado a `main`: Next mete su propio `role="alert"` en la página —el anunciador de
    // navegación— y `getByRole('alert')` a secas resuelve a dos elementos.
    const aviso = page.locator('main').getByRole('alert');

    await page.goto('/admin/login?error=CredentialsSignin');
    await expect(aviso).toContainText('Revisa el correo y la contraseña');
  });

  test('un error que no es de credenciales no manda a revisar la contraseña', async ({ page }) => {
    /**
     * El hallazgo 1 de la autorrevisión de #233, y **sigue importando con Google apagado**:
     * `pages.error` apunta a esta pantalla, así que aquí cae `Configuration` —lo que sale si
     * falta `AUTH_SECRET`— venga de donde venga. Con dos ramas, todos leían «revisa el correo y
     * la contraseña»: quien lo viera iría a cambiar una contraseña que no tiene nada que ver.
     *
     * Y no debe decir **qué** falló: quien lo lee no puede arreglarlo, y nombrar la pieza rota
     * solo sirve a quien esté tanteando.
     */
    const aviso = page.locator('main').getByRole('alert');

    await page.goto('/admin/login?error=Configuration');

    await expect(aviso).toContainText('No se ha podido entrar');
    await expect(aviso).not.toContainText('contraseña');
    await expect(aviso).not.toContainText('Google');
  });
});
