import { sql } from 'drizzle-orm';
import { getDb } from '@/cms/db';

/**
 * `GET /api/health` (SPEC §5.3): estado y latencia de la base de datos, **sin datos
 * sensibles**.
 *
 * No dice qué falló ni con qué motor habla: un endpoint de salud es público por definición,
 * y el detalle del error solo le sirve a quien esté buscando por dónde entrar.
 *
 * ## Se comprueba el **esquema**, no solo que haya conexión (issue #192)
 *
 * Antes esto era un `select 1`, que responde perfectamente en una base recién creada y vacía —o
 * sea, en un despliegue al que nadie ha aplicado las migraciones—. Comprobado contra una base
 * vacía: `/api/health` decía 200 mientras `/setup` respondía 500 con `relation "settings" does
 * not exist`. **Una salud que miente sobre un sistema caído es peor que no tenerla**, porque es
 * lo primero que se mira y manda a buscar el fallo a otro sitio.
 *
 * Consultar una tabla que la aplicación necesita prueba las dos cosas a la vez: que se llega a
 * la base y que el esquema está puesto.
 *
 * **Lo que no prueba, y conviene saberlo:** que estén aplicadas *todas* las migraciones. Una
 * base a la que le falte la última seguirá respondiendo que sí mientras `settings` exista.
 * Detectar eso es comparar lo aplicado contra los ficheros, que es otra cosa y más cara; esto
 * cubre el caso que rompe un despliegue entero.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const started = performance.now();

  try {
    // `limit 0`: interesa que la tabla exista, no leer nada de ella. Sin filas que devolver, el
    // coste es el de comprobar el esquema y ni siquiera toca los datos.
    await getDb().execute(sql`select 1 from settings limit 0`);

    return Response.json({ ok: true, dbLatencyMs: Math.round(performance.now() - started) });
  } catch (error) {
    // **El motivo va al registro, no a la respuesta.** Quien despliega lo necesita —«no está
    // migrada» y «no hay conexión» se arreglan de forma distinta— y quien pregunta desde fuera
    // no. Es la misma línea que separa el 404 del 403 en el resto del proyecto.
    console.error('[health] La base de datos no responde o no está migrada:', error);

    return Response.json({ ok: false }, { status: 503 });
  }
}
