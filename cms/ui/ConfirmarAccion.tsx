'use client';

import { useEffect, useRef } from 'react';

/**
 * La confirmación de una acción destructiva (SPEC §9, issue #105).
 *
 * ## Dice qué se pierde, no "¿estás seguro?"
 *
 * Un cuadro genérico se acepta sin leer a la tercera vez, y entonces ya no confirma nada: solo
 * añade un clic. §9 pide "confirmaciones destructivas con texto explícito", y explícito
 * significa **qué desaparece y qué pasa con la web**, que es lo que quien pulsa no puede ver
 * desde donde está.
 *
 * ## Y no es `window.confirm`
 *
 * El del navegador no admite más que una línea de texto plano, así que no puede decir lo de
 * arriba. Además bloquea el hilo y su aspecto no se puede alinear con el resto del panel.
 */

export interface ConfirmarAccionProps {
  readonly titulo: string;
  readonly descripcion: string;
  readonly textoConfirmar: string;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
}

export function ConfirmarAccion({
  titulo,
  descripcion,
  textoConfirmar,
  onConfirmar,
  onCancelar,
}: ConfirmarAccionProps) {
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // El foco entra en **Cancelar**, no en el botón destructivo. Quien confirma con la tecla
    // Intro sin haber leído acaba de cancelar, que es el error barato de los dos.
    cancelar.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      onKeyDown={(evento) => {
        // `Escape` cierra. Sin ello, quien navega con teclado se queda encerrado en un cuadro
        // que ha abierto sin querer.
        if (evento.key === 'Escape') onCancelar();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-superficie p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-tinta">{titulo}</h2>
        <p className="mt-2 text-sm text-tinta-suave">{descripcion}</p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onConfirmar}
            className="rounded-md bg-alarma-accion px-3 py-1.5 text-sm font-medium text-sobre-alarma hover:bg-alarma-accion-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alarma"
          >
            {textoConfirmar}
          </button>
          <button
            ref={cancelar}
            type="button"
            onClick={onCancelar}
            className="rounded-md border border-linea bg-superficie px-3 py-1.5 text-sm font-medium text-tinta hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
