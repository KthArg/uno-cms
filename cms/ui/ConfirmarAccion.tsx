'use client';

import { useEffect, useRef } from 'react';
import { Icono } from './iconos';
import { BOTON_ALARMA, BOTON_SUAVE } from './estilos';

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
 *
 * ## El velo también desenfoca (spec 11)
 *
 * Y no es adorno: es lo que separa la decisión que se está tomando de la pantalla que la
 * rodea. Un fondo oscurecido a secas deja el texto de debajo legible y compitiendo; borroso,
 * el cuadro queda solo con lo que hay que leer.
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
      className="velo fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(evento) => {
        // `Escape` cierra. Sin ello, quien navega con teclado se queda encerrado en un cuadro
        // que ha abierto sin querer.
        if (evento.key === 'Escape') onCancelar();
      }}
    >
      <div className="cristal-flotante w-full max-w-md rounded-2xl p-6">
        <h2 className="flex items-start gap-2.5 text-lg font-semibold text-tinta">
          {/* El icono de alarma **sí** significa algo aquí: es lo primero que dice que esto no
              es un aviso más. Por eso lleva nombre accesible en vez de estar oculto. */}
          <Icono de="alerta" etiqueta="Atención" className="mt-0.5 text-alarma" />
          {titulo}
        </h2>
        <p className="mt-3 text-sm text-tinta-suave">{descripcion}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={onConfirmar} className={BOTON_ALARMA}>
            <Icono de="eliminar" tamano={16} />
            {textoConfirmar}
          </button>
          <button ref={cancelar} type="button" onClick={onCancelar} className={BOTON_SUAVE}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
