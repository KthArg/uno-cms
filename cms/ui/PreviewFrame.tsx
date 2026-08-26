'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { THROTTLE_MS, type MensajeDeCambio, type MensajeDeToken } from '@/cms/preview/protocolo';
import { estadoDelTokenRemoto } from '@/cms/preview/renovacion';

/**
 * El iframe de la vista previa, en el panel (SPEC §6.1, pasos 1 y 3).
 *
 * ## El origen va explícito, nunca `*` — y desde ADR-701 tampoco fijo
 *
 * `postMessage(msg, '*')` entrega el mensaje a **quien sea** que haya en ese iframe. Hoy hay una
 * ruta nuestra o la web de destino; el día que un redirect, un error o un `src` mal construido
 * lleven a otro sitio, el contenido sin publicar de quien edita se manda a un tercero sin que
 * nada falle. Con el origen explícito, el navegador simplemente no lo entrega.
 *
 * Lo que cambia con la vista previa remota es de **dónde sale** ese origen, no que lo haya: sin
 * `PREVIEW_URL` sigue siendo `window.location.origin`, igual que antes; con ella, el origen de
 * esa URL. En ningún camino aparece un `'*'`, y hay un test estructural sobre el repositorio
 * entero que lo vigila (T-J-2).
 *
 * ## La renovación del token no recarga nada
 *
 * El token remoto vive quince minutos y viaja **por el mismo canal de mensajes**. Recargar el
 * iframe sería lo fácil y es justo lo que el contrato prohíbe: quien edita perdería el `scroll`,
 * el estado de la web de destino y vería un parpadeo cada cuarto de hora.
 *
 * Y si la renovación falla, **se dice**. La vista previa no se queda enseñando lo último que
 * recibió como si estuviera viva, que es la forma silenciosa de mentir (spec 08 §4.2).
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

/** Lo que devuelve pedir un token nuevo. Sin motivo cuando falla: la pantalla dice lo mismo. */
export type RelevoDeToken =
  | { readonly ok: true; readonly token: string; readonly vidaEnSegundos: number }
  | { readonly ok: false };

export interface PreviewFrameProps {
  /** La dirección del iframe, con el token dentro. La compone el servidor. */
  readonly src: string;
  /** La entrada que se está editando. Viaja en cada mensaje. */
  readonly entryKey: string;
  /** Lo que hay escrito ahora mismo en el formulario. */
  readonly valores: unknown;
  /**
   * A qué origen se mandan los mensajes. Sin él, al nuestro — que es el caso de una web que
   * vive en este repositorio, y el comportamiento de siempre.
   */
  readonly origenDestino?: string;
  /**
   * Cómo pedir un token nuevo, y cuánto vive el que ya tenemos.
   *
   * Los dos o ninguno: sin renovación no hay nada que contar, y contar sin poder renovar sería
   * un reloj que solo sirve para anunciar el final. Solo los pone la vista previa remota; la de
   * este repositorio usa un token de dos horas y no se renueva (spec 08 §4.2).
   */
  readonly renovarToken?: () => Promise<RelevoDeToken>;
  readonly vidaDelTokenSegundos?: number;
}

/** Cada cuánto se mira si toca renovar. Ver `MARGEN_DE_RENOVACION_SEGUNDOS`. */
const LATIDO_MS = 15_000;

