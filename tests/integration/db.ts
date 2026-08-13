import { sql } from 'drizzle-orm';
import { getDb, resetDbForTests } from '@/cms/db';
import { databaseUrl } from './env';

/**
 * Aislamiento entre tests de integración (T-41-2).
 *
 * `TRUNCATE ... RESTART IDENTITY CASCADE` sobre todas las tablas del esquema, y no un
 * `DELETE` por tabla en el orden correcto: ese orden es una lista que hay que mantener a
 * mano y que se rompe en silencio en cuanto se añade una clave foránea nueva.
 *
 * Las tablas se leen de `information_schema` y no de una lista escrita aquí, por lo mismo:
 * una tabla nueva ausente de la lista dejaría datos filtrándose de un test al siguiente, y
 * eso se manifiesta como un fallo intermitente **en otro fichero**.
 *
 * Se excluye `__drizzle_migrations`, que es estado de la herramienta y no de la aplicación:
 * vaciarla haría que las migraciones se reaplicaran a mitad de suite.
 */

/**
 * Nombres de base de datos que se consideran desechables.
 *
 * Esta función **borra todo el contenido** de la base a la que apunte `DATABASE_URL`, y
 * corre en un `beforeEach`. En CI apunta a un servicio efímero y no hay riesgo; en una
 * máquina de desarrollo, una variable mal pegada bastaría para vaciar otra cosa. La
 * diferencia entre "no pasó nada" y "he borrado la base equivocada" cabe en esta condición.
 */
const TEST_DATABASE_PATTERN = /(^|[_-])tests?\d*($|[_-])/i;

function assertDisposableDatabase(): string {
  if (databaseUrl === undefined) {
    throw new Error('resetDatabase() requiere DATABASE_URL.');
  }

  const name = new URL(databaseUrl).pathname.replace(/^\//, '');

  if (!TEST_DATABASE_PATTERN.test(name)) {
    throw new Error(
      `Me niego a vaciar la base de datos '${name}': su nombre no la identifica como ` +
        `desechable. Los tests de integración borran TODAS las tablas antes de cada test. ` +
        `Usa una base cuyo nombre contenga 'test' (por ejemplo 'unocms_test'), o revisa a ` +
        `dónde apunta DATABASE_URL.`
    );
  }

  return name;
}

export async function resetDatabase(): Promise<void> {
  assertDisposableDatabase();

  const result = await getDb().execute(sql`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name not like '\\_\\_drizzle%'
  `);

  const tables = (result.rows as { table_name: string }[]).map((row) => row.table_name);
  if (tables.length === 0) return;

  // `sql.identifier` y no interpolación de cadenas: los nombres vienen de una consulta y no
  // de una constante, y este proyecto prohíbe `sql.raw` por regla de lint (SPEC §7.1). La
  // regla vale también para el código de test, que es donde se copian los malos hábitos.
  const list = sql.join(
    tables.map((name) => sql.identifier(name)),
    sql`, `
  );
  await getDb().execute(sql`truncate table ${list} restart identity cascade`);
}

/**
 * Cierra el pool al terminar. Sin esto, Vitest espera a que Node vacíe el bucle de eventos
 * y la suite tarda de más en salir, o no sale.
 *
 * `$client` es interno de Drizzle y podría desaparecer en una versión futura. Si eso pasa,
 * esto **lanza** en vez de tragárselo: un `?.` silencioso convertiría el problema en "la
 * suite tarda raro", un síntoma que aparece en otro sitio y no apunta a su causa.
 */
export async function closeDatabase(): Promise<void> {
  const client = (getDb() as unknown as { $client?: unknown }).$client;
  const end = (client as { end?: unknown } | undefined)?.end;

  if (typeof end !== 'function') {
    throw new Error(
      'No se pudo cerrar la conexión: Drizzle ya no expone `$client.end()`. ' +
        'Actualiza tests/integration/db.ts en vez de dejar el pool abierto.'
    );
  }

  await (end as () => Promise<void>).call(client);
  resetDbForTests();
}
