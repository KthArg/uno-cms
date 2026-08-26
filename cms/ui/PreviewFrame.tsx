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

/**
 * Los tamaños de pantalla que se pueden mirar (SPEC §6.1, issue #138).
 *
 * **Son anchos de ventana de verdad, no anchos de la caja del panel**, y esa distinción es la
 * pieza entera. La primera versión de esto solo estrechaba el iframe hasta 375 px y dejaba
 * "Escritorio" ocupando la columna del panel, que mide unos 400 px **y no crece con la
 * pantalla**. El resultado, comprobado con una web de verdad dentro: con "Escritorio" elegido,
 * esa web decía *«me creo de 398px, maqueta MÓVIL»*.
 *
 * O sea que el control enseñaba la maqueta de móvil en sus dos posiciones y solo cambiaba el
 * ancho del recuadro. Ningún test unitario lo habría visto: todos pasaban.
 *
 * Lo que hace que funcione es renderizar el iframe **al ancho que dice la etiqueta** y encogerlo
 * con `transform` para que quepa. La web de dentro cree tener 1280 px y aplica sus reglas de
 * escritorio; lo que se ve pequeño es la escala, que es justo lo que hace cualquier herramienta
 * de vista previa por dispositivo.
 *
 * Los números: 1280 es el escritorio de referencia de casi cualquier maqueta, y 390 los píxeles
 * CSS de un móvil corriente de hoy.
 */
export const PANTALLAS = {
  escritorio: { ancho: 1280, alto: 800 },
  movil: { ancho: 390, alto: 844 },
} as const;

export type TamanoDePantalla = keyof typeof PANTALLAS;

/**
 * **El alto también es del tamaño elegido, y no un hueco que se estira.**
 *
 * La primera versión de esto ponía al iframe el alto del recuadro dividido por la escala, o sea
 * unos 1780 píxeles virtuales en escritorio. Suena inofensivo —"se ve más página"— y no lo es:
 * una portada con `height: 100vh`, que es de lo más común que hay, ocuparía 1780 píxeles en vez
 * de 800. La vista previa volvería a enseñar algo que no le pasa a nadie, que es el mismo fallo
 * que esta pieza acaba de arreglar por el lado del ancho.
 *
 * Con un alto fijo por tamaño, `100vh` mide lo que mediría en esa pantalla. Lo que se pierde es
 * que en escritorio queda hueco debajo del recuadro; a cambio, lo que se ve es cierto.
 *
 * 800 es el alto útil de un portátil corriente con su barra de direcciones puesta; 844 es el de
 * un móvil de hoy.
 */

/**
 * Lo más bajo que se deja el recuadro, en píxeles.
 *
 * El alto ya no es una constante: se mide lo que queda de ventana por debajo del recuadro. Con
 * un alto fijo de 576, la escala de escritorio se quedaba clavada en 0,69 por mucho que se le
 * diera ancho con el divisor de #190 — el techo había pasado del ancho al alto sin que se
 * notara. Esto es solo un suelo para que no desaparezca en una ventana muy baja.
 */
const ALTO_MINIMO_DEL_RECUADRO = 320;

/** El margen alrededor del recuadro. En una constante porque el alto del iframe la resta. */
const MARGEN = 12;

/**
 * Cuánto hay que encoger para que una pantalla entera quepa en el hueco que hay.
 *
 * **Manda la dimensión más apretada de las dos**, y eso es lo que hace que se vea la pantalla
 * completa. Encogiendo solo por el ancho, un móvil de 844 px de alto no cabía en el recuadro:
 * salían dos barras de desplazamiento —una del móvil y otra del recuadro— y, sobre todo, **no
 * se veía dónde corta la pantalla**, que es la pregunta que se hace quien mira una vista previa
 * en móvil.
 *
 * Nunca agranda: `1` es el tope. Estirar una web de 390 px hasta 900 no enseña nada que no se
 * viera antes y engaña sobre el tamaño de las letras.
 *
 * Una medida de cero o sin tomar devuelve `1`, que es "no toques nada". Pasa en el primer
 * pintado, antes de que nadie haya medido, y también en los tests de componentes —jsdom no
 * maqueta, así que todas las cajas miden cero—. Devolver `0` ahí dejaría el iframe invisible.
 */
export function escalaDeVistaPrevia(
  hueco: { readonly ancho: number; readonly alto: number },
  pantalla: { readonly ancho: number; readonly alto: number }
): number {
  const cabe = (disponible: number, deseado: number): number => {
    if (!Number.isFinite(disponible) || disponible <= 0) return 1;
    if (!Number.isFinite(deseado) || deseado <= 0) return 1;

    return disponible / deseado;
  };

  return Math.min(1, cabe(hueco.ancho, pantalla.ancho), cabe(hueco.alto, pantalla.alto));
}

