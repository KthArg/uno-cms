// isomorphic: solo presentación. La lista y el idioma actual llegan del layout, y el cambio lo
// hace una server action que guarda la cookie (`cms/core/idioma-del-panel.ts`).
import { ANILLO_DE_FOCO } from './estilos';
import { Icono } from './iconos';

export interface IdiomaDelSelector {
  readonly codigo: string;
  readonly nombre: string;
}

export interface SelectorDeIdiomaProps {
  readonly idiomas: readonly IdiomaDelSelector[];
  readonly actual: string;
  /**
   * Dónde se está, para que el servidor decida si hay que salir de la pantalla al cambiar: un
   * elemento de lista no existe en el otro idioma (`destinoAlCambiarDeIdioma`).
   */
  readonly ruta: string;
  readonly onCambiar: (datos: FormData) => Promise<void>;
}

/**
 * El idioma en el que se trabaja, en la cabecera (spec 17 §5.9, T-ID-40).
 *
 * **Un botón por idioma y no un desplegable.** Un `<select>` necesita JavaScript para enviarse
 * al cambiar, y el panel cambia de tema y cierra sesión con formularios que funcionan sin él. Con
 * dos o tres idiomas, que es lo normal, los botones además dejan ver todos de un vistazo.
 *
 * Se ve el código (`ES`, `EN`) para que quepa en un móvil; el nombre va en el nombre accesible y
 * en `title`. Solo en `aria-label`, no como texto oculto además, por la lección del enlace de la
 * cuenta en `PanelShell`: con las dos, el nombre accesible pasa a ser la suma.
 */
export function SelectorDeIdioma({ idiomas, actual, ruta, onCambiar }: SelectorDeIdiomaProps) {
  return (
    <form action={onCambiar} className="flex items-center">
      <input type="hidden" name="ruta" value={ruta} />
      <div
        role="group"
        aria-label="Idioma del contenido"
        className="flex items-center gap-0.5 rounded-lg ring-1 ring-linea ring-inset"
      >
        <span className="hidden px-1.5 text-tinta-tenue sm:inline-flex" aria-hidden="true">
          <Icono de="idioma" tamano={16} />
        </span>
        {idiomas.map((idioma) => {
          const elegido = idioma.codigo === actual;
          return (
            <button
              key={idioma.codigo}
              type="submit"
              name="idioma"
              value={idioma.codigo}
              aria-label={idioma.nombre}
              aria-pressed={elegido}
              title={idioma.nombre}
              // 44 px de alto y de ancho, el mínimo de las guías que el resto de la cabecera ya
              // cumple. Con 36 lo cazó el e2e del móvil (T-213-3), que mide todo lo pulsable.
              className={`flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-semibold tracking-wide uppercase pulsable ${
                elegido
                  ? 'bg-superficie text-tinta shadow-sm ring-1 ring-linea-fuerte'
                  : 'text-tinta-suave hover:bg-superficie-suave hover:text-tinta'
              } ${ANILLO_DE_FOCO}`}
            >
              {idioma.codigo}
            </button>
          );
        })}
      </div>
    </form>
  );
}
