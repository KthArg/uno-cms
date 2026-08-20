'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ContentContext, type ContenidoPorClave } from './ContentContext';
import { esMasReciente, esMensajeDeCambio, type MensajeDelIframe } from './protocolo';

/**
 * El proveedor de la vista previa (SPEC §6.1, pasos 2–5).
 *
 * Rellena el **mismo contexto** que `StaticContentProvider`, y eso es lo que hace cierta la
 * promesa de §6.3: las secciones no saben en cuál de los dos están.
 *
 * ## Las dos comprobaciones de cada mensaje, y por qué son dos
 *
 * 1. **`event.origin === location.origin`** dice *quién habla*.
 * 2. **La forma del mensaje** dice *si lo que dice tiene sentido*.
 *
 * Ninguna sustituye a la otra: el origen no impide que un fallo de nuestro propio panel mande
 * basura, y la forma no impide que la mande un tercero.
 *
 * Y hay una tercera que no está en la spec y sale de ADR-501: **solo se acepta la clave que
 * autoriza el token**. Si un mensaje pudiera cambiar cualquier sección, el iframe se convertiría
 * en una forma de enseñar contenido que ese enlace no autoriza.
 *
 * ## Lo que se ignora, se ignora en silencio
 *
 * Sin responder, sin avisar y sin registrar nada visible. Contestar a un mensaje de otro origen
 * —aunque fuera para rechazarlo— confirma que hay alguien escuchando en este iframe.
 */

export interface PreviewProviderProps {
  /** Lo que sirve el servidor: el borrador de la clave autorizada y lo publicado del resto. */
  readonly initial: ContenidoPorClave;
  /** La clave que autoriza el token, y dónde aplicarla si es un elemento de colección. */
  readonly objetivo: { key: string; coleccion?: string; indice?: number };
  readonly children: ReactNode;
}

export function PreviewProvider({ initial, objetivo, children }: PreviewProviderProps) {
  const [contenido, setContenido] = useState<ContenidoPorClave>(initial);

  // El último `seq` aplicado vive en una referencia y no en el estado: cambiarlo no tiene que
  // repintar nada, y leerlo dentro del oyente tiene que dar el valor de **ahora**, no el que
  // había cuando se registró.
  const ultimoSeq = useRef(-1);

  useEffect(() => {
    function alRecibir(evento: MessageEvent): void {
      // 1. Quién habla.
      if (evento.origin !== window.location.origin) return;

      // 2. Si lo que dice tiene sentido.
      if (!esMensajeDeCambio(evento.data)) return;

      // 3. Si habla de lo que este iframe puede enseñar (ADR-501).
      if (evento.data.key !== objetivo.key) return;

      // 4. Si no es un mensaje que se cruzó con otro más nuevo.
      if (!esMasReciente(evento.data.seq, ultimoSeq.current)) return;

      ultimoSeq.current = evento.data.seq;
      const { data } = evento.data;

      setContenido((previo) => {
        // Un elemento de colección se sustituye **en su sitio**: la lista tiene que conservar el
        // orden y el resto de elementos como están.
        if (objetivo.coleccion !== undefined && objetivo.indice !== undefined) {
          const lista = previo[objetivo.coleccion];
          if (!Array.isArray(lista)) return previo;

          const siguiente = [...lista];
          siguiente[objetivo.indice] = data;
          return { ...previo, [objetivo.coleccion]: siguiente };
        }

        return { ...previo, [objetivo.key]: data };
      });
    }

    window.addEventListener('message', alRecibir);

    // El panel necesita saber que hay alguien escuchando antes de mandar nada: si manda el
    // primer cambio antes de que el iframe monte, ese cambio se pierde y el editor ve su
    // primera letra desaparecer (SPEC §6.1 paso 5).
    const listo: MensajeDelIframe = { type: 'cms:ready' };
    window.parent.postMessage(listo, window.location.origin);

    // Y se va a la sección que se está editando. En una landing larga, abrir la vista previa
    // por arriba obliga a buscar a mano lo que uno acaba de escribir — y a hacerlo otra vez
    // cada vez que se recarga el iframe.
    //
    // La sección se localiza por `data-cms-key`, que es para lo que §6.1 pide que cada una lo
    // exponga. Para un elemento de colección se busca su lista: el elemento suelto no lleva
    // marca propia.
    const claveVisible = objetivo.coleccion ?? objetivo.key;
    const seccion = document.querySelector(`[data-cms-key="${CSS.escape(claveVisible)}"]`);

    if (seccion !== null) {
      // `instant` y no `smooth`: esto ocurre al cargar, y una animación al abrir se lee como
      // que la página se está moviendo sola.
      seccion.scrollIntoView({ behavior: 'instant', block: 'start' });

      const visible: MensajeDelIframe = { type: 'cms:section-visible', key: claveVisible };
      window.parent.postMessage(visible, window.location.origin);
    }

    return () => {
      window.removeEventListener('message', alRecibir);
    };
    // `objetivo` viene del servidor y no cambia mientras el iframe vive; se listan sus campos
    // en vez del objeto para no volver a registrar el oyente si llega otra referencia igual.
  }, [objetivo.key, objetivo.coleccion, objetivo.indice]);

  return <ContentContext.Provider value={contenido}>{children}</ContentContext.Provider>;
}
