import { almacenDeEstaInstancia } from '../lib/estado.js';
import { verificarAviso } from '../lib/aviso.js';

/**
 * El receptor del aviso del CMS (issue #287).
 *
 * ## Por qué este fichero usa OTRA firma que `api/pagina.js`
 *
 * `pagina.js` usa la firma de Node de Vercel, `(peticion, respuesta)`. Este usa la **firma Web**,
 * `Request` → `Response`. No es capricho ni descuido: **es la única de las dos que da el cuerpo
 * crudo**.
 *
 * Con la firma de Node, Vercel rellena `request.body` con el JSON **ya analizado** cuando el
 * `Content-Type` es `application/json`, y no entrega el texto original. Y la firma del aviso se
 * calcula sobre el cuerpo tal cual llegó: volver a serializar el objeto para verificarla no
 * funciona, porque `JSON.stringify` no promete reproducir el mismo texto —el orden de las
 * claves, los espacios, cómo se escriben los números—.
 *
 * O sea que con la firma de Node esto **no se puede hacer bien**, solo parecerlo hasta el primer
 * sobre que se serialice distinto. Aquí `await peticion.text()` da lo que hay que verificar.
 *
 * ## Qué responde, y por qué siempre lo mismo
 *
 * `204` si lo acepta, `401` si no, sin decir qué falló. Distinguir «la firma no cuadra» de «el
 * `ts` es viejo» le dice a quien está probando por dónde iba bien.
 *
 * Y **`204` también cuando el aviso era repetido**: para el CMS es lo mismo, ya está aplicado. Un
 * `4xx` ahí sería mentirle —le diría que su configuración está mal, y el CMS no reintenta los
 * `4xx`— por haber hecho justo lo que se espera de él al reintentar.
 */
export function POST(peticion) {
  return manejar(peticion);
}

async function manejar(peticion) {
  const secreto = process.env.WEBHOOK_SECRET;

  // Sin secreto no se puede verificar nada, y sin verificar no se toca la caché: este endpoint
  // hace trabajo cuando se le llama, así que sin puerta sería un amplificador para cualquiera.
  if (typeof secreto !== 'string' || secreto === '') {
    console.error('[web-remota] Falta WEBHOOK_SECRET: los avisos se rechazan todos.');
    return new Response(null, { status: 401 });
  }

  const cuerpoCrudo = await peticion.text();

  const resultado = verificarAviso({ cuerpoCrudo, cabeceras: peticion.headers, secreto });
  if (!resultado.ok) return new Response(null, { status: 401 });

  const nuevo = almacenDeEstaInstancia().aplicarAviso(resultado.sobre);

  // Se registra el `id` y los `tags`, nunca la firma. Sirve para poder cruzar este registro con
  // el `webhook.enviado` del CMS cuando algo no cuadre, que es media depuración hecha.
  console.log(
    `[web-remota] aviso ${resultado.sobre.id} (${resultado.sobre.evento}):`,
    nuevo ? `a repedir ${JSON.stringify(resultado.sobre.tags)}` : 'repetido, ignorado'
  );

  return new Response(null, { status: 204 });
}