/** El orden en que se ofrecen, y el nombre que lee quien edita. */
const TAMANOS: readonly { readonly valor: TamanoDePantalla; readonly nombre: string }[] = [
  { valor: 'escritorio', nombre: 'Escritorio' },
  { valor: 'movil', nombre: 'Móvil' },
];

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
  /**
   * El tamaño que se está mirando.
   *
   * Vive aquí y en ningún sitio más: **no se guarda en el servidor** (issue #138). Es una
   * preferencia de quien mira, no del sitio — dos personas editando la misma sección pueden
   * querer mirarla en pantallas distintas, y guardarla haría que una le cambiara la vista a la
   * otra sin tocar nada.
   */
  const [tamano, setTamano] = useState<TamanoDePantalla>('escritorio');
  /** El hueco donde cabe la vista previa. Lo mide el navegador, no se supone. */
  const [anchoDisponible, setAnchoDisponible] = useState(0);
  const [altoDisponible, setAltoDisponible] = useState(ALTO_MINIMO_DEL_RECUADRO);
  const hueco = useRef<HTMLDivElement | null>(null);

  /**
   * El token vigente y desde cuándo, **fuera del efecto que los usa**.
   *
   * En `useRef` y no en variables del efecto, y es lo que arregla un fallo que solo aparece
   * cuando algo hace que el efecto se vuelva a montar: si la referencia de `renovarToken`
   * cambiara de identidad —basta con que alguien la envuelva en una función al vuelo en la
   * pantalla de arriba—, el efecto se rearmaría y `emitido` volvería a valer «ahora». El token
   * envejecería sin que nadie lo mirara y la vista previa **moriría en silencio**, que es el
   * fallo exacto que toda esta pieza existe para evitar.
   *
   * En una referencia, lo transcurrido sobrevive a que el efecto se rearme. Hay un caso que
   * rearma el efecto a propósito y comprueba que el relevo sigue llegando a su hora.
   */
  const vidaDelToken = useRef<number | null>(null);
  const emitidoEn = useRef<number | null>(null);
  const pidiendoRelevo = useRef(false);

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

    // Solo la primera vez. Si el efecto se rearma con el mismo token, lo transcurrido sigue
    // contando desde que se emitió y no desde ahora.
    if (vidaDelToken.current === null || vidaDelToken.current !== vidaDelTokenSegundos) {
      vidaDelToken.current = vidaDelTokenSegundos;
      emitidoEn.current = performance.now();
    }

    async function relevar(): Promise<void> {
      pidiendoRelevo.current = true;
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

        vidaDelToken.current = relevo.vidaEnSegundos;
        emitidoEn.current = performance.now();
      } catch {
        // La regla de `cms/ui`: un `await` que puede caerse va dentro de un `try`, o la pantalla
        // se queda bloqueada sin decir nada si se cae la red.
        if (vigente) setTokenCaido(true);
      } finally {
        pidiendoRelevo.current = false;
      }
    }

    const latido = setInterval(() => {
      if (pidiendoRelevo.current) return;

      const estado = estadoDelTokenRemoto(
        vidaDelToken.current ?? Number.NaN,
        (performance.now() - (emitidoEn.current ?? 0)) / 1000
      );

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

  /**
   * Mide el hueco y vuelve a medirlo cuando cambie.
   *
   * Con `ResizeObserver` y no con el evento `resize` de la ventana: el hueco cambia también sin
   * que la ventana cambie —al plegar un panel, al aparecer una barra de desplazamiento— y con
   * `resize` esos casos dejarían la escala equivocada hasta que alguien tocara el borde.
   *
   * `ResizeObserver` no existe en jsdom, así que se comprueba antes: sin él la escala se queda
   * en 1 y los tests de componentes miden lo que pueden medir, que es qué ancho se pide.
   */
  useEffect(() => {
    const nodo = hueco.current;
    if (nodo === null || typeof ResizeObserver === 'undefined') return;

    const observador = new ResizeObserver(([entrada]) => {
      if (entrada !== undefined) setAnchoDisponible(entrada.contentRect.width);
    });
    observador.observe(nodo);

    return () => {
      observador.disconnect();
    };
  }, []);

  /**
   * Y cuánto queda de ventana por debajo del recuadro.
   *
   * No lo puede decir un `ResizeObserver` sobre el propio recuadro, porque su alto es justo lo
   * que se está calculando: se estaría midiendo el resultado para decidir el resultado. Se mide
   * dónde empieza y cuánto queda de ventana hasta abajo.
   *
   * Con `resize` de la ventana y no `ResizeObserver`: lo que cambia aquí es el alto de la
   * ventana, y el sitio que ocupa lo de arriba solo cambia al recargar la pantalla.
   */
  useEffect(() => {
    function medir(): void {
      const nodo = hueco.current;
      if (nodo === null) return;

      const desdeArriba = nodo.getBoundingClientRect().top;
      setAltoDisponible(
        Math.max(
          ALTO_MINIMO_DEL_RECUADRO,
          Math.round(window.innerHeight - desdeArriba - MARGEN * 2)
        )
      );
    }

    medir();
    window.addEventListener('resize', medir);

    return () => {
      window.removeEventListener('resize', medir);
    };
  }, []);

  const pantalla = PANTALLAS[tamano];
  const escala = escalaDeVistaPrevia(
    { ancho: anchoDisponible, alto: altoDisponible - MARGEN * 2 },
    pantalla
  );

  /**
   * El recuadro se ajusta a lo que ocupa, con un tope.
   *
   * Un escritorio encogido a un tercio ocupa unos 250 px de alto: con el recuadro clavado a 576
   * quedaba un palmo de gris debajo que parecía que faltaba algo por cargar.
   */
  const altoDelRecuadro = Math.min(altoDisponible, Math.round(pantalla.alto * escala) + MARGEN * 2);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-sm text-slate-600">
          Así se ve tu web con lo que llevas escrito. Todavía no está publicado.
        </p>
        <div role="group" aria-label="Tamaño de pantalla" className="flex gap-1">
          {TAMANOS.map(({ valor, nombre }) => (
            <button
              key={valor}
              type="button"
              // `aria-pressed` y no un `role="radio"` a mano: son dos botones que dejan pulsado
              // el elegido, que es lo que se ve, y el lector de pantalla dice cuál está activo
              // sin que haya que construir la navegación por flechas de un grupo de radios.
              aria-pressed={tamano === valor}
              onClick={() => {
                setTamano(valor);
              }}
              className={
                tamano === valor
                  ? 'rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white'
                  : 'rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200'
              }
            >
              {nombre}
            </button>
          ))}
        </div>
      </div>
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
      {/*
        El iframe se pinta al ancho que dice la etiqueta y se encoge con `transform` para caber.
        Así la web de dentro cree tener ese ancho y aplica sus propias reglas de maqueta, que es
        lo único que hace que "Escritorio" signifique algo.

        **Y sigue siendo el mismo nodo al cambiar de tamaño** (T-138-1): la estructura no cambia,
        solo cambian dos estilos. Un `key` por tamaño, o pintar dos ramas distintas, lo
        remontaría — y remontar tira la sesión de vista previa entera: con una web remota,
        recarga esa web y vuelve a pedir los borradores. Una comodidad no puede costar eso.
      */}
      <div
        ref={hueco}
        // `overflow-auto` y no `hidden` por si el hueco se queda muy estrecho: recortar
        // escondería media pantalla sin decirlo. En la práctica no sale barra, porque la escala
        // mira también el alto y el marco de dentro mide ya lo que ocupa.
        className="overflow-auto bg-slate-100"
        style={{ height: `${String(altoDelRecuadro)}px`, padding: `${String(MARGEN)}px` }}
      >
        {/*
          El marco mide **lo que ocupa el iframe ya encogido**, y esto no es un detalle de
          maquetación: `transform` encoge lo que se ve pero **no cambia el sitio que el navegador
          le reserva**, así que sin este marco el recuadro creía tener 1280 px de ancho dentro y
          sacaba una barra de desplazamiento horizontal para una web que ya cabía entera.

          Y sigue siendo el mismo nodo de iframe al cambiar de tamaño (T-138-1): la estructura no
          cambia, solo los números.
        */}
        <div
          className="mx-auto overflow-hidden bg-white shadow-sm"
          style={{
            width: `${String(Math.round(pantalla.ancho * escala))}px`,
            height: `${String(Math.round(pantalla.alto * escala))}px`,
          }}
        >
          <iframe
            ref={iframe}
            src={src}
            title="Vista previa de tu web"
            className="border-0 bg-white"
            style={{
              // Los dos del tamaño elegido: es una ventana de ese tamaño, no un hueco estirado.
              width: `${String(pantalla.ancho)}px`,
              height: `${String(pantalla.alto)}px`,
              transform: `scale(${String(escala)})`,
              transformOrigin: 'top left',
            }}
            // Sin `sandbox`: el iframe es una ruta de este mismo sitio o la web configurada, y
            // necesita ejecutar su JavaScript para repintarse. Lo que protege a la nuestra es la
            // CSP `frame-ancestors 'self'` de §6.2, que impide que nadie la embeba desde fuera.
          />
        </div>
      </div>
    </div>
  );
}
