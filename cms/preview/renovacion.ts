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

/**
 * Entra cuánto vive el token —lo dice el servidor al emitirlo— y cuánto lleva vivo —lo mide
 * quien lo tiene—, y sale qué hacer.
 *
 * `transcurridoEnSegundos` debe venir de un reloj **monótono** (`performance.now()`). Con
 * `Date.now()` funciona casi siempre y falla justo cuando el sistema corrige la hora.
 */
export function estadoDelTokenRemoto(
  vidaEnSegundos: number,
  transcurridoEnSegundos: number
): EstadoDelTokenRemoto {
  // **Lo que no se entiende no se da por bueno**, y esto no es defensa preventiva: sin estas
  // dos líneas, el valor por defecto de una entrada rota es `'vale'`, que es el único de los
  // tres que no obliga al panel a hacer nada. Comprobado con los cinco casos escritos abajo.
  //
  // El camino realista es que #180 llame a esto con lo que devuelva el servidor y a alguien se
  // le pase un campo: `undefined - 10` es `NaN`, `NaN <= 0` es falso y `NaN <= margen` también,
  // así que el token se declararía sano **para siempre**. La vista previa seguiría enseñando lo
  // último que recibió con un token muerto, que es exactamente la forma silenciosa de mentir
  // que la spec §4.2 prohíbe.
  //
  // `caducado` y no `toca-renovar`: si los números están rotos, renovar traerá otros igual de
  // rotos. Lo útil es que se vea, y `caducado` es el estado que obliga al panel a decirlo.
  if (!Number.isFinite(vidaEnSegundos) || !Number.isFinite(transcurridoEnSegundos)) {
    return 'caducado';
  }

  // Un tiempo transcurrido negativo significa que el reloj se ha movido hacia atrás — una
  // corrección de NTP, por ejemplo. Aquí el dato no está roto, solo deja de ser fiable: la
  // resta daría **más** vida de la que hay y el token moriría sin que nadie lo pidiera de nuevo.
  //
  // Se pide otro y ya está. No se declara caducado: matar la vista previa por un ajuste de
  // reloj sería un castigo desproporcionado para algo que se arregla con una petición.
  //
  // Lo correcto es que quien llame use un reloj **monótono** —`performance.now()`—, que no da
  // saltos por definición. Esto está aquí porque lo más fácil de escribir es `Date.now()`, y lo
  // más fácil de escribir es lo que se acaba escribiendo.
  if (transcurridoEnSegundos < 0) return 'toca-renovar';

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
