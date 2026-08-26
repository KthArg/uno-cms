/**
 * El reparto de la pantalla del editor entre el formulario y la vista previa (issue #190).
 *
 * ## Por qué esto es un módulo y no unos números dentro del componente
 *
 * Porque lo que decide es **si la pantalla se puede romper arrastrando**, y eso son dos
 * comparaciones que hay que poder ejercitar con veinte valores sin montar un DOM. Metidas dentro
 * de un manejador de puntero acaban probándose con un arrastre simulado, que es caro de escribir
 * y prueba menos.
 *
 * Entra lo que se pide y lo que hay; sale lo que se puede dar.
 */

/**
 * Lo más estrecho que se deja el formulario, en píxeles.
 *
 * No es un número redondo elegido a ojo: por debajo de esto los campos de texto dejan de
 * enseñar una frase entera y escribir un subtítulo se convierte en mirar por una rendija. La
 * vista previa importa, pero el formulario es donde se trabaja.
 */
export const MINIMO_DEL_FORMULARIO = 320;

/**
 * Y lo más estrecho que se deja la vista previa.
 *
 * Por debajo de un móvil no tiene sentido: si no cabe ni la pantalla más estrecha que se puede
 * elegir, lo que queda es un recuadro que no contesta ninguna pregunta.
 */
export const MINIMO_DE_LA_VISTA_PREVIA = 360;

/** Con qué ancho empieza el formulario la primera vez. */
export const ANCHO_INICIAL_DEL_FORMULARIO = 480;

/** Cuánto mueve cada pulsación de flecha. Ver el caso T-190-3. */
export const PASO_DE_TECLADO = 32;

/**
 * El ancho que se le puede dar al formulario, dado lo que se pide y lo que hay.
 *
 * ## Los topes no son cortesía
 *
 * Un arrastre llega hasta donde llegue el ratón, incluidos los bordes de la pantalla y más allá.
 * Sin topes, soltar fuera deja el formulario a cero —o a todo— y la pantalla se queda inservible
 * hasta recargar, con el ancho ya guardado para la próxima vez. Es de los pocos fallos de
 * interfaz que **sobreviven a cerrar la pestaña**.
 *
 * ## Y cuando no se sabe cuánto hay
 *
 * En el primer pintado nadie ha medido todavía, y en los tests de componentes jsdom no maqueta:
 * todas las cajas miden cero. Ahí se respeta el mínimo del formulario y no se recorta por
 * arriba: recortar contra un ancho disponible de cero dejaría el formulario clavado en su
 * mínimo antes de que nadie hubiera visto la pantalla.
 */
export function anchoDelFormulario(pedido: number, disponible: number): number {
  const conMinimo = Number.isFinite(pedido)
    ? Math.max(MINIMO_DEL_FORMULARIO, Math.round(pedido))
    : ANCHO_INICIAL_DEL_FORMULARIO;

  if (!Number.isFinite(disponible) || disponible <= 0) return conMinimo;

  // Si no cabe todo, manda el mínimo del formulario: es donde se escribe. La vista previa se
  // queda por debajo de su mínimo, que es feo y visible — mejor que un formulario inservible.
  const maximo = Math.max(MINIMO_DEL_FORMULARIO, disponible - MINIMO_DE_LA_VISTA_PREVIA);

  return Math.min(conMinimo, maximo);
}

/** Dónde se recuerda. Una clave por si algún día hay otra preferencia de reparto. */
const CLAVE = 'unocms:ancho-del-formulario';

/**
 * Lee el ancho recordado, o `null` si no hay ninguno **o si el navegador no deja mirar**.
 *
 * El `try` no es preventivo: `localStorage` **lanza** en navegación privada de algunos
 * navegadores y cuando el sitio tiene el almacenamiento bloqueado por configuración. Sin él, el
 * editor entero dejaría de pintarse para quien navegue así, y el fallo aparecería como una
 * pantalla en blanco sin relación aparente con un divisor.
 */
export function leerAnchoGuardado(): number | null {
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    if (guardado === null) return null;

    const numero = Number(guardado);
    return Number.isFinite(numero) && numero > 0 ? numero : null;
  } catch {
    return null;
  }
}

/** Guarda el ancho. Si el navegador no deja, no pasa nada: se pierde la preferencia, no la página. */
export function guardarAncho(ancho: number): void {
  try {
    window.localStorage.setItem(CLAVE, String(Math.round(ancho)));
  } catch {
    // Sin registro y sin aviso: que no se recuerde el reparto de la pantalla no es algo que
    // quien edita necesite saber, y contarlo sería ruido en una pantalla de trabajo.
  }
}
