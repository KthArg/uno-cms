'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionFieldError } from '@/cms/actions/pipeline';
import type { ObjectSchema } from '@/cms/core/config';
import type { ImagenDeBiblioteca } from '@/cms/core/media';
import { ConfirmarAccion } from './ConfirmarAccion';
import {
  ANCHO_INICIAL_DEL_FORMULARIO,
  MINIMO_DEL_FORMULARIO,
  PASO_DE_TECLADO,
  anchoDelFormulario,
  guardarAncho,
  leerAnchoGuardado,
} from './divisor';
import { FALLO_DE_RED } from './fallo-de-red';
import { PreviewFrame, type RelevoDeToken } from './PreviewFrame';
import { EntryForm, type ValoresDeEntrada } from './EntryForm';
import { EstadoGuardado } from './EstadoGuardado';
import { MediaPicker, type MediaPickerProps } from './MediaPicker';
import { useAutosave, type ResultadoGuardado } from './useAutosave';
import { Icono } from './iconos';
import {
  ANILLO_DE_FOCO,
  AVISO_ALARMA,
  AVISO_PENDIENTE,
  BOTON_ALARMA,
  BOTON_PRINCIPAL,
  BOTON_SUAVE,
  TITULO,
} from './estilos';

/**
 * La pantalla de edición de una entrada (SPEC §6.1, §8, §9).
 *
 * ## La vista partida de §6.1
 *
 * Formulario a la izquierda, la landing real en un iframe a la derecha, que cambia mientras se
 * escribe. Hasta #115 aquí había un hueco que decía explícitamente que no estaba construido, en
 * vez de un rectángulo con "Vista previa" dentro — eso no habría sido un marcador de posición
 * sino una promesa falsa.
 *
 * Si no llega `urlDeVistaPrevia` el hueco vuelve, y con el mismo criterio: se dice qué falta.
 */

export interface EntryEditorProps {
  readonly nombreSeccion: string;
  readonly schema: ObjectSchema;
  readonly valoresIniciales: ValoresDeEntrada;
  readonly versionInicial: number;
  readonly guardar: (
    valores: Record<string, unknown>,
    version: number
  ) => Promise<ResultadoGuardado>;
  readonly publicar: (version: number) => Promise<ResultadoGuardado>;
  /** Descartar los cambios sin publicar (SPEC §9: "Deshacer cambios"). */
  readonly deshacer: () => Promise<ResultadoGuardado>;
  /** La clave, para enlazar al historial. */
  readonly entryKey: string;
  /** Si hay algo publicado a lo que volver. Sin ello, deshacer no tiene sentido. */
  readonly sePuedeDeshacer: boolean;
  /**
   * La dirección del iframe de vista previa, con su token dentro (SPEC §6.1 paso 1).
   *
   * Opcional: si no se pudo crear el enlace, la pantalla sigue sirviendo para escribir y
   * publicar. La vista previa es lo que distingue a este CMS, no lo que lo sostiene.
   */
  readonly urlDeVistaPrevia?: string;
  /**
   * A qué origen se mandan los mensajes del iframe. Sin él, al nuestro (spec 08 §4.5).
   *
   * Va aparte de `urlDeVistaPrevia` y no se deriva de ella: derivarlo sería sacar el origen de
   * la misma cadena que se quiere comprobar.
   */
  readonly origenDeVistaPrevia?: string;
  /** Cómo pedir un token nuevo y cuánto vive el actual. Solo en la vista previa remota. */
  readonly renovarTokenDeVistaPrevia?: () => Promise<RelevoDeToken>;
  readonly vidaDelTokenSegundos?: number;
  /** La biblioteca, para el selector de imágenes. */
  readonly imagenes?: readonly ImagenDeBiblioteca[];
  readonly tiposAceptados?: readonly string[];
  readonly tamanoMaximoBytes?: number;
  readonly almacenLocal?: boolean;
  /** Anota una imagen recién subida, sin esperar al aviso de Vercel (issue #205). */
  readonly registrarImagen?: MediaPickerProps['registrar'];
  /** Solo para tests: acorta la espera del autosave. */
  readonly esperaMs?: number;
}

