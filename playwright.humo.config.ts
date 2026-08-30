import { defineConfig, devices } from '@playwright/test';

/**
 * La suite de humo, contra un despliegue de verdad (spec 09, issue #207).
 *
 * ## Por qué es una configuración aparte y no un proyecto más de `playwright.config.ts`
 *
 * Porque la diferencia no es de proyecto, es de **naturaleza**:
 *
 * - **`webServer: undefined`**, y esto es el punto entero. La otra configuración construye y
 *   arranca `next start`; si esta lo heredara, estaría probando otra vez el camino local — las
 *   imágenes al disco, Postgres a secas — que es exactamente lo que #207 dice que no cubre
 *   nada.
 * - **Sin `globalSetup`.** El de la otra suite escribe en la base de datos para dejar el sitio
 *   "ya configurado". Contra un despliegue no tiene acceso, y si lo tuviera sería peor.
 * - **Sin reintentos en CI.** Un fallo de humo es una noticia sobre el despliegue; repetirlo
 *   hasta que pase es la forma más rápida de dejar de creerle.
 *
 * Y aparte también para que `pnpm test:e2e` no la ejecute nunca sin querer: esta escribe en un
 * sitio en línea, y esa distinción tiene que estar en el comando, no en la memoria de nadie.
 */

export default defineConfig({
  testDir: './tests/humo',
  // En serie a propósito: los casos suben y borran imágenes en la **misma** biblioteca, y
  // cuentan cuántas hay. En paralelo se contarían las del otro y el rojo sería mentira.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    // Un despliegue de verdad tiene latencia de red y funciones que arrancan en frío. Los
    // tiempos de la suite local no valen aquí.
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  timeout: 180_000,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
