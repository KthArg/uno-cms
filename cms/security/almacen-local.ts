import 'server-only';

/**
 * Cuándo se guardan las imágenes en el disco de quien desarrolla, en vez de en Vercel Blob.
 *
 * ## Por qué existe este fichero aparte
 *
 * Podría ser un `if` dentro de la ruta. Está aquí porque **es la condición que hace aceptable
 * todo lo demás**, y una condición de seguridad metida en medio de un manejador es una
 * condición que nadie prueba: acaba comprobándose de pasada, junto con otras cinco cosas, en un
 * test que va de otra cosa.
 *
 * Entra el entorno y sale un booleano. Eso se prueba con los cuatro casos de la spec §5.1 y no
 * hace falta ni un servidor ni una base de datos.
 *
 * ## La condición
 *
 * Las dos cosas a la vez, y la segunda es la que importa:
 *
 * 1. **No hay `BLOB_READ_WRITE_TOKEN`.** Si hay almacén conectado, se usa. El camino de
 *    producción no se toca ni se adivina.
 * 2. **No estamos en producción.**
 *
 * ## Por qué la segunda no es cinturón y tirantes
 *
 * El disco de una función serverless es **efímero y no se comparte entre instancias**. Un
 * almacén en disco desplegado no falla: acepta el fichero, responde que todo fue bien, y lo
 * pierde. El panel enseñaría "subida" y la landing un hueco, semanas después, sin nada en
 * ningún registro que conecte las dos cosas.
 *
 * De todos los fallos posibles ese es el peor, porque **se parece al éxito**. Por eso la
 * comprobación no está para prevenir un despiste: está para que este código no pueda ejecutarse
 * donde haría daño, y por eso T-A-2 es el test que más importa de los dieciséis.
 *
 * Un almacén en disco **sí** tiene sentido en un servidor propio con disco persistente. No se
 * cubre aquí: exigiría decidir dónde vive el directorio, cómo se respalda y qué pasa al escalar
 * a dos instancias, y eso es un producto distinto del que describe `SPEC.md` §2. Lo que hay que
 * cambiar para permitirlo es esta función y nada más, que es justo la razón de que esté sola.
 */

/** El directorio donde se guardan. Fuera de `public/`: lo que se sirve, lo sirve una ruta. */
export const DIRECTORIO_LOCAL = '.uploads';

export function usarAlmacenLocal(
  entorno: Record<string, string | undefined> = process.env
): boolean {
  const token = entorno['BLOB_READ_WRITE_TOKEN'];

  // Una cadena vacía es lo que queda cuando alguien deja la variable declarada y sin valor —
  // pasa al copiar `.env.example`. Tratarla como "hay token" dejaría el almacén local apagado y
  // el de Vercel roto: lo peor de los dos.
  const hayToken = token !== undefined && token.trim() !== '';

  return !hayToken && entorno['NODE_ENV'] !== 'production';
}
