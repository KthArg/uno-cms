import { defineConfig, devices } from '@playwright/test';

/**
 * La suite del **almacén local**, contra `next dev` (issue #170, ADR-700).
 *
 * ## Por qué existe una segunda configuración
 *
 * El almacén local guarda las imágenes en disco y **solo se enciende fuera de producción**:
 * `usarAlmacenLocal()` exige que no haya token de Vercel Blob **y** que `NODE_ENV` no sea
 * `production`. La suite normal arranca con `next start`, o sea producción, así que ninguna de sus
 * rutas se podía ejercitar con un navegador — el hueco que este issue llevaba abierto desde el 21
 * de agosto.
 *
 * Las tres salidas que se evaluaron entonces están en el issue. La que se descartaba por cara era
 * esta, «un segundo proyecto con `next dev`», y la que se descartaba por peligrosa era meterle una
 * puerta trasera a `usarAlmacenLocal()` — la función que impide que este almacén se active donde
 * haría daño.
 *
 * Lo que ha cambiado es el coste: **no es un segundo proyecto dentro de la suite, es una
 * configuración aparte** con un solo fichero de casos. No alarga la suite normal ni un segundo, y
 * lo que ejercita es un servidor de desarrollo — que es exactamente donde vive lo que se prueba.
 * La objeción de «ejercita un servidor que no se despliega» se disuelve sola: **esto no se
 * despliega nunca**, por diseño.
 *
 * ## El directorio de construcción es otro, y hace falta
 *
 * `next dev` reescribe `.next`. Levantarlo mientras la suite normal sirve desde ahí es la trampa
 * que `CLAUDE.md` avisa, y rompería la otra suite si alguien las corriera a la vez. Con
 * `NEXT_DIST_DIR` cada una tiene el suyo.
 */

const port = Number(process.env['E2E_DEV_PORT'] ?? 3200);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/desarrollo',
  // Deja el sitio configurado antes de arrancar, igual que la suite normal.
  globalSetup: './tests/e2e/global-setup.ts',
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  // Mismo motivo que en la suite normal (#227): un solo sitio no se reparte entre navegadores.
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next dev --port ${port}`,
    url: `${baseURL}/api/health`,
    env: {
      // Su propio directorio, para no pisar el `.next` de la otra suite.
      NEXT_DIST_DIR: '.next-desarrollo',
      // **Y sin token de almacén**: es la otra mitad de la condición de `usarAlmacenLocal()`.
      // Si alguien tiene uno en `.env.local`, sin esto la suite entera probaría el camino de
      // Vercel y pasaría en verde sin haber tocado el almacén local ni una vez.
      BLOB_READ_WRITE_TOKEN: '',
      PREVIEW_ORIGINS: '',
      PREVIEW_URL: '',
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
