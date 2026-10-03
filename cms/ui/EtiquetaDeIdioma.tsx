// isomorphic: solo presentación. El nombre del idioma llega ya resuelto desde la página.
import { Icono } from './iconos';

/**
 * «En English»: en qué idioma se está trabajando en esta pantalla (spec 17 §5.9, T-ID-41).
 *
 * El selector de la cabecera ya lo marca, pero el selector dice **qué se ha elegido** y esto dice
 * **qué tienes delante**. Con dos pestañas abiertas pueden no coincidir —en la otra se cambió el
 * idioma—, y lo que importa al escribir es lo segundo: las actions de esta pantalla van al idioma
 * con el que se compuso, que es el que pone aquí.
 *
 * Solo se pinta en un sitio con varios idiomas. Con uno, decir «en Español» en cada pantalla es
 * ruido que no responde a ninguna pregunta.
 */
export function EtiquetaDeIdioma({ nombre }: { nombre: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-superficie-suave py-1 pr-3 pl-2 text-xs font-medium text-tinta-suave ring-1 ring-linea-fuerte ring-inset">
      <Icono de="idioma" tamano={14} />
      En {nombre}
    </span>
  );
}
