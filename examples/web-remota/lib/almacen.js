/**
 * Lo publicado, guardado, y **marcado como pendiente cuando llega un aviso** (issue #287).
 *
 * ## Qué resuelve
 *
 * Hasta ahora esta web no cacheaba nada, y su propio README lo decía: «una web de verdad
 * cachearía lo publicado y lo revalidaría al publicar». Esto es esa segunda mitad. Con el aviso
 * del CMS, la página se sirve de aquí y **solo se vuelve a pedir lo que el aviso nombra**.
 *
 * ## La limitación que hay que leer antes de copiar esto
 *
 * **Esto es memoria del proceso, y en serverless hay más de un proceso.** El aviso llega a una
 * instancia; las demás siguen sirviendo lo que tenían hasta que se apaguen. No es un descuido y
 * no se puede arreglar con más código aquí: hace falta un sitio compartido.
 *
 * Lo que se enseña con esto es **la forma del contrato** —qué se guarda, qué se invalida y
 * cuándo se vuelve a pedir—. El almacén es la pieza que cambias:
 *
 * | Si tu web es… | Lo que usas en vez de esto             |
 * | ------------- | -------------------------------------- |
 * | Next          | `revalidateTag(tag)` con los `tags` del aviso, que ya vienen con ese formato |
 * | Otra cosa     | Redis, KV, la caché de tu CDN… cualquier cosa que compartan las instancias  |
 *
 * Se hace en memoria y sin dependencias porque el ejemplo no puede pedirte una base de datos
 * para enseñarte un contrato. Pero decirlo a medias sería peor que no traerlo.
 */

/** El prefijo que usa el CMS para los tags de contenido. Ver `contentTag()` en `cms/core/content.ts`. */
const PREFIJO_CONTENIDO = 'content:';

/**
 * De los `tags` del aviso a las claves que esta web sabe pedir.
 *
 * Un tag que no reconocemos **se ignora en silencio, y a propósito**: el CMS puede añadir
 * eventos y tags nuevos —`settings` es el primero— y una web vieja no tiene por qué caerse ni
 * ponerse a pedir cosas que no entiende. Ignorar lo desconocido es lo que hace que este contrato
 * se pueda ampliar sin romper a quien ya lo sigue.
 */
export function clavesDeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return tags
    .filter((tag) => typeof tag === 'string' && tag.startsWith(PREFIJO_CONTENIDO))
    .map((tag) => tag.slice(PREFIJO_CONTENIDO.length))
    .filter((clave) => clave !== '');
}

/**
 * Un almacén nuevo y vacío.
 *
 * Es una función y no un objeto de módulo para que los tests puedan tener el suyo. Un almacén
 * compartido entre casos haría que el orden de los tests decidiera el resultado, que es la forma
 * más cara de tener una suite verde que no prueba nada.
 */
export function crearAlmacen() {
  /** clave → `{ valor, pendiente, v }`. `v` es el `ts` del aviso que la marcó. */
  const entradas = new Map();

  /**
   * Los `id` de aviso ya aplicados, para no revalidar dos veces.
   *
   * **Con tope**, y el tope es la mitad del asunto: sin él, esto crece con cada aviso hasta que
   * el proceso se queda sin memoria. Una fuga que solo aparece en despliegues con mucha
   * publicación y meses de vida es de las que no se encuentran mirando el código.
   */
  const idsVistos = [];
  const TOPE_DE_IDS = 200;

  return {
    /** Si esa clave se puede servir sin preguntar al CMS. */
    sirveDeAqui(clave) {
      const entrada = entradas.get(clave);
      return entrada !== undefined && !entrada.pendiente;
    },

    leer(clave) {
      return entradas.get(clave)?.valor;
    },

    /** El `?v=` con el que hay que pedirla, o `undefined` si nunca la avisaron. */
    versionDe(clave) {
      return entradas.get(clave)?.v;
    },

    guardar(clave, valor) {
      entradas.set(clave, { valor, pendiente: false, v: entradas.get(clave)?.v });
    },

    /**
     * Aplica un aviso ya verificado. Devuelve `false` si era repetido.
     *
     * El reintento del CMS manda **el mismo `id`** justamente para que esto se pueda hacer. Sin
     * esta comprobación, un reintento tras un timeout que en realidad sí llegó hace pedir dos
     * veces lo mismo.
     */
    aplicarAviso(sobre) {
      if (idsVistos.includes(sobre.id)) return false;

      idsVistos.push(sobre.id);
      if (idsVistos.length > TOPE_DE_IDS) idsVistos.shift();

      for (const clave of clavesDeTags(sobre.tags)) {
        const entrada = entradas.get(clave);
        // Solo se marca lo que ya se tenía. Marcar una clave que nunca se pidió no adelanta
        // nada: la primera vez se va a pedir igual, y sin `?v=` porque no hay copia vieja que
        // esquivar.
        if (entrada !== undefined)
          entradas.set(clave, { ...entrada, pendiente: true, v: sobre.ts });
      }

      return true;
    },

    /** Para los tests y para mirar por dentro. No lo usa la página. */
    estado() {
      return [...entradas.entries()].map(([clave, entrada]) => ({
        clave,
        pendiente: entrada.pendiente,
        v: entrada.v,
      }));
    },
  };
}
