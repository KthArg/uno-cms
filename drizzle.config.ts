import { defineConfig } from 'drizzle-kit';

/**
 * Configuración de drizzle-kit (ADR-002: migraciones SQL versionadas en el repo).
 *
 * `drizzle-kit` corre siempre en una máquina de desarrollo o en CI, nunca en serverless, así
 * que habla el protocolo de cable de Postgres y no el HTTP de Neon. Por eso aquí no aplica
 * la selección de driver de ADR-200: el dialecto es siempre `postgresql`.
 */
export default defineConfig({
  schema: './cms/db/schema.ts',
  out: './cms/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  // Los cambios destructivos deben verse en el SQL generado antes de aplicarse, no
  // ejecutarse porque una herramienta los dio por buenos.
  strict: true,
  verbose: true,
});
