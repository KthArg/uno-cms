/**
 * Cuándo pedir el siguiente token de vista previa remota (spec 08 §4.2, ADR-701).
 *
 * ## Por qué esto es un módulo y no un `if` dentro de un efecto de React
 *
 * Porque es **la condición que hace aceptable el TTL de quince minutos**. Escribí en la spec
 * que "el panel lo renueva mientras la pestaña está abierta" como si fuera una consecuencia
 * del diseño, y no lo es: sin renovación, la vista previa se cae a mitad de una sesión de
 * edición larga — un fallo peor que el que el TTL corto venía a evitar, porque aparece justo
 * cuando alguien lleva rato trabajando.
 *
 * Una condición así metida dentro de un componente acaba comprobándose de pasada, junto con
 * otras cinco cosas, en un test que va de otra cosa. Aquí entran dos números y sale una
 * decisión, y eso se prueba sin navegador. Es el mismo motivo por el que `usarAlmacenLocal()`
 * vive sola.
 *
 * ## Por qué se cuenta el tiempo transcurrido y no se compara contra `exp`
 *
 * Porque el reloj del navegador **no es el del servidor**. Un panel con el reloj cinco minutos
 * atrasado creería que le queda más vida de la que le queda y renovaría tarde: pediría el token
 * nuevo cuando el viejo ya está muerto, y la vista previa se habría caído sin que nada lo
 * viera venir.
 *
 * Midiendo lo transcurrido desde que llegó el token, el desfase deja de importar: lo único que
 * quedaría es la diferencia de **ritmo** entre dos relojes, que en quince minutos no llega al
 * segundo. El servidor dice cuánto vive el token; el panel cuenta cuánto lleva.
 *
 * Y tiene una segunda consecuencia buena: así el `exp` no tiene que salir del token. Nada de
 * lo que hay dentro de la firma necesita viajar por separado.
 */

/**
 * Cuánta vida hay que dejar de margen para pedir el siguiente, en segundos.
 *
 * Tres minutos de los quince. No es "por si acaso": es lo que hace falta para que quepan
 * **varios intentos**, y el número lo fija el caso peor, que no es la red.
 *
 * El caso peor es una pestaña en segundo plano. Los navegadores estrangulan los temporizadores
 * de las pestañas que no se ven hasta aproximadamente uno por minuto, así que con este margen
 * quedan unas tres oportunidades de comprobar y pedir. Con treinta segundos habría una, y si
 * esa se pierde la vista previa muere sin haberlo intentado.
 *
 * Quien mira una vista previa suele tener el panel en otra pestaña **por definición**, así que
 * el caso raro es aquí el normal.
 */
export const MARGEN_DE_RENOVACION_SEGUNDOS = 3 * 60;

/**
 * En qué estado está el token que tiene el panel ahora mismo.
 *
 * `caducado` existe para que el panel **tenga que decir algo**. Sin ese estado, un token muerto
 * y uno vivo se parecen desde el lado del panel, y la vista previa seguiría enseñando lo último
 * que recibió como si estuviera al día. Esa es la forma silenciosa de mentir que la spec §4.2
 * prohíbe: si la renovación falla, se dice y se ofrece recargar.
 */
export type EstadoDelTokenRemoto = 'vale' | 'toca-renovar' | 'caducado';

export function estadoDelTokenRemoto(
  vidaEnSegundos: number,
  transcurridoEnSegundos: number
): EstadoDelTokenRemoto {
  const restante = vidaEnSegundos - transcurridoEnSegundos;

  // `<= 0` y no `< 0`, y la frontera no es un detalle: `verifyToken` rechaza cuando
  // `exp <= ahora`, o sea que en el instante exacto de la caducidad el token **ya no vale**.
  // Con `< 0` aquí, el panel diría "vale" justo en ese segundo y la ruta remota respondería
  // 404 a un token que el panel acababa de dar por bueno. Hay un test que ata las dos
  // funciones en ese instante para que no puedan separarse.
  if (restante <= 0) return 'caducado';
  if (restante <= MARGEN_DE_RENOVACION_SEGUNDOS) return 'toca-renovar';

  return 'vale';
}
