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
        // **La sonda de arranque pide `/api/health`, no la landing.** Playwright espera a que
        // el servidor responda pidiendo esta dirección, y esa petición ocurre **antes** de
        // `globalSetup` — que es quien deja la base en el estado de un sitio ya configurado.
        //
        // Con `baseURL` a secas, esa primera petición renderizaba la landing con el sitio aún
        // sin dueño y **cacheaba esa respuesta** (ADR-502). Los tests que visitaban `/` veían
        // el aviso de "todavía no está listo" en vez del contenido, y solo en una base recién
        // creada: en local pasaba desapercibido porque la base arrastra usuarios de la
        // ejecución anterior. Falló en CI, que nace limpia.
        url: `${baseURL}/api/health`,
        /**
         * **La vista previa remota se apaga a mano para la suite** (ADR-701, issue #192).
         *
         * `next start` carga `.env.local`, que no se versiona y en la máquina de quien
         * desarrolla puede tener `PREVIEW_ORIGINS` puesta —es lo que hace falta para probar la
         * fase remota—. Con ella puesta, dos casos se ponen en rojo: T-R-2 comprueba que sin la
         * variable la CSP no lleva `frame-src`, y los de la vista previa buscan el iframe de
         * `/preview` cuando el panel ya lo está apuntando fuera.
         *
         * Los dos fallos son correctos y el motivo es invisible: **pasa en CI, que nace sin
         * `.env.local`, y falla en local**. Es la asimetría cara, la que hace perder una tarde
         * buscando en el sitio equivocado.
         *
         * Así que la suite fija el estado que dice comprobar en vez de heredarlo. Lo que se
         * pierde es poder ejercitar la fase encendida desde e2e; eso está en los unitarios, en
         * los de integración y en la prueba a mano con una web de verdad.
         */
        /**
         * Y el almacén de imágenes, por el mismo motivo y con más consecuencia.
         *
         * `vercel env pull` deja `BLOB_READ_WRITE_TOKEN` en `.env.local` en cuanto alguien
         * trabaja con el proyecto desplegado. Con esa variable puesta, la suite deja de
         * ejercitar el caso que dice comprobar —«sin almacén conectado, el fallo no se cuenta en
         * inglés»— y, peor, **empieza a escribir en el almacén de verdad**.
         *
         * Los tests no deben tocar nada que exista fuera de su máquina.
         */
        /**
         * Y Google **encendido**, con credenciales de mentira (issue #233).
         *
         * Al revés que las tres de arriba: aquí la suite enciende algo en vez de apagarlo,
         * porque el caso T-233-18 no se puede comprobar de otra forma — que la CSP de §7.2 no
         * bloquee el viaje a Google solo se ve en un navegador de verdad.
         *
         * **No hace falta que las credenciales sirvan.** Lo que se comprueba es que el
         * navegador llegue a pedirle algo a `accounts.google.com` con nuestro identificador
         * dentro; la petición se intercepta antes de salir, así que la suite no habla con
         * Google ni depende de la red.
         *
         * El precio, y conviene saberlo: con esto puesto, el estado **sin** Google no lo
         * ejercita ningún test de e2e. Está en T-233-2 y T-233-15, que sí pueden tener las dos
         * ramas.
         */
        env: {
          PREVIEW_ORIGINS: '',
          PREVIEW_URL: '',
          BLOB_READ_WRITE_TOKEN: '',
          AUTH_GOOGLE_ID: 'e2e.apps.googleusercontent.com',
          AUTH_GOOGLE_SECRET: 'un-secreto-de-mentira-para-la-suite',
        },
        // Nunca reutilizar un servidor ajeno: daría verde contra otra aplicación.
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
