import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';

/**
 * Deja la base de datos en el estado de **un sitio ya configurado**, que es el estado en el
 * que vive un despliegue el 99,99 % del tiempo.
 *
 * Sin esto, la landing redirige a `/setup` —el guard de SPEC §7.3 funcionando— y todos los
 * tests de cabeceras de la ruta pública comprueban las cabeceras de `/setup` creyendo que
 * comprueban las de la landing. Lo descubrí porque el test de `X-Robots-Tag` se puso rojo:
 * la landing no debe llevar `noindex` y `/setup` sí.
 *
 * El caso contrario —sitio recién desplegado— se cubre en los tests de integración de #61,
 * donde se puede controlar el estado de la base por test. Aquí no: el servidor arranca una
 * vez para toda la suite.
 *
 * ## Dos cosas que pueden dejar esto sin efecto, y las dos me mordieron
 *
 * **1. La sonda de arranque de Playwright.** Corre **antes** que esta función, así que si apunta
 * a la landing, esa petición se sirve con el sitio aún sin dueño y la respuesta se cachea
 * (ADR-502): los tests ven el aviso de "todavía no está listo" en vez del contenido. Por eso
 * `playwright.config.ts` la apunta a `/api/health`. Comprobado quitándolo: vuelve a fallar.
 *
 * **2. El caché en disco de `.next/cache`.** `unstable_cache` persiste **entre ejecuciones**, y
 * `pnpm build` no lo borra. Si una ejecución anterior guardó "sin configurar" —porque alguien
 * vació la base a mano—, la siguiente lo sigue sirviendo aunque esta función haya insertado la
 * fila. Se arregla con `rm -rf .next/cache`, y no lo hace esta función a propósito: borrar el
 * caché en cada ejecución alargaría la suite para cubrir un estado que solo se crea a mano.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') return;

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const db = drizzle(pool);
    await db.execute(sql`
      insert into settings (key, value)
      values ('setup_completed', ${JSON.stringify({ completedAt: new Date().toISOString() })}::jsonb)
      on conflict (key) do nothing
    `);
  } finally {
    await pool.end();
  }
}
