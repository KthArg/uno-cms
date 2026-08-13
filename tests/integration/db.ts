import { sql } from 'drizzle-orm';
import { getDb, resetDbForTests } from '@/cms/db';

/**
 * Aislamiento entre tests de integración (T-41-2).
 *
 * `TRUNCATE ... RESTART IDENTITY CASCADE` sobre todas las tablas del esquema, y no un
 * `DELETE` por tabla en el orden correcto: el orden correcto es una lista que hay que
 * mantener a mano y que se rompe en silencio en cuanto se añade una clave foránea nueva.
 * `CASCADE` no tiene ese problema.
 *
 * Las tablas se leen de `information_schema`, no de una lista escrita aquí, por la misma
 * razón: una tabla nueva que no aparezca en la lista dejaría datos de un test filtrándose
 * al siguiente, y eso se manifiesta como un fallo intermitente en otro fichero.
 *
 * Se excluye `__drizzle_migrations`, que es estado de la herramienta y no de la aplicación:
 * vaciarla haría que las migraciones se reaplicaran a mitad de suite.
 */
export async function resetDatabase(): Promise<void> {
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
 * Cierra el pool al terminar. Sin esto, Vitest se queda esperando a que Node vacíe el bucle
 * de eventos y la suite tarda diez segundos de más en salir, o no sale.
 */
export async function closeDatabase(): Promise<void> {
  const db = getDb() as unknown as { $client?: { end?: () => Promise<void> } };
  await db.$client?.end?.();
  resetDbForTests();
}
