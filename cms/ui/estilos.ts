/**
 * El vocabulario visual del panel, en un solo sitio (spec 11).
 *
 * ## Por qué existe
 *
 * Porque el rediseño de #224 toca veintitantos ficheros, y un botón principal escrito veintitantas
 * veces son veintitantas oportunidades de que uno se quede con el radio de antes, o sin el anillo
 * de foco, o con 36 píxeles de alto en vez de 44. Eso no se ve revisando el diff: se ve entrando
 * en esa pantalla concreta.
 *
 * No es un sistema de componentes —para eso habría que envolver cada `<button>`, y las Server
 * Actions y los `formAction` hacen eso incómodo—. Es lo más barato que resuelve el problema: las
 * clases con nombre.
 *
 * ## Este fichero también pasa por la guarda de colores
 *
 * `tests/unit/sin-colores-literales.test.ts` recorría solo los `.tsx`, así que mover clases a un
 * `.ts` las habría sacado de la vigilancia — y este fichero es justamente donde más clases de
 * color hay. La guarda se amplió a `.ts` con este cambio; sin eso, esta refactorización habría
 * abierto un agujero mientras parecía ordenar.
 */

/**
 * El foco visible.
 *
 * Sobre el vidrio el anillo por defecto del navegador se pierde entre el desenfoque y el filo, así
 * que se pinta uno propio en el color de acento. No es preferencia estética: sin él, quien navega
 * con teclado deja de saber dónde está.
 */
export const ANILLO_DE_FOCO =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento';

/** Igual, pero para lo destructivo: un anillo de acento sobre un botón rojo se lee como un error. */
export const ANILLO_DE_FOCO_ALARMA =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alarma';

/**
 * Lo común a todo lo pulsable.
 *
 * **`h-11` son 44 píxeles**, que es el mínimo de las guías de accesibilidad de las dos
 * plataformas móviles y lo que hoy incumplen once de catorce zonas pulsables del editor (spec 10
 * §5). Va en la base y no en cada botón para que la próxima no nazca ya incumpliéndolo.
 */
const BOTON_BASE = `inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${ANILLO_DE_FOCO}`;

/** La acción principal de una pantalla. Sólida, nunca de vidrio: tiene que leerse a la primera. */
export const BOTON_PRINCIPAL = `${BOTON_BASE} bg-accion text-sobre-accion hover:bg-accion-hover`;

/**
 * Lo demás que se puede pulsar.
 *
 * **Superficie opaca, no vidrio**, y esto se escribió al revés primero. La versión translúcida
 * se leía bien y contradecía dos cosas a la vez:
 *
 * 1. **La spec 11 §3**, que pone los botones en la columna de «no hay vidrio». O sea que el
 *    código decía una cosa y el documento otra, que es de donde salen los fallos que nadie busca.
 * 2. **La premisa de ADR-800**, que es la que hace calculable el contraste: «detrás de un vidrio
 *    del panel solo hay el fondo de la página». Un botón de vidrio dentro de una tarjeta de
 *    vidrio —y estaba en cinco sitios: la confirmación, el historial, la biblioteca, las
 *    personas y el editor— tiene **otro vidrio** detrás, no el fondo.
 *
 * Y no era teórico. Apilando dos láminas en modo oscuro, `tinta-tenue` cae de 4,93:1 a
 * **4,09:1** — por debajo de AA. La guarda seguía verde porque compone una sola capa, que es
 * exactamente el modo de fallo que ADR-800 dice evitar, reaparecido por la puerta de al lado.
 *
 * Dos vidrios superpuestos tampoco se leen como profundidad: se leen como suciedad.
 */
export const BOTON_SUAVE = `${BOTON_BASE} border border-linea bg-superficie text-tinta hover:bg-superficie-suave`;

/** Lo que no cambia nada: cancelar, volver. Sin superficie propia. */
export const BOTON_LLANO = `${BOTON_BASE} text-tinta-suave hover:bg-superficie-suave hover:text-tinta`;

/** Lo destructivo. */
export const BOTON_ALARMA = `inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-alarma-accion px-4 text-sm font-medium text-sobre-alarma transition hover:bg-alarma-accion-hover disabled:cursor-not-allowed disabled:opacity-60 ${ANILLO_DE_FOCO_ALARMA}`;

/**
 * Un control pequeño y cuadrado: mover en una lista, cerrar un diálogo.
 *
 * Sigue midiendo 44 píxeles. Un icono de 20 dentro de una caja de 44 parece desproporcionado en
 * una maqueta y es exactamente lo que hace que se pueda pulsar con el pulgar.
 */
export const BOTON_ICONO = `inline-flex size-11 items-center justify-center rounded-xl text-tinta-suave transition hover:bg-superficie-suave hover:text-tinta disabled:cursor-not-allowed disabled:opacity-40 ${ANILLO_DE_FOCO}`;

/**
 * Un campo de formulario.
 *
 * **Sin vidrio, y es la regla de la spec 11 §3**: aquí se escribe y se lee durante minutos
 * seguidos, y un fondo translúcido cambia de contraste según lo que pase por detrás al hacer
 * scroll. La superficie es opaca y el vidrio se queda para lo que flota.
 *
 * **`min-h-11` son los 44 px de T-213-3**, y hacían falta: medido en un móvil de 390 px, los
 * campos del editor daban **42**. Dos píxeles no se ven y son la diferencia entre cumplir el
 * mínimo de las guías de accesibilidad y no cumplirlo — el padding solo no basta porque depende
 * de la altura de línea de la letra, que cambió al cambiar la fuente.
 */
export const CAMPO = `min-h-11 w-full rounded-xl border border-linea bg-superficie px-3 py-2.5 text-tinta transition placeholder:text-tinta-tenue hover:border-linea-fuerte focus:border-acento ${ANILLO_DE_FOCO}`;

/** Un campo que además crece: el textarea y el editor de texto rico. */
export const CAMPO_ALTO = `${CAMPO} min-h-28`;

/** Una lámina que flota sobre el fondo: las tarjetas y las cajas de una lista. */
export const TARJETA = 'lamina-tarjeta rounded-2xl';

/**
 * Una superficie opaca para leer encima.
 *
 * Es lo que va debajo de un texto largo, de una tabla y de **cualquier cosa sobre una imagen**:
 * la foto que suba alguien puede ser blanca o negra, y encima de ella ningún texto tiene el
 * contraste garantizado (ADR-800).
 */
export const SUPERFICIE = 'rounded-2xl border border-linea bg-superficie';

/** El título de una pantalla. */
export const TITULO = 'text-2xl font-semibold tracking-tight text-tinta';

/** Un aviso. **Nunca de vidrio**: un error tiene que leerse en la peor circunstancia. */
export const AVISO_ALARMA =
  'flex items-start gap-2.5 rounded-xl border border-alarma-linea bg-alarma-fondo px-3.5 py-3 text-sm text-alarma';

export const AVISO_PENDIENTE =
  'flex items-start gap-2.5 rounded-xl border border-pendiente-linea bg-pendiente-fondo px-3.5 py-3 text-sm text-pendiente-tinta';

export const AVISO_PUBLICADO =
  'flex items-start gap-2.5 rounded-xl border border-publicado-linea bg-publicado-fondo px-3.5 py-3 text-sm text-publicado-tinta';
