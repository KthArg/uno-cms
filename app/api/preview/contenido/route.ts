import { vistaPreviaRemotaActiva } from '@/cms/vista-previa-remota';

/**
 * `GET /api/preview/contenido` — la única ruta por la que salen borradores (spec 08 §4.3).
 *
 * ## Lo que hay hoy aquí es **solo el interruptor**
 *
 * De esta ruta, el issue #177 construye una cosa: que sin `PREVIEW_ORIGINS` no exista. Lo que
 * sirve —origen permitido, token de propósito `preview-remoto`, `Vary`, `no-store` y el
 * contenido de ADR-501— lo construye #179.
 *
 * El orden es a propósito y está escrito en la spec §7: al revés habría una ventana en la que
 * existe un endpoint que sirve contenido sin publicar y nada lo apaga. Así, cuando #179 llegue,
 * nace apagada.
 *
 * ## Por qué el camino encendido responde 501 y no 404
 *
 * Porque si respondiera 404 también, **T-R-1 no probaría nada**: quitar la comprobación de
 * arriba dejaría el test en verde, que es exactamente el test de adorno que este proyecto ha
 * cazado cinco veces por mutación. Con el 501, borrar la línea pone el caso en rojo.
 *
 * No es el contrato de §4.3 y no debe sobrevivir a #179: allí este `return` se sustituye por la
 * respuesta de verdad, y ninguna petición vuelve a ver un 501. Está anotado en
 * `docs/PENDIENTES.md` para que no se quede.
 *
 * Y no cuenta nada que no se supiera: cuando la fase está encendida, los orígenes permitidos
 * viajan en la cabecera `Content-Security-Policy` de cada respuesta. Que exista la ruta es
 * público desde antes de preguntar.
 *
 * ## Por qué 404 y no 403 cuando está apagada
 *
 * Lo mismo que `/api/media/local` y que `/setup`: un 403 confirma que ahí hay un endpoint y
 * que solo falta la credencial. Un 404 no cuenta nada.
 */
export const runtime = 'nodejs';

export function GET(): Response {
  if (!vistaPreviaRemotaActiva()) return new Response(null, { status: 404 });

  // PENDIENTE(#179): sirve el borrador de la clave del token. Hasta entonces, esta ruta no
  // devuelve contenido de ninguna clase.
  return new Response(null, { status: 501 });
}
