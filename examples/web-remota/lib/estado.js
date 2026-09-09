import { crearAlmacen } from './almacen.js';

/**
 * El almacén que comparten la página y el receptor de avisos, **dentro de una instancia**.
 *
 * ## Por qué existe este fichero de tres líneas
 *
 * Porque `api/pagina.js` y `api/aviso.js` son dos funciones distintas y tienen que hablar del
 * mismo contenido: si el aviso marca `hero` como pendiente en un almacén y la página lee de
 * otro, no pasa absolutamente nada y **no hay ningún error que lo diga**. Un módulo compartido
 * es lo que hace que sea el mismo objeto.
 *
 * ## Y la limitación, otra vez, porque es la que se olvida
 *
 * «El mismo objeto» vale **dentro de un proceso**. En serverless hay varios, y el aviso llega a
 * uno: los demás siguen sirviendo lo que tenían. En una web con poco tráfico suele haber una
 * sola instancia caliente y esto se comporta como uno espera — «suele» no es una garantía, y
 * construir sobre «suele» es cómo se acaba con un fallo que solo aparece los días buenos.
 *
 * Si esto fuera una web de verdad, aquí es donde iría Redis, KV, o la revalidación de tu
 * framework. Está contado en `almacen.js` y en el README, con qué usar en cada caso.
 */
let almacen;

export function almacenDeEstaInstancia() {
  almacen ??= crearAlmacen();
  return almacen;
}
