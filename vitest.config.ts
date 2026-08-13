import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * SPEC §11.4 exige cobertura ≥ 80 % en `cms/core` y `cms/security`. El umbral se declara
 * aquí desde el primer día, pero solo se **aplica** cuando `COVERAGE_ENFORCE=1`, que CI
 * activa a partir de M3.
 *
 * Motivo: hasta M3 esos dos árboles están prácticamente vacíos. Un umbral sobre cero
 * ficheros no mide nada y, peor, da un verde que parece cobertura y no lo es. Ver
 * docs/specs/00-fundaciones.md §3.2 y el issue #6.
 */
const coverageThresholds = {
  'cms/core/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
  'cms/security/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
};

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig.json, para que los tests importen igual que el código.
    alias: {
      '@': repoRoot,
      // Ver tests/support/server-only-stub.ts. En resumen: `server-only` lanza al
      // importarse fuera de la condición `react-server`, así que sin esto no se puede
      // escribir ni un test unitario de cms/core, cms/db, cms/auth o cms/security.
      // Se alias en vez de activar la condición globalmente porque eso rompe la
      // resolución de eslint-config-next y con ella el test de las reglas de seguridad.
      'server-only': fileURLToPath(new URL('./tests/support/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['cms/**/*.ts', 'cms/**/*.tsx'],
      thresholds: process.env['COVERAGE_ENFORCE'] === '1' ? coverageThresholds : undefined,
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
          // Tests de tipos (`expectTypeOf`): los exige M1 para verificar la inferencia
          // de `cms.config.ts`.
          typecheck: {
            enabled: true,
            include: ['tests/unit/**/*.test-d.ts'],
            tsconfig: './tsconfig.json',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // Aplica las migraciones una vez, antes de cargar ningún test (T-41-1).
          globalSetup: ['./tests/integration/global-setup.ts'],
          // Limpia la base antes de CADA test, en todos los ficheros (T-41-2). Está aquí y
          // no en cada fichero porque olvidarlo no falla: hereda los datos del anterior.
          setupFiles: ['./tests/integration/setup.ts'],
          // Contra Postgres real: un solo proceso, porque los ficheros comparten esquema y
          // en paralelo se pisarían las transacciones.
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
        },
      },
    ],
  },
});
