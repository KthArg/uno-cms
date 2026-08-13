import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';

/**
 * Cliente de base de datos (ADR-200, issue #43).
 *
 * ADR-002 fija el driver HTTP de Neon, con un motivo que no es cosmético: en serverless, un
 * driver TCP abre una conexión por invocación y agota el free tier. Pero SPEC §11.4 exige
 * tests de integración contra Postgres efímero, y el driver HTTP de Neon no habla con un
 * `postgres:16` en un contenedor.
 *
 * Aquí está la costura que ADR-002 ya anticipaba ("detrás de una interfaz `db/` para no
 * acoplar"): el driver se elige por destino y hacia arriba se expone el mismo tipo de
 * Drizzle, así que ni el esquema, ni las consultas, ni las acciones saben cuál hay debajo.
 *
 * **Brecha conocida:** los tests ejercitan esquema, consultas y migraciones, pero no el
 * driver de producción. Un fallo específico del driver HTTP de Neon no lo atraparía CI; lo
 * cubre el despliegue de verificación de M6. El issue #43 sigue abierto hasta entonces.
 */

export type DbDriver = 'neon' | 'pg';

/**
 * La elección es explícita por `DB_DRIVER` y la detección por host solo actúa como valor
 * por defecto. Adivinar sin poder forzar sería frágil justo donde no conviene: en un
 * entorno mal detectado, el fallo aparece como "no conecta" y no como "driver equivocado".
 */
export function resolveDriver(databaseUrl: string, override?: string): DbDriver {
  if (override === 'neon' || override === 'pg') return override;
  if (override !== undefined && override !== '') {
    throw new Error(`DB_DRIVER='${override}' no es válido. Usa 'neon' o 'pg'.`);
  }

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL no es una URL válida.');
  }

  return host.endsWith('.neon.tech') || host.endsWith('.neon.build') ? 'neon' : 'pg';
}

function requireDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error(
      'Falta DATABASE_URL. En Vercel la inyecta la integración de Neon; en local, ' +
        'cópiala de .env.example a .env.local.'
    );
  }
  return url;
}

function createClient() {
  const databaseUrl = requireDatabaseUrl();
  const driver = resolveDriver(databaseUrl, process.env['DB_DRIVER']);

  if (driver === 'neon') {
    return drizzleNeon(neon(databaseUrl), { schema });
  }

  // `Pool` y no `Client`: en desarrollo el servidor de Next recarga módulos y una conexión
  // suelta se quedaría colgada en cada recarga.
  return drizzlePg(new Pool({ connectionString: databaseUrl }), { schema });
}

/**
 * Los dos drivers devuelven tipos de Drizzle distintos aunque su superficie sea la misma.
 * Se declara la unión para que `typecheck` avise si alguna consulta usa algo que solo
 * existe en uno de ellos: la divergencia se detecta al compilar y no en producción.
 */
type Database = ReturnType<typeof createClient>;

/**
 * Perezoso y memorizado. Perezoso porque importar este módulo no debe exigir
 * `DATABASE_URL` —los tests unitarios importan el esquema sin base de datos—; memorizado
 * porque en desarrollo Next reevalúa los módulos y se abriría un pool por recarga.
 */
let cached: Database | undefined;

export function getDb(): Database {
  cached ??= createClient();
  return cached;
}

/** Solo para tests: fuerza que la próxima llamada reconstruya el cliente. */
export function resetDbForTests(): void {
  cached = undefined;
}

export { schema };
export * from './schema';
