import { contenidoParaLaPagina } from '../lib/contenido.js';
import { almacenDeEstaInstancia } from '../lib/estado.js';
import { paginaHtml } from '../lib/pagina.js';

/**
 * La función que sirve la página (issue #195).
 *
 * Una sola, y `vercel.json` manda aquí todas las direcciones salvo la del aviso. Un ejemplo con
 * enrutador sería un ejemplo sobre enrutadores.
 *
 * ## Por qué esto corre en el servidor
 *
 * Porque lo publicado se pide al CMS desde aquí: `/api/content/:key` no manda cabeceras CORS
 * (T-R-14), así que el navegador no podría leerlo. Ver `lib/contenido.js`.
 */
export default async function handler(peticion, respuesta) {
  const cmsUrl = process.env.CMS_URL;

  try {
    const contenido = await contenidoParaLaPagina(cmsUrl, almacenDeEstaInstancia());

    respuesta.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Sin caché **de la página**, aunque el contenido sí se cachea ahora (#287). Son dos cosas
    // distintas y conviene no mezclarlas: el almacén evita ir al CMS, y esta cabecera evita que
    // una CDN delante de ESTA web sirva un HTML viejo que el aviso no puede invalidar — el aviso
    // llega hasta aquí, no hasta la caché de nadie más.
    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.status(200).send(paginaHtml(contenido, cmsUrl));
  } catch (error) {
    // Se dice qué falta. Es un ejemplo: quien lo despliega necesita saber por qué no va, y aquí
    // no hay nada que proteger — el mensaje habla de **su** configuración, no de nuestras tripas.
    console.error('[web-remota] No se pudo componer la página:', error);

    respuesta
      .status(500)
      .send(
        'No se pudo hablar con el CMS. Comprueba la variable CMS_URL y que ese CMS esté en pie.'
      );
  }
}
