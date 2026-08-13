import { expect, test } from '@playwright/test';

/**
 * T-05-4: el harness e2e arranca el build de producción y lo alcanza.
 *
 * El flujo crítico que exige SPEC §11.4 (login → editar → preview → publicar → landing
 * actualizada) se construye en M4/M5; este smoke solo garantiza que, cuando llegue, el
 * andamiaje funciona.
 */
test('la página pública responde y se renderiza', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('no emite el header X-Powered-By', async ({ request }) => {
  // SPEC §7: `poweredByHeader: false` en next.config.ts. Barato de comprobar y fácil de
  // perder en cualquier refactor de la configuración.
  //
  // OJO al copiar este patrón: `request` es el cliente HTTP de Playwright, no el
  // navegador. Sirve para cabeceras de respuesta, pero NO comprueba que el navegador las
  // aplique. Las cabeceras de SPEC §7.2 que sí tienen efecto en el navegador —CSP,
  // frame-ancestors— hay que verificarlas navegando, no con `request.get`.
  const response = await request.get('/');

  expect(response.headers()['x-powered-by']).toBeUndefined();
});
