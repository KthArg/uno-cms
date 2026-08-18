import { defineConfig, devices } from '@playwright/test';

/**
 * Los e2e corren contra el **build de producción**, no contra `next dev`: SPEC §8 fija
 * presupuestos de rendimiento y §2 exige ISR, y ninguna de las dos cosas se comporta igual
 * en desarrollo.
 *
 * El puerto es configurable porque 3000 suele estar ocupado en máquinas de desarrollo; si
 * el e2e se colgara del 3000 de otro proyecto, daría verde probando otra aplicación.
 */
const port = Number(process.env['E2E_PORT'] ?? 3100);
const baseURL = process.env['E2E_BASE_URL'] ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Deja la base en el estado de un sitio ya configurado antes de arrancar el servidor: sin
  // esto, el guard de SPEC §7.3 redirige la landing a /setup y los tests de cabeceras de la
  // ruta pública acaban comprobando las de /setup.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  // Un `.only` olvidado no debe colar un PR con la mitad de la suite sin ejecutar.
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: `pnpm build && pnpm exec next start --port ${port}`,
        url: baseURL,
        // Nunca reutilizar un servidor ajeno: daría verde contra otra aplicación.
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
