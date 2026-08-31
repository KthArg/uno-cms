// isomorphic: solo presentación. Sin estado, sin efectos y sin acceso a nada del servidor.
import type { SectionState } from '@/cms/core/content';

/**
 * La etiqueta de estado, en un solo sitio.
 *
 * Estaba dentro de `SectionCard` y la usan ya dos pantallas —el panel de contenido y la de una
 * colección—. Copiarla habría sido dos textos que dicen lo mismo hasta el día que uno cambie:
 * el editor vería "Publicado" en una pantalla y "Al día" en otra para el mismo estado, y no
 * habría forma de saber cuál de las dos miente.
 */
const ETIQUETAS: Record<SectionState, { texto: string; clase: string }> = {
  publicado: {
    texto: 'Publicado',
    clase: 'bg-publicado-fondo text-publicado-tinta ring-publicado-linea',
  },
  'con-cambios': {
    texto: 'Cambios sin publicar',
    clase: 'bg-pendiente-fondo text-pendiente-tinta ring-pendiente-linea',
  },
  'sin-publicar': {
    texto: 'Sin publicar todavía',
    clase: 'bg-superficie-suave text-tinta-suave ring-linea-fuerte/20',
  },
};

export function EstadoDeSeccion({ estado }: { estado: SectionState }) {
  const etiqueta = ETIQUETAS[estado];

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${etiqueta.clase}`}
    >
      {etiqueta.texto}
    </span>
  );
}
