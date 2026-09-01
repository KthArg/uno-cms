'use client';

import type { EstadoAutosave } from './useAutosave';
import { Icono, type NombreDeIcono } from './iconos';

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
 *
 * ## El icono, y por qué «Guardado ✓» no lleva
 *
 * Cada estado tiene el suyo salvo dos, y el segundo importa: **`SPEC.md` §8 fija el texto de
 * este indicador literalmente**, "Guardado ✓ / Guardando…". El ✓ es un carácter tipográfico
 * haciendo de icono y en cualquier otro sitio se habría cambiado por uno de verdad — aquí no,
 * porque el vocabulario de la spec está fuera del alcance de #224 (spec 11 §8).
 *
 * Así que ese estado se queda con su signo y **sin** icono al lado: poner los dos sería decir
 * tres veces lo mismo, y el color ya es la tercera.
 */
const ESTADOS: Record<
  EstadoAutosave['tipo'],
  { texto: string; icono?: NombreDeIcono; clase: string }
> = {
  // Vacío a propósito: antes del primer cambio no hay nada que contar, y un "Sin cambios"
  // permanente es ruido que se aprende a ignorar — justo lo que no conviene con este aviso.
  inactivo: { texto: '', clase: 'text-tinta-tenue' },
  pendiente: { texto: 'Sin guardar', icono: 'conCambios', clase: 'text-tinta-tenue' },
  guardando: { texto: 'Guardando…', icono: 'esperando', clase: 'text-tinta-tenue' },
  guardado: { texto: 'Guardado ✓', clase: 'text-publicado-tinta' },
  conflicto: { texto: 'No se está guardando', icono: 'alerta', clase: 'text-alarma' },
  error: { texto: 'No se ha podido guardar', icono: 'alerta', clase: 'text-alarma' },
};

export function EstadoGuardado({ estado }: { estado: EstadoAutosave }) {
  const actual = ESTADOS[estado.tipo];

  return (
    <p aria-live="polite" className={`flex items-center gap-1.5 text-sm ${actual.clase}`}>
      {actual.icono !== undefined && (
        <Icono
          de={actual.icono}
          tamano={16}
          // El único movimiento del panel, y es el que informa: sin él, "Guardando…" y
          // "Sin guardar" se parecen demasiado de reojo. Quien haya pedido menos movimiento no
          // lo recibe — la regla está en `globals.css`, no repetida aquí.
          className={estado.tipo === 'guardando' ? 'animate-spin' : ''}
        />
      )}
      {actual.texto}
      {estado.tipo === 'error' && <span>: {estado.mensaje}</span>}
    </p>
  );
}
