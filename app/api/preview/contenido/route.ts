import { previewContentConObjetivo } from '@/cms/core/preview-content';
import { verifyToken } from '@/cms/security/tokens';
import { origenPermitido, origenesDeVistaPreviaRemota } from '@/cms/vista-previa-remota';

/**
 * `GET /api/preview/contenido?token=…` — **el único sitio por donde un borrador sale de la
 * aplicación** (spec 08 §4.3, ADR-701).
 *
 * Hasta ADR-701, que los borradores no salieran era la propiedad de seguridad más fuerte que
 * tenía este proyecto: `/api/content/:key` sirve solo lo publicado y su propio comentario dice
 * que filtrar un borrador ahí "es publicar sin querer, y sin que nadie pulse nada". Esa
 * propiedad se acaba aquí y en ningún otro sitio, y por eso todo lo que la acota está en este
 * fichero: el interruptor, la lista de orígenes, el propósito del token y `no-store`.
 *
 * ## Las dos puertas, en este orden y por este motivo
 *
 * 1. **El origen**, antes que el token porque es más barato y porque no toca `APP_SECRET`.
 * 2. **El token.** Propósito `preview-remoto` y quince minutos (#178). El de `/preview` no vale
 *    aquí, y este no vale allí.
 *
 * **El interruptor no es una tercera puerta: es la primera.** Sin `PREVIEW_ORIGINS` la lista
 * está vacía, y una lista vacía no autoriza a nadie. Escribí además un `if (origenes.length
 * === 0)` delante y sobraba —quitarlo no ponía en rojo un solo caso—, que es la misma línea de
 * adorno que ya me había colado en #178. Se queda fuera: dos comprobaciones del mismo hecho son
 * dos sitios que pueden discrepar sobre si la fase está encendida.
 *
 * ## Qué protege de verdad cada una, que no es lo que parece
 *
 * **El token es la credencial.** Quien lo tenga y sepa usar `curl` lee ese borrador: la
 * cabecera `Origin` la escribe quien hace la petición, así que un cliente que no sea un
 * navegador puede poner la que quiera. Decir que la lista de orígenes "decide quién puede leer
 * contenido sin publicar" es cierto a medias, y conviene tenerlo claro antes de apoyarse en
 * ella.
 *
 * **Lo que la lista sí decide es qué páginas web pueden leer la respuesta**, y eso lo impone el
 * navegador: sin `Access-Control-Allow-Origin` con el origen exacto, el `fetch` de otra web
 * falla aunque el servidor haya respondido. Es la diferencia entre "un token filtrado se puede
 * usar" —que es inevitable, y por eso dura quince minutos— y "cualquier página que visite quien
 * edita puede leer sus borradores en silencio".
 *
 * ## Por qué se exige `Origin` y no se acepta su ausencia
 *
 * Una petición desde un servidor no lleva `Origin`. Aceptarla dejaría la lista sin efecto en el
 * único caso donde tendría alguno, así que se rechaza — con la consecuencia escrita: **la web de
 * destino no puede pedir borradores desde su servidor**, solo desde el navegador. Es lo que
 * describe §4.6, y es la dirección segura en la que equivocarse.
 *
 * ## No hay manejador de `OPTIONS`, y no es un olvido
 *
 * Un `GET` sin cabeceras propias es una petición simple de CORS: el navegador no hace preflight.
 * Añadir un `OPTIONS` sería escribir una rama que ningún cliente recorre y que nadie probaría.
 * Si algún día el cliente de §4.6 mandara una cabecera propia, hará falta — y se notará porque
 * el navegador empezará a preguntar.
 *
 * ## 404 en todos los rechazos
 *
 * Apagada, con el origen mal, sin token, con el token caducado o mal firmado: la misma respuesta
 * vacía. Un 403 confirmaría que la ruta existe y que solo falta la credencial correcta, que es
 * justo lo que le falta a quien esté probando.
 */
export const runtime = 'nodejs';

/**
 * Las cabeceras que van en **todas** las respuestas de esta ruta, incluidos los 404.
 *
 * `no-store` porque son borradores y no deben quedarse en ninguna caché. `Vary: Origin` porque
 * la respuesta depende de esa cabecera: sin él, una caché intermedia que guardara el 404 de un
 * origen ajeno se lo serviría al permitido, y la vista previa fallaría de forma intermitente y
 * sin motivo aparente.
 *
 * En los 404 no aporta seguridad —no hay nada que cachear que filtre nada— y aporta que no se
 * rompa. Ponerlas solo en el camino bueno sería dejar el otro a merced de lo que haya delante.
 */
const CABECERAS = {
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};

/** Vacía y sin `Access-Control-Allow-Origin`: quien la recibe no aprende nada. */
function noExiste(): Response {
  return new Response(null, { status: 404, headers: CABECERAS });
}

export async function GET(request: Request): Promise<Response> {
  // Sin `PREVIEW_ORIGINS` esto es una lista vacía, y una lista vacía no deja pasar a nadie:
  // el 404 de T-R-1 sale de aquí, sin una comprobación aparte que pueda desincronizarse.
  const origen = origenPermitido(request.headers.get('origin'), origenesDeVistaPreviaRemota());
  if (origen === null) return noExiste();

  const token = new URL(request.url).searchParams.get('token');

  let key: string | undefined;
  try {
    const verificado = verifyToken('preview-remoto', token);
    key = verificado.ok ? verificado.data['key'] : undefined;
  } catch {
    // `verifyToken` **lanza** si `APP_SECRET` falta o es corto: eso es un despliegue roto, no un
    // token inválido. Desde aquí se responde 404 igualmente, por lo mismo que en `/preview`: un
    // 500 con traza en una ruta pública confirma que existe y que algo interno se ha roto, y en
    // una plataforma compartida esa traza acaba en registros que no controlamos.
    key = undefined;
  }

  if (key === undefined) return noExiste();

  // Exactamente lo que ve `/preview`: el borrador de la clave que autoriza el token y lo
  // publicado de todo lo demás (ADR-501). Ni una clave más, y no es una promesa de esta ruta
  // sino una propiedad de la función — que es donde está probada.
  const { contenido, objetivo } = await previewContentConObjetivo(key);

  return Response.json(
    { contenido, objetivo },
    {
      headers: {
        ...CABECERAS,
        // El origen **de esta petición**, nunca `*`. Con `*` cualquier página abierta en el
        // navegador de quien edita podría leer la respuesta con un token filtrado.
        'Access-Control-Allow-Origin': origen,
      },
    }
  );
}