export function EntryEditor({
  nombreSeccion,
  schema,
  valoresIniciales,
  versionInicial,
  guardar,
  publicar,
  deshacer,
  entryKey,
  sePuedeDeshacer,
  urlDeVistaPrevia,
  origenDeVistaPrevia,
  renovarTokenDeVistaPrevia,
  vidaDelTokenSegundos,
  imagenes = [],
  tiposAceptados = [],
  tamanoMaximoBytes = 0,
  almacenLocal,
  registrarImagen,
  esperaMs,
}: EntryEditorProps) {
  const [valores, setValores] = useState<ValoresDeEntrada>(valoresIniciales);
  const [campoDeImagen, setCampoDeImagen] = useState<string | null>(null);
  const [confirmandoDeshacer, setConfirmandoDeshacer] = useState(false);
  const [erroresDePublicar, setErroresDePublicar] = useState<readonly ActionFieldError[]>([]);
  const [avisoDePublicar, setAvisoDePublicar] = useState<string | null>(null);

  /**
   * Qué mitad se ve en una pantalla estrecha (spec 10 §5, issue #220).
   *
   * Por encima del ancho de dos columnas **no se usa para nada**: ahí se ven las dos a la vez y
   * este control no se pinta. Así que no es «pestañas en móvil y otra cosa en escritorio»: es
   * una sola maqueta cuyo repartidor cambia de forma.
   */
  const [mitadVisible, setMitadVisible] = useState<'formulario' | 'vista'>('formulario');

  /**
   * El reparto de la pantalla entre el formulario y la vista previa (issue #190).
   *
   * ## Por qué el ancho viaja por una variable de CSS y no por el `style` de cada columna
   *
   * Porque arrastrar dispara decenas de repintados por segundo, y lo que **no puede** pasar es
   * que el iframe se remonte por el camino (T-190-5): remontarlo tira la sesión de vista previa
   * entera y, con una web remota, recarga esa web y vuelve a pedir los borradores.
   *
   * Cambiando una variable en el contenedor, React solo toca un atributo `style` de ese nodo: el
   * árbol de dentro no se vuelve a montar. Pasar el ancho como prop a las columnas haría lo
   * mismo hoy y sería una trampa esperando: basta que alguien añada una condición encima del
   * iframe para que el ancho pase a decidir qué se pinta.
   */
  const reparto = useRef<HTMLDivElement | null>(null);
  const [anchoPedido, setAnchoPedido] = useState(ANCHO_INICIAL_DEL_FORMULARIO);
  const [disponible, setDisponible] = useState(0);

  /**
   * Los dos números también en referencias, y no es duplicarlos por gusto.
   *
   * Un manejador de evento lee el valor que había **cuando se creó**. Con el estado a secas, dos
   * pulsaciones de flecha seguidas —o el teclado repitiendo, que es lo normal al mantenerla—
   * calculan las dos desde el mismo punto de partida y el divisor avanza un solo paso. Lo
   * escribí así y lo enseñó el test que pulsa cuarenta veces: se movía uno.
   *
   * Una referencia se actualiza en el acto, así que cada evento parte de donde dejó el anterior.
   */
  const anchoActual = useRef(ANCHO_INICIAL_DEL_FORMULARIO);
  const disponibleActual = useRef(0);

  const fijarAncho = useCallback((pedido: number) => {
    const ajustado = anchoDelFormulario(pedido, disponibleActual.current);

    anchoActual.current = ajustado;
    setAnchoPedido(ajustado);
    guardarAncho(ajustado);
  }, []);

  // Lo recordado se lee en un efecto y no al pintar: en el servidor no hay `localStorage`, y
  // leerlo durante el render daría un HTML distinto del que el navegador reconstruye.
  useEffect(() => {
    const guardado = leerAnchoGuardado();
    if (guardado === null) return;

    anchoActual.current = guardado;
    setAnchoPedido(guardado);
  }, []);

  useEffect(() => {
    const nodo = reparto.current;
    if (nodo === null || typeof ResizeObserver === 'undefined') return;

    const observador = new ResizeObserver(([entrada]) => {
      if (entrada === undefined) return;

      disponibleActual.current = entrada.contentRect.width;
      setDisponible(entrada.contentRect.width);
    });
    observador.observe(nodo);

    return () => {
      observador.disconnect();
    };
  }, []);

  const anchoPintado = anchoDelFormulario(anchoPedido, disponible);

  const alAgarrar = useCallback(
    (evento: React.PointerEvent<HTMLDivElement>) => {
      const nodo = reparto.current;
      if (nodo === null) return;

      const divisor = evento.currentTarget;
      // `setPointerCapture` es lo que hace que el arrastre siga funcionando cuando el puntero se
      // sale del divisor —que es lo que pasa siempre— y que se acabe solo al soltar aunque sea
      // encima del iframe. Sin esto habría que escuchar en `window` y acordarse de dejar de
      // escuchar; y con un iframe en medio, el ratón se pierde dentro de él y el arrastre se
      // queda pegado.
      divisor.setPointerCapture(evento.pointerId);

      const izquierda = nodo.getBoundingClientRect().left;

      const seguir = (movimiento: PointerEvent): void => {
        fijarAncho(movimiento.clientX - izquierda);
      };

      divisor.addEventListener('pointermove', seguir);
      divisor.addEventListener(
        'pointerup',
        () => {
          divisor.removeEventListener('pointermove', seguir);
        },
        { once: true }
      );
    },
    [fijarAncho]
  );

  const alTeclear = useCallback(
    (evento: React.KeyboardEvent<HTMLDivElement>) => {
      const saltos: Record<string, number> = {
        ArrowLeft: -PASO_DE_TECLADO,
        ArrowRight: PASO_DE_TECLADO,
      };
      const salto = saltos[evento.key];

      if (salto === undefined) return;

      // Solo aquí: sin esto, las flechas moverían además el desplazamiento de la página.
      evento.preventDefault();
      fijarAncho(anchoActual.current + salto);
    },
    [fijarAncho]
  );

  const autosave = useAutosave({
    key: nombreSeccion,
    versionInicial,
    guardar,
    ...(esperaMs === undefined ? {} : { esperaMs }),
  });

  const cambiar = (siguientes: ValoresDeEntrada): void => {
    setValores(siguientes);
    // Los errores de la publicación anterior dejan de tener sentido en cuanto se toca algo:
    // mantenerlos haría que el editor arreglara un campo y siguiera viendo el aviso.
    setErroresDePublicar([]);
    setAvisoDePublicar(null);
    autosave.alCambiar(siguientes);
  };

  const alPublicar = async (): Promise<void> => {
    // Se guarda primero **y se espera**. Publicar lee el borrador de la base de datos, así que
    // sin guardar se publicaría lo de antes del último tecleo.
    //
    // Y hay que esperar de verdad: sin el `await`, se publicaba con la versión que había en el
    // estado de React —la de antes del guardado— y el servidor respondía `VERSION_CONFLICT`.
    // El editor leía "otra persona guardó cambios mientras editabas" siendo él mismo medio
    // segundo antes.
    // Todo el camino en un `try`: publicar son dos llamadas al servidor —el guardado pendiente
    // y la publicación— y cualquiera de las dos puede **lanzar** si la red se cae. Sin esto, el
    // manejador moría ahí y la pantalla se quedaba sin decir nada, con el editor esperando.
    let resultado;
    try {
      const version = await autosave.guardarYa();
      resultado = await publicar(version);
    } catch {
      setAvisoDePublicar(FALLO_DE_RED);
      return;
    }

    if (resultado.ok) {
      setAvisoDePublicar('Publicado. Ya se ve en tu web.');
      setErroresDePublicar([]);
      return;
    }

    setErroresDePublicar(resultado.fields ?? []);
    setAvisoDePublicar(resultado.message ?? 'No se ha podido publicar.');
  };

  const alDeshacer = async (): Promise<void> => {
    setConfirmandoDeshacer(false);

    let resultado;
    try {
      resultado = await deshacer();
    } catch {
      setAvisoDePublicar(FALLO_DE_RED);
      return;
    }

    if (!resultado.ok) {
      setAvisoDePublicar(resultado.message ?? 'No se ha podido deshacer.');
      return;
    }

    // Se recarga en vez de reconstruir el estado a mano: lo que hay que enseñar es exactamente
    // lo que quedó en la base de datos, y con la versión nueva. Reconstruirlo aquí sería una
    // segunda verdad que puede discrepar.
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={TITULO}>{nombreSeccion}</h1>
          <Link
            href={`/admin/history/${entryKey}`}
            className={`mt-1 inline-flex h-11 items-center gap-1.5 text-sm text-tinta-suave transition hover:text-tinta ${ANILLO_DE_FOCO}`}
          >
            <Icono de="historial" tamano={16} />
            Ver versiones anteriores
          </Link>
        </div>
        <EstadoGuardado estado={autosave.estado} />
      </div>

      {autosave.recuperable !== null && (
        <RecuperarBorrador
          onRecuperar={() => {
            setValores(autosave.recuperable?.valores ?? valores);
            autosave.aplicarRecuperable();
          }}
          onDescartar={autosave.descartarRecuperable}
        />
      )}

      {autosave.estado.tipo === 'conflicto' && <AvisoDeConflicto />}

      {confirmandoDeshacer && (
        <ConfirmarAccion
          titulo="¿Deshacer los cambios sin publicar?"
          descripcion="Se descarta todo lo que has escrito desde la última vez que publicaste y vuelve lo que hay en tu web ahora mismo. No se puede recuperar."
          textoConfirmar="Sí, deshacer"
          onConfirmar={() => {
            void alDeshacer();
          }}
          onCancelar={() => {
            setConfirmandoDeshacer(false);
          }}
        />
      )}

      {campoDeImagen !== null && (
        <MediaPicker
          imagenes={imagenes}
          tiposAceptados={tiposAceptados}
          tamanoMaximoBytes={tamanoMaximoBytes}
          almacenLocal={almacenLocal}
          {...(registrarImagen === undefined ? {} : { registrar: registrarImagen })}
          onElegir={(imagen) => {
            // El `alt` que ya tenga la imagen se hereda como punto de partida; el editor puede
            // cambiarlo para esta sección sin tocar la biblioteca, porque una misma foto se
            // describe distinto según dónde aparece.
            cambiar({
              ...valores,
              [campoDeImagen]: {
                mediaId: imagen.id,
                url: imagen.url,
                alt: imagen.alt,
              },
            });
            setCampoDeImagen(null);
          }}
          onCerrar={() => {
            setCampoDeImagen(null);
          }}
        />
      )}

      {/**
       * El repartidor de pantalla estrecha (issue #220).
       *
       * Debajo del ancho de dos columnas la vista previa estaba **escondida y sin forma de
       * llegar a ella**: `hidden lg:block` la quitaba y no la sustituía por nada. O sea que en
       * un móvil el editor perdía la mitad de lo que hace, en silencio.
       *
       * `role="tablist"` de verdad y no dos botones sueltos: es lo que hace que un lector de
       * pantalla anuncie «pestaña 1 de 2» y que las flechas del teclado sirvan.
       */}
      <div role="tablist" aria-label="Qué se ve" className="flex gap-1 lg:hidden">
        {(
          [
            ['formulario', 'Escribir', 'escribir'],
            ['vista', 'Vista previa', 'verPrevia'],
          ] as const
        ).map(([cual, texto, icono]) => (
          <button
            key={cual}
            type="button"
            role="tab"
            aria-selected={mitadVisible === cual}
            onClick={() => {
              setMitadVisible(cual);
            }}
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm transition ${ANILLO_DE_FOCO} ${
              mitadVisible === cual
                ? 'bg-accion font-medium text-sobre-accion'
                : 'border border-linea bg-superficie text-tinta-suave'
            }`}
          >
            <Icono de={icono} tamano={16} />
            {texto}
          </button>
        ))}
      </div>

      <div
        ref={reparto}
        className="grid gap-8 lg:grid-cols-[var(--ancho-formulario)_auto_1fr] lg:gap-0"
        style={{ '--ancho-formulario': `${String(anchoPintado)}px` } as React.CSSProperties}
      >
        {/* `onBlur` en el contenedor y no en cada campo: el evento burbujea, y ponerlo en los
            ocho componentes de campo sería ocho sitios donde olvidarlo. */}
        <form
          // `hidden` y no desmontar: quitar el formulario del árbol al cambiar de pestaña
          // perdería el foco y el estado del editor de texto rico, y el `onBlur` que guarda
          // saltaría en un momento raro. En `lg` vuelve siempre, pase lo que pase aquí.
          className={mitadVisible === 'formulario' ? '' : 'hidden lg:block'}
          onBlur={() => {
            void autosave.guardarYa();
          }}
          onSubmit={(evento) => {
            evento.preventDefault();
          }}
        >
          <EntryForm
            schema={schema}
            values={valores}
            onChange={cambiar}
            errors={erroresDePublicar}
            onElegirImagen={(campo) => {
              setCampoDeImagen(campo);
            }}
          />
        </form>

        {/*
          El divisor. `role="separator"` con `aria-valuenow` es lo que hace que exista para quien
          no usa el ratón: sin eso sería un `div` bonito que solo obedece a un puntero, y la
          pantalla del editor pasaría a repartirse solo con la mano.
        */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Repartir el espacio entre el formulario y la vista previa"
          aria-valuemin={MINIMO_DEL_FORMULARIO}
          aria-valuemax={Math.round(disponible)}
          aria-valuenow={Math.round(anchoPintado)}
          tabIndex={0}
          onPointerDown={alAgarrar}
          onKeyDown={alTeclear}
          className="group hidden cursor-col-resize items-center justify-center px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento lg:flex"
        >
          <span className="h-16 w-1 rounded-full bg-linea-fuerte transition group-hover:bg-acento" />
        </div>

        {urlDeVistaPrevia === undefined ? (
          <div className={mitadVisible === 'vista' ? 'block lg:block' : 'hidden lg:block'}>
            <HuecoDeVistaPrevia />
          </div>
        ) : (
          // Igual que el formulario: se esconde con CSS, **no se desmonta**. Desmontarlo
          // recargaría el iframe en cada ida y vuelta entre pestañas, y con él la sesión de
          // vista previa entera — que es lo que #138 y #180 costaron levantar.
          <div className={mitadVisible === 'vista' ? 'block lg:block' : 'hidden lg:block'}>
            <PreviewFrame
              src={urlDeVistaPrevia}
              entryKey={entryKey}
              valores={valores}
              {...(origenDeVistaPrevia === undefined ? {} : { origenDestino: origenDeVistaPrevia })}
              {...(renovarTokenDeVistaPrevia === undefined
                ? {}
                : { renovarToken: renovarTokenDeVistaPrevia })}
              {...(vidaDelTokenSegundos === undefined ? {} : { vidaDelTokenSegundos })}
            />
          </div>
        )}
      </div>

      {/* **Pegada abajo no**, y esto se probó y se deshizo mirando la pantalla.
          
          La idea era buena —en una sección larga, «Publicar cambios» se va de la vista— pero
          esta barra ocupa el ancho de las dos columnas, así que flotando cruzaba por delante de
          la vista previa y desenfocaba la web de quien edita. Cambiar un desplazamiento por
          tapar la mitad del contenido no es un intercambio que salga a cuenta.
          
          Se queda al final, con cristal: sigue leyéndose como el sitio donde se decide. */}
      <div className="cristal flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <button
          type="button"
          onClick={() => {
            void alPublicar();
          }}
          disabled={autosave.estado.tipo === 'conflicto'}
          className={BOTON_PRINCIPAL}
        >
          <Icono de="publicar" />
          Publicar cambios
        </button>

        {sePuedeDeshacer && (
          <button
            type="button"
            onClick={() => {
              setConfirmandoDeshacer(true);
            }}
            className={BOTON_SUAVE}
          >
            <Icono de="revertir" />
            Deshacer cambios
          </button>
        )}

        {avisoDePublicar !== null && (
          <p
            aria-live="polite"
            className={`flex items-center gap-1.5 text-sm ${
              erroresDePublicar.length > 0 ? 'text-alarma' : 'text-publicado-tinta'
            }`}
          >
            <Icono de={erroresDePublicar.length > 0 ? 'alerta' : 'publicado'} tamano={16} />
            {avisoDePublicar}
          </p>
        )}
      </div>
    </div>
  );
}

function RecuperarBorrador({
  onRecuperar,
  onDescartar,
}: {
  onRecuperar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div className={`${AVISO_PENDIENTE} flex-col`}>
      <p className="flex items-start gap-2.5">
        <Icono de="conCambios" tamano={16} className="mt-0.5" />
        Tienes cambios sin guardar de la última vez, quizá porque se cortó la conexión. ¿Quieres
        recuperarlos?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRecuperar}
          className={`inline-flex h-11 items-center gap-2 rounded-xl bg-pendiente-accion px-4 text-sm font-medium text-sobre-pendiente transition hover:bg-pendiente-accion-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pendiente-tinta`}
        >
          <Icono de="revertir" tamano={16} />
          Recuperar
        </button>
        <button
          type="button"
          onClick={onDescartar}
          className={`inline-flex h-11 items-center gap-2 rounded-xl border border-pendiente-linea px-4 text-sm font-medium text-pendiente-tinta transition hover:bg-superficie-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pendiente-tinta`}
        >
          <Icono de="cerrar" tamano={16} />
          Descartar
        </button>
      </div>
    </div>
  );
}

function AvisoDeConflicto() {
  return (
    <div role="alert" className={`${AVISO_ALARMA} flex-col`}>
      <p className="flex items-start gap-2.5">
        <Icono de="alerta" tamano={16} className="mt-0.5" />
        Otra persona ha guardado cambios en esta sección mientras editabas. Para no pisar su
        trabajo, hemos dejado de guardar. Vuelve a cargar la página para ver lo último.
      </p>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        className={`${BOTON_ALARMA} mt-3`}
      >
        <Icono de="revertir" tamano={16} />
        Volver a cargar
      </button>
    </div>
  );
}

/**
 * Cuando no hay vista previa que enseñar.
 *
 * Pasa si el enlace no se pudo crear —el limitador de `createPreviewToken`, un fallo puntual—.
 * Se dice qué falta en vez de dejar un rectángulo vacío, por el mismo motivo que antes de que
 * la vista previa existiera: un hueco mudo se lee como "esto está roto".
 */
function HuecoDeVistaPrevia() {
  return (
    <div className="rounded-2xl border border-dashed border-linea p-8">
      <p className="flex items-center gap-2 text-sm font-medium text-tinta-suave">
        <Icono de="verPrevia" tamano={16} />
        La vista previa no está disponible ahora
      </p>
      <p className="mt-1 text-sm text-tinta-tenue">
        Puedes seguir escribiendo y publicando con normalidad. Vuelve a cargar la página para
        intentarlo otra vez.
      </p>
    </div>
  );
}
