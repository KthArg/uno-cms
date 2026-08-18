import { sql } from 'drizzle-orm';
import { getDb } from '@/cms/db';

/**
 * `GET /api/health` (SPEC §5.3): estado y latencia de la base de datos, **sin datos
 * sensibles**.
 *
 * No dice qué falló ni con qué motor habla: un endpoint de salud es público por definición,
 * y el detalle del error solo le sirve a quien esté buscando por dónde entrar.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const started = performance.now();

  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, dbLatencyMs: Math.round(performance.now() - started) });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
