import { pedirPublicado } from '../lib/contenido.js';
import { paginaHtml } from '../lib/pagina.js';

/**
 * La función que sirve la página (issue #195).
 *
 * Una sola, y `vercel.json` manda aquí todas las direcciones. Un ejemplo con enrutador sería un
 * ejemplo sobre enrutadores.
 *
 * ## Por qué esto corre en el servidor
 *
 * Porque lo publicado se pide al CMS desde aquí: `/api/content/:key` no manda cabeceras CORS
 * (T-R-14), así que el navegador no podría leerlo. Ver `lib/contenido.js`.
 */
export default async function handler(peticion, respuesta) {
  const cmsUrl = process.env.CMS_URL;

  try {
    const contenido = await pedirPublicado(cmsUrl);

    respuesta.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Sin caché: esta web se usa para mirar cambios recién publicados, y una respuesta guardada
    // haría que publicar pareciera no hacer nada. Una web de verdad cachearía y revalidaría.
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
