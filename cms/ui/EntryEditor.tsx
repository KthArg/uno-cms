'use client';

import { useState } from 'react';
import type { ActionFieldError } from '@/cms/actions/pipeline';
import type { ObjectSchema } from '@/cms/core/config';
import type { ImagenDeBiblioteca } from '@/cms/core/media';
import { EntryForm, type ValoresDeEntrada } from './EntryForm';
import { EstadoGuardado } from './EstadoGuardado';
import { MediaPicker } from './MediaPicker';
import { useAutosave, type ResultadoGuardado } from './useAutosave';

/**
 * La pantalla de edición de una entrada (SPEC §6.1, §8, §9).
 *
 * ## El hueco de la vista previa está vacío a propósito
 *
 * §6.1 describe una vista partida: formulario a la izquierda, la landing real en un iframe a
 * la derecha. Ese iframe es M5 entero —token, `postMessage`, proveedor reactivo— y **aquí solo
 * está el hueco, dicho como tal**.
 *
 * La alternativa habría sido pintar un rectángulo con "Vista previa" dentro. Eso no es un
 * marcador de posición: es una promesa falsa, y quien abra el panel creerá que la vista previa
 * está rota en vez de sin construir.
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
  /** La biblioteca, para el selector de imágenes. */
  readonly imagenes?: readonly ImagenDeBiblioteca[];
  readonly tiposAceptados?: readonly string[];
  readonly tamanoMaximoBytes?: number;
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
  imagenes = [],
  tiposAceptados = [],
  tamanoMaximoBytes = 0,
  esperaMs,
}: EntryEditorProps) {
  const [valores, setValores] = useState<ValoresDeEntrada>(valoresIniciales);
  const [campoDeImagen, setCampoDeImagen] = useState<string | null>(null);
  const [erroresDePublicar, setErroresDePublicar] = useState<readonly ActionFieldError[]>([]);
  const [avisoDePublicar, setAvisoDePublicar] = useState<string | null>(null);

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
    const version = await autosave.guardarYa();

    const resultado = await publicar(version);

    if (resultado.ok) {
      setAvisoDePublicar('Publicado. Ya se ve en tu web.');
      setErroresDePublicar([]);
      return;
    }

    setErroresDePublicar(resultado.fields ?? []);
    setAvisoDePublicar(resultado.message ?? 'No se ha podido publicar.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{nombreSeccion}</h1>
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

      {campoDeImagen !== null && (
        <MediaPicker
          imagenes={imagenes}
          tiposAceptados={tiposAceptados}
          tamanoMaximoBytes={tamanoMaximoBytes}
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

      <div className="grid gap-8 lg:grid-cols-2">
        {/* `onBlur` en el contenedor y no en cada campo: el evento burbujea, y ponerlo en los
            ocho componentes de campo sería ocho sitios donde olvidarlo. */}
        <form
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

        <HuecoDeVistaPrevia />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => {
            void alPublicar();
          }}
          disabled={autosave.estado.tipo === 'conflicto'}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Publicar cambios
        </button>

        {avisoDePublicar !== null && (
          <p
            aria-live="polite"
            className={
              erroresDePublicar.length > 0 ? 'text-sm text-red-700' : 'text-sm text-emerald-800'
            }
          >
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
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm text-amber-900">
        Tienes cambios sin guardar de la última vez, quizá porque se cortó la conexión. ¿Quieres
        recuperarlos?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onRecuperar}
          className="rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900"
        >
          Recuperar
        </button>
        <button
          type="button"
          onClick={onDescartar}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

function AvisoDeConflicto() {
  return (
    <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4">
      <p className="text-sm text-red-900">
        Otra persona ha guardado cambios en esta sección mientras editabas. Para no pisar su
        trabajo, hemos dejado de guardar. Vuelve a cargar la página para ver lo último.
      </p>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        className="mt-3 rounded-md bg-red-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900"
      >
        Volver a cargar
      </button>
    </div>
  );
}

function HuecoDeVistaPrevia() {
  return (
    <div className="hidden rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 lg:block">
      <p className="text-sm font-medium text-slate-700">Aquí irá la vista previa</p>
      <p className="mt-1 text-sm text-slate-500">
        Todavía no está construida. Cuando lo esté, verás tu web cambiar mientras escribes.
      </p>
    </div>
  );
}