export function PreviewFrame({
  src,
  entryKey,
  valores,
  origenDestino,
  renovarToken,
  vidaDelTokenSegundos,
}: PreviewFrameProps) {
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const [listo, setListo] = useState(false);
  const [tokenCaido, setTokenCaido] = useState(false);

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

      // Explícito siempre. Sin `origenDestino` es el de esta ventana, que es el del iframe
      // cuando la web vive aquí; con él, el de `PREVIEW_URL`. Lo que no se hace en ningún caso
      // es sacarlo del `src`: componer el origen a partir de la misma cadena que se quiere
      // comprobar es darle a la comprobación el valor que debía verificar.
      ventana.postMessage(mensaje, origenDestino ?? window.location.origin);
      ultimoEnvio.current = Date.now();
    },
    [entryKey, origenDestino]
  );

  useEffect(() => {
    function alRecibir(evento: MessageEvent): void {
      if (evento.origin !== (origenDestino ?? window.location.origin)) return;
      if (typeof evento.data !== 'object' || evento.data === null) return;
      if ((evento.data as { type?: unknown }).type !== 'cms:ready') return;

      setListo(true);
    }

    window.addEventListener('message', alRecibir);
    return () => {
      window.removeEventListener('message', alRecibir);
    };
  }, [origenDestino]);

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

  /**
   * El relevo del token, mientras la pestaña está abierta (spec 08 §4.2).
   *
   * ## Se mide lo transcurrido con un reloj monótono
   *
   * `performance.now()` y no `Date.now()`: el segundo da saltos cuando el sistema corrige la
   * hora, y un salto hacia atrás haría creer que queda más vida de la que hay. La decisión de
   * qué hacer con esos dos números vive en `estadoDelTokenRemoto`, probada aparte.
   *
   * ## El latido es de quince segundos y el margen de tres minutos
   *
   * No sobra margen: en una pestaña en segundo plano el navegador estrangula los temporizadores
   * hasta aproximadamente uno por minuto, así que de los quince segundos nominales quedan unas
   * tres oportunidades reales dentro del margen. Y quien mira una vista previa tiene el panel en
   * otra pestaña **por definición**.
   */
  useEffect(() => {
    if (renovarToken === undefined || vidaDelTokenSegundos === undefined) return;
    if (!listo) return;

    let vigente = true;
    let vida = vidaDelTokenSegundos;
    let emitido = performance.now();
    let pidiendo = false;

    async function relevar(): Promise<void> {
      pidiendo = true;
      try {
        const relevo = await renovarToken!();
        if (!vigente) return;

        if (!relevo.ok) {
          // Se dice. No se reintenta en bucle: si el servidor no puede emitir un token, insistir
          // cada quince segundos no lo arregla y esconde el problema hasta que la vista previa
          // muere sola.
          setTokenCaido(true);
          return;
        }

        const mensaje: MensajeDeToken = {
          type: 'cms:token',
          token: relevo.token,
          vidaEnSegundos: relevo.vidaEnSegundos,
        };
        // Por el canal de siempre y con el origen de siempre: un token es una credencial, y
        // mandarla a `'*'` sería entregársela a quien sea que haya acabado en ese iframe.
        iframe.current?.contentWindow?.postMessage(
          mensaje,
          origenDestino ?? window.location.origin
        );

        vida = relevo.vidaEnSegundos;
        emitido = performance.now();
      } catch {
        // La regla de `cms/ui`: un `await` que puede caerse va dentro de un `try`, o la pantalla
        // se queda bloqueada sin decir nada si se cae la red.
        if (vigente) setTokenCaido(true);
      } finally {
        pidiendo = false;
      }
    }

    const latido = setInterval(() => {
      if (pidiendo) return;

      const estado = estadoDelTokenRemoto(vida, (performance.now() - emitido) / 1000);

      if (estado === 'vale') return;
      // `caducado` también se dice: llegar aquí significa que la renovación no ocurrió a tiempo
      // —una pestaña dormida mucho rato, por ejemplo— y seguir como si nada dejaría la vista
      // previa enseñando contenido viejo con cara de estar al día.
      if (estado === 'caducado') {
        setTokenCaido(true);
        return;
      }

      void relevar();
    }, LATIDO_MS);

    return () => {
      vigente = false;
      clearInterval(latido);
    };
  }, [renovarToken, vidaDelTokenSegundos, listo, origenDestino]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Así se ve tu web con lo que llevas escrito. Todavía no está publicado.
      </p>
      {tokenCaido ? (
        // Se dice **y se ofrece salir de ahí**. Un aviso que solo informa deja a quien lo lee
        // sin saber qué hacer, y lo que hay que hacer es volver a cargar: el permiso lo emite
        // el servidor al pintar esta pantalla.
        <p
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          La vista previa ha dejado de actualizarse. Lo que ves puede no ser lo último que has
          escrito.{' '}
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="font-medium underline underline-offset-2"
          >
            Volver a cargar
          </button>
        </p>
      ) : null}
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
