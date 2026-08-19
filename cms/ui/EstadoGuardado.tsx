'use client';

import type { EstadoAutosave } from './useAutosave';

/**
 * El indicador de guardado de `SPEC.md` §8.
 *
 * ## Por qué va en una región `aria-live`
 *
 * Es información que **aparece sola**: nadie la pide, cambia mientras el editor escribe, y es
 * la única señal de que su trabajo está a salvo. Sin anunciarla, quien usa un lector de
 * pantalla escribe durante media hora sin saber si algo se ha guardado.
 *
 * `polite` y no `assertive`: interrumpir la lectura de lo que se está escribiendo para decir
 * "Guardado" sería peor que no decirlo.
 */
const TEXTOS: Record<EstadoAutosave['tipo'], string> = {
  // Vacío a propósito: antes del primer cambio no hay nada que contar, y un "Sin cambios"
  // permanente es ruido que se aprende a ignorar — justo lo que no conviene con este aviso.
  inactivo: '',
  pendiente: 'Sin guardar',
  guardando: 'Guardando…',
  guardado: 'Guardado ✓',
  conflicto: 'No se está guardando',
  error: 'No se ha podido guardar',
};

export function EstadoGuardado({ estado }: { estado: EstadoAutosave }) {
  const texto = TEXTOS[estado.tipo];

  return (
    <p
      aria-live="polite"
      className={`text-sm ${
        estado.tipo === 'guardado'
          ? 'text-emerald-700'
          : estado.tipo === 'error' || estado.tipo === 'conflicto'
            ? 'text-red-700'
            : 'text-slate-500'
      }`}
    >
      {texto}
      {estado.tipo === 'error' && <span className="ml-1">: {estado.mensaje}</span>}
    </p>
  );
}
