import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/**
 * T-41-1: las migraciones se aplican antes de la suite de integración, sin pasos manuales.
 *
 * Corre **una vez** por ejecución, en el proceso principal de Vitest, antes de cargar
 * ningún fichero de test. Que esto exista es lo que separa "los tests pasan en mi máquina
 * porque migré hace un rato" de "los tests pasan".
 *
 * Sin `DATABASE_URL` no hace nada: los tests se saltarán igualmente y el aviso lo da
 * `env.ts`. Fallar aquí convertiría un `pnpm test` normal, sin base de datos, en un error.
 */
export default async function setup(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') return;

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../../cms/db/migrations', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
