// isomorphic: solo presentación. Sin estado, sin efectos y sin acceso a nada del servidor.
import type { SectionState } from '@/cms/core/content';
import { Icono, type NombreDeIcono } from './iconos';

/**
 * La etiqueta de estado, en un solo sitio.
 *
 * Estaba dentro de `SectionCard` y la usan ya dos pantallas —el panel de contenido y la de una
 * colección—. Copiarla habría sido dos textos que dicen lo mismo hasta el día que uno cambie:
 * el editor vería "Publicado" en una pantalla y "Al día" en otra para el mismo estado, y no
 * habría forma de saber cuál de las dos miente.
 *
 * ## Los tres tienen forma propia, no solo color (spec 11 §5, ADR-802)
 *
 * El acento del panel es el mismo ámbar que «cambios sin publicar», a propósito. Eso hace que la
 * forma del icono no sea decoración: es lo que distingue los tres estados para quien no separa
 * ese ámbar del jade, que es alrededor del 8 % de los hombres.
 *
 * Y el icono va **con** el texto, no en su lugar: `SPEC.md` §9 fija estas tres frases.
 */
const ETIQUETAS: Record<SectionState, { texto: string; icono: NombreDeIcono; clase: string }> = {
  publicado: {
    texto: 'Publicado',
    icono: 'publicado',
    clase: 'bg-publicado-fondo text-publicado-tinta ring-publicado-linea',
  },
  'con-cambios': {
    texto: 'Cambios sin publicar',
    icono: 'conCambios',
    clase: 'bg-pendiente-fondo text-pendiente-tinta ring-pendiente-linea',
  },
  'sin-publicar': {
    texto: 'Sin publicar todavía',
    icono: 'sinPublicar',
    clase: 'bg-superficie-suave text-tinta-suave ring-linea-fuerte',
  },
};

export function EstadoDeSeccion({ estado }: { estado: SectionState }) {
  const etiqueta = ETIQUETAS[estado];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-xs font-medium ring-1 ring-inset ${etiqueta.clase}`}
    >
      <Icono de={etiqueta.icono} tamano={14} />
      {etiqueta.texto}
    </span>
  );
}
