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
    clase: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  },
  'con-cambios': {
    texto: 'Cambios sin publicar',
    clase: 'bg-amber-50 text-amber-800 ring-amber-600/30',
  },
  'sin-publicar': {
    texto: 'Sin publicar todavía',
    clase: 'bg-slate-100 text-slate-700 ring-slate-500/20',
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
