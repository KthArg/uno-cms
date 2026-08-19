import { execFileSync } from 'node:child_process';

/**
 * Ejecutar SQL desde un test e2e.
 *
 * ## Por qué hace falta, y qué problema resuelve de verdad
 *
 * Un CMS acoplado 1:1 a una landing es **un solo sitio**: no hay forma de darle a cada test su
 * propia sección `hero`. Todos los ficheros de e2e comparten la misma base de datos y el mismo
 * servidor, así que un test que publica algo cambia el mundo para los que vengan detrás.
 *
 * Eso apareció en cuanto se añadieron los tests del editor: el de "la ruta pública no expone
 * borradores" empezó a fallar, no porque expusiera nada, sino porque `hero` ya estaba
 * publicado y su aserto daba por hecho que no lo estaría.
 *
 * La salida no es ordenar los tests con cuidado —eso aguanta hasta el siguiente— sino que
 * **cada test deje el estado que necesita justo antes de mirarlo**. Con eso deja de importar
 * quién corrió antes.
 *
 * Va por un proceso aparte porque el proceso de Playwright no tiene el driver cargado, y los
 * parámetros viajan por `execFileSync` en vez de interpolados en una cadena de shell: aquí no
 * hay entrada hostil, pero construir comandos por concatenación es una costumbre que acaba
 * apareciendo donde sí la hay.
 */
export function ejecutarSql(sql: string, parametros: readonly unknown[] = []): void {
  const script = `
    const { Pool } = require('pg');
    const [sql, parametros] = process.argv.slice(1);
    (async () => {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(sql, JSON.parse(parametros));
      await pool.end();
    })().catch((error) => { console.error(error); process.exit(1); });
  `;

  execFileSync('node', ['-e', script, sql, JSON.stringify(parametros)], { stdio: 'inherit' });
}

/**
 * Deja una entrada con borrador y **sin publicar**, que es el estado inicial de un sitio.
 *
 * El `type` va aparte de la `key` para poder crear elementos de colección, que es lo que
 * permite a un test tener una entrada **suya**: los singletons son tres y fijos, así que dos
 * tests que usen el mismo se pisan. Lo aprendí pisándome a mí mismo con este helper recién
 * escrito.
 */
export function dejarSinPublicar(key: string, draft: Record<string, unknown>, type = key): void {
  ejecutarSql(
    `insert into content_entries (key, type, draft, published, status)
     values ($1, $2, $3::jsonb, null, 'changed')
     on conflict (key) do update
       set draft = excluded.draft, published = null, status = 'changed'`,
    [key, type, JSON.stringify(draft)]
  );
}

/**
 * Vacía una colección entera.
 *
 * Hace falta porque los tests que **crean** elementos dejan rastro, y el siguiente que busque
 * "Marta Ruiz" encuentra tres. En CI no se nota —la base es nueva en cada ejecución— y en local
 * falla a la segunda pasada: un test que solo pasa con la base recién creada es un test que
 * miente sobre su propio estado.
 */
export function limpiarColeccion(type: string): void {
  ejecutarSql('delete from content_entries where type = $1', [type]);
}

/** Deja el borrador de una entrada en un estado conocido, sin tocar lo publicado. */
export function ponerBorrador(key: string, draft: Record<string, unknown>): void {
  ejecutarSql(
    `insert into content_entries (key, type, draft)
     values ($1, $1, $2::jsonb)
     on conflict (key) do update set draft = excluded.draft`,
    [key, JSON.stringify(draft)]
  );
}
