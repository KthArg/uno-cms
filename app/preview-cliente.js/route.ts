import { FUENTE_DEL_CLIENTE_REMOTO } from '@/cms/preview/cliente-remoto';
import { origenPermitido, origenesDeVistaPreviaRemota } from '@/cms/vista-previa-remota';

/**
 * `GET /preview-cliente.js` — el módulo que carga la web de destino (spec 08 §4.6, ADR-701).
 *
 * ## Por qué es una ruta y no un fichero en `public/`
 *
 * Porque un `import()` entre orígenes distintos se hace **en modo CORS**, y un fichero estático
 * sale sin `Access-Control-Allow-Origin`. El síntoma sería un error en la consola de otra
 * persona, en su web, con nuestro nombre — que es el peor sitio donde puede aparecer un fallo
 * nuestro.
 *
 * Siendo una ruta, usa la **misma lista de orígenes** que todo lo demás de esta fase: si algún
 * día se estrecha, se estrecha entera y a la vez.
 *
 * ## Por qué está fuera de `/api`
 *
 * La dirección la fija la spec §4.6 y es la que aparece en la documentación de integración: un
 * `import('https://mi-cms.com/preview-cliente.js')` se lee como lo que es. La extensión importa
 * además para los intermediarios, que deciden por ella mucho más a menudo de lo que deberían.
 *
 * Es la primera ruta del proyecto fuera de `app/api`, así que el inventario de accesos de #104
 * pasó a recorrer `app/` entero: si siguiera mirando solo `app/api`, esta ruta sería la primera
 * que se protege sola sin que nada lo vigile.
 *
 * ## No lleva nada secreto, y aun así se apaga con la fase
 *
 * Este fichero es código nuestro, público y sin una línea de configuración de nadie. Servirlo
 * siempre no filtraría nada. Se apaga igualmente porque **lo que no está encendido no tiene que
 * defenderse**: con la fase apagada, esta ruta no existe y no hay que razonar sobre ella.
 */
export const runtime = 'nodejs';

export function GET(request: Request): Response {
  const origen = origenPermitido(request.headers.get('origin'), origenesDeVistaPreviaRemota());

  // 404 y no 403, igual que el resto de la fase: un 403 confirma que la ruta existe.
  if (origen === null) return new Response(null, { status: 404, headers: { Vary: 'Origin' } });

  return new Response(FUENTE_DEL_CLIENTE_REMOTO, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': origen,
      Vary: 'Origin',
      // Sin caché, y no por secreto: la respuesta **depende del origen que pregunta**, y una
      // caché intermedia que se saltara el `Vary` le serviría a una web el 404 de otra. El
      // fichero son unos pocos kilobytes y solo se pide al abrir una vista previa.
      'Cache-Control': 'no-store',
      // El módulo se ejecuta en otra web; que un intermediario decida por su cuenta que esto
      // es otra cosa sería un problema de esa web y culpa nuestra.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
