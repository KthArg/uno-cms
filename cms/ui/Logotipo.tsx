// isomorphic: solo presentación. Un dibujo, sin estado y sin acceso a nada del servidor.

/**
 * La marca de UnoCMS (issue #234).
 *
 * ## De dónde sale la forma
 *
 * Del nombre: **uno**. Un «1» dentro de un cuadrado redondeado, que es la forma que tiene
 * cualquier icono de aplicación desde hace diez años — y eso no es pereza, es lo que hace que se
 * reconozca como el icono de un producto y no como un adorno de la interfaz.
 *
 * El «1» va **en negativo**, recortado del cuadrado con `fill-rule="evenodd"`. Eso tiene una
 * consecuencia práctica que no es estética: **el dibujo entero es un solo color**. Hereda
 * `currentColor`, así que sirve igual en el naranja del modo oscuro, en el celeste del claro, en
 * blanco sobre una foto o en negro sobre papel — sin una segunda versión que mantener.
 *
 * ## Por qué esta y no las otras tres
 *
 * Se dibujaron cuatro y se miraron a 64, 32 y **16 píxeles**, que es donde se decide: un icono
 * de aplicación acaba siempre en una pestaña de navegador. La versión de trazo fino —un círculo
 * con el uno dentro— era la más bonita en grande y a 16 px se emborronaba hasta ser una mancha.
 * Esta llena más el cuadro y el arranque en diagonal se sigue leyendo pequeño.
 *
 * ## Y por qué hay un SVG a mano aquí
 *
 * Porque no es un icono de interfaz: es la marca. `cms/ui/iconos.tsx` existe para que los
 * dibujos de la interfaz salgan de una librería y pasen por el envoltorio que decide si se
 * anuncian; una marca no sale de ninguna librería. La guarda T-215-2 lo tiene declarado como
 * excepción, con este motivo escrito.
 */

export interface LogotipoProps {
  /** En píxeles. 28 es el del panel; 16 el mínimo al que sigue leyéndose. */
  readonly tamano?: number;
  /**
   * El nombre accesible, **solo si el logotipo va solo**.
   *
   * En la cabecera va al lado del nombre del sitio, así que ahí es decorativo y se oculta: un
   * lector de pantalla que dijera «UnoCMS Tu sitio» estaría leyendo dos cosas donde hay una.
   */
  readonly etiqueta?: string;
  readonly className?: string;
}

/** El contorno del cuadrado y el «1» recortado, en un solo trazado. */
export const TRAZADO_DEL_LOGOTIPO =
  'M9 0h14a9 9 0 0 1 9 9v14a9 9 0 0 1-9 9H9a9 9 0 0 1-9-9V9a9 9 0 0 1 9-9Zm11.5 7H16l-6 3.9v4.8l4.8-3V25h5.7V7Z';

export function Logotipo({ tamano = 28, etiqueta, className }: LogotipoProps) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 32 32"
      fill="currentColor"
      className={`shrink-0 ${className ?? ''}`}
      aria-hidden={etiqueta === undefined ? true : undefined}
      role={etiqueta === undefined ? undefined : 'img'}
      aria-label={etiqueta}
    >
      <path fillRule="evenodd" d={TRAZADO_DEL_LOGOTIPO} />
    </svg>
  );
}
