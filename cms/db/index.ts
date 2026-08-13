import 'server-only';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool as PgPool } from 'pg';
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
 * **Transporte WebSocket, no HTTP** (issue #53). ADR-002 decía "HTTP", pero el driver HTTP
 * de Neon **no soporta transacciones** —cada consulta va en una petición independiente, así
 * que no hay sesión donde abrir un `BEGIN` ni donde sostener un `FOR UPDATE`— y `SPEC.md`
 * §4 exige que toda mutación corra en transacción con bloqueo de fila. El `Pool` del mismo
 * paquete, sobre WebSocket, sí las soporta y sigue estando pensado para serverless.
 *
 * **Brecha conocida:** los tests ejercitan esquema, consultas y migraciones, pero no el
 * driver de producción. Un fallo específico del driver de Neon no lo atraparía CI; lo cubre
 * el despliegue de verificación de M6. El issue #43 sigue abierto hasta entonces.
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
    // La conversión existe porque Drizzle expone una clase por driver aunque su superficie
    // sea la misma. Ambas son `Pool` con el protocolo de cable de Postgres —una sobre
    // WebSocket, otra sobre TCP— y ambas soportan transacciones interactivas, que es la
    // capacidad de la que depende SPEC §4.
    return drizzleNeon(new NeonPool({ connectionString: databaseUrl }), {
      schema,
    }) as unknown as Database;
  }

  // `Pool` y no `Client`: en desarrollo el servidor de Next recarga módulos y una conexión
  // suelta se quedaría colgada en cada recarga.
  return drizzlePg(new PgPool({ connectionString: databaseUrl }), { schema });
}

/**
 * Un solo tipo hacia arriba, y no la unión de ambos.
 *
 * La primera versión declaraba la unión, con el argumento de que así `typecheck` avisaría
 * si una consulta usaba algo que solo existe en un driver. No funcionaba: TypeScript no
 * resuelve una llamada sobre la unión de dos firmas, así que `onConflictDoNothing({...})`
 * fallaba con "Expected 0 arguments". El argumento tampoco se sostenía, porque lo que la
 * unión detectaba no era divergencia de capacidades sino divergencia de nombres de clase.
 *
 * **Lo que de verdad protege de una divergencia entre drivers no es el tipo, es el
 * despliegue de verificación de M6** (issue #43). Conviene no confundir una cosa con la
 * otra, que es lo que hacía el comentario anterior.
 */
type Database = NodePgDatabase<typeof schema>;

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
