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
