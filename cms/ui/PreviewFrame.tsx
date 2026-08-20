'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { THROTTLE_MS, type MensajeDeCambio } from '@/cms/preview/protocolo';

/**
 * El iframe de la vista previa, en el panel (SPEC §6.1, pasos 1 y 3).
 *
 * ## El origen va explícito, nunca `*`
 *
 * `postMessage(msg, '*')` entrega el mensaje a **quien sea** que haya en ese iframe. Hoy hay una
 * ruta nuestra; el día que un redirect, un error o un `src` mal construido lleven a otro sitio,
 * el contenido sin publicar de quien edita se manda a un tercero sin que nada falle. Con el
 * origen explícito, el navegador simplemente no lo entrega.
 *
 * ## El throttle no es para ahorrar
 *
 * Son 150 ms de §6.1. Sin él se manda un mensaje por tecla y el iframe repinta la landing entera
 * a cada letra; con él, la vista previa va un sexto de segundo por detrás de los dedos, que no
 * se nota. Lo que sí se notaría es lo otro.
 *
 * ## Se espera a `cms:ready`
 *
 * Los cambios anteriores a que el iframe monte se perderían, y quien edita vería su primera
 * letra desaparecer. Mientras no llegue ese aviso no se manda nada; cuando llega, el efecto
 * vuelve a correr con lo que haya escrito en ese momento, que es lo único que hace falta
 * mandar — el camino hasta ahí no le interesa a nadie.
 */

export interface PreviewFrameProps {
  /** La dirección del iframe, con el token dentro. La compone el servidor. */
  readonly src: string;
  /** La entrada que se está editando. Viaja en cada mensaje. */
  readonly entryKey: string;
  /** Lo que hay escrito ahora mismo en el formulario. */
  readonly valores: unknown;
}

export function PreviewFrame({ src, entryKey, valores }: PreviewFrameProps) {
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const [listo, setListo] = useState(false);

  const seq = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef<unknown>(null);
  const ultimoEnvio = useRef(0);

  const enviar = useCallback(
    (data: unknown) => {
      const ventana = iframe.current?.contentWindow;
      if (ventana === null || ventana === undefined) return;

      seq.current += 1;
      const mensaje: MensajeDeCambio = {
        type: 'cms:update',
        key: entryKey,
        data,
        seq: seq.current,
      };

      // El origen de esta ventana, no `*` y no el del `src`: el iframe es de nuestro propio
      // sitio, así que su origen **es** este. Componerlo a partir de `src` sería darle a la
      // comprobación el valor que queremos comprobar.
      ventana.postMessage(mensaje, window.location.origin);
      ultimoEnvio.current = Date.now();
    },
    [entryKey]
  );

  useEffect(() => {
    function alRecibir(evento: MessageEvent): void {
      if (evento.origin !== window.location.origin) return;
      if (typeof evento.data !== 'object' || evento.data === null) return;
      if ((evento.data as { type?: unknown }).type !== 'cms:ready') return;

      setListo(true);
    }

    window.addEventListener('message', alRecibir);
    return () => {
      window.removeEventListener('message', alRecibir);
    };
  }, []);

  useEffect(() => {
    // Todavía no hay nadie escuchando: no se manda nada y no hace falta guardar el valor.
    // Cuando `listo` pase a `true` este mismo efecto vuelve a correr con el `valores` de
    // entonces, que es el más reciente — que es justo lo que hay que mandar.
    //
    // Hubo aquí un segundo efecto que reenviaba al ponerse listo. Sobraba: los dos disparaban a
    // la vez y el iframe recibía el mismo cambio dos veces. Lo enseñó el test que contaba
    // mensajes, no la lectura.
    if (!listo) return;

    const desdeElUltimo = Date.now() - ultimoEnvio.current;

    if (desdeElUltimo >= THROTTLE_MS) {
      enviar(valores);
      return;
    }

    // Dentro de la ventana del throttle: se apunta y se manda al final. Se sustituye el
    // pendiente en vez de acumular, por lo mismo de arriba.
    pendiente.current = valores;

    if (temporizador.current !== null) return;

    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      if (pendiente.current !== null) {
        enviar(pendiente.current);
        pendiente.current = null;
      }
    }, THROTTLE_MS - desdeElUltimo);
  }, [valores, listo, enviar]);

  useEffect(
    () => () => {
      if (temporizador.current !== null) clearTimeout(temporizador.current);
    },
    []
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Así se ve tu web con lo que llevas escrito. Todavía no está publicado.
      </p>
      <iframe
        ref={iframe}
        src={src}
        title="Vista previa de tu web"
        className="h-[36rem] w-full"
        // Sin `sandbox`: el iframe es una ruta de este mismo sitio y necesita ejecutar su
        // JavaScript para repintarse. Lo que lo protege es la CSP `frame-ancestors 'self'` de
        // §6.2, que impide que nadie lo embeba desde fuera.
      />
    </div>
  );
}
