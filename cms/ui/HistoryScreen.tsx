'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RevisionDelHistorial } from '@/cms/core/history';
import { ConfirmarAccion } from './ConfirmarAccion';
import { FALLO_DE_RED } from './fallo-de-red';

/**
 * El historial de una entrada, con "volver a una versión anterior" (SPEC §9).
 *
 * ## Restaurar lleva a borrador, y la pantalla lo dice
 *
 * La action ya lo garantiza (#79): restaurar escribe en el borrador y **no publica**. Pero que
 * el sistema haga lo correcto no basta si la pantalla no lo explica: el historial es un sitio
 * donde se curiosea, y quien pulsa "volver" necesita saber **antes** que su web no va a cambiar
 * de golpe.
 *
 * Por eso el texto del botón es "Volver a esta versión" —el vocabulario de §9— y la
 * confirmación dice exactamente qué pasa: se sustituye lo que hay sin publicar, y la web sigue
 * igual hasta que se publique.
 */

export interface HistoryScreenProps {
  readonly nombreSeccion: string;
  readonly entryKey: string;
  readonly revisiones: readonly RevisionDelHistorial[];
  readonly onRestaurar: (revisionId: string) => Promise<{ ok: boolean; message?: string }>;
  /** Si el borrador tiene cambios que se perderían al restaurar. */
  readonly hayCambiosSinPublicar: boolean;
}

export function HistoryScreen({
  nombreSeccion,
  entryKey,
  revisiones,
  onRestaurar,
  hayCambiosSinPublicar,
}: HistoryScreenProps) {
  const router = useRouter();
  const [aRestaurar, setARestaurar] = useState<RevisionDelHistorial | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const restaurar = async (revision: RevisionDelHistorial): Promise<void> => {
    setARestaurar(null);

    let resultado;
    try {
      resultado = await onRestaurar(revision.id);
    } catch {
      setAviso(FALLO_DE_RED);
      return;
    }

    if (!resultado.ok) {
      setAviso(resultado.message ?? 'No se ha podido volver a esa versión.');
      return;
    }

    // Se lleva al editor. Restaurar deja el texto en el borrador, así que lo siguiente que
    // quiere hacer quien acaba de pulsar es mirarlo — y publicarlo si le convence.
    router.push(`/admin/content/${entryKey}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/content/${entryKey}`}
          className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          ← Volver a {nombreSeccion}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Versiones anteriores de {nombreSeccion}
        </h1>
        <p className="mt-1 text-slate-600">
          Cada vez que publicas, se guarda la versión que había antes. Puedes recuperar cualquiera
          de estas.
        </p>
      </div>

      <p aria-live="polite" className="text-sm text-red-700">
        {aviso}
      </p>

      {revisiones.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8">
          <p className="text-slate-700">Todavía no hay versiones anteriores.</p>
          <p className="mt-1 text-sm text-slate-500">
            Aparecerán aquí a partir de la segunda vez que publiques esta sección: la primera no
            sustituye nada.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {revisiones.map((revision) => (
            <li
              key={revision.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{revision.resumen}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  <FechaLegible fecha={revision.publishedAt} />
                  {revision.autor !== null && ` · ${revision.autor}`}
                </p>
              </div>

              <button
                type="button"
                aria-label={`Volver a la versión de ${formatearFecha(revision.publishedAt)}`}
                onClick={() => {
                  setARestaurar(revision);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Volver a esta versión
              </button>
            </li>
          ))}
        </ol>
      )}

      {aRestaurar !== null && (
        <ConfirmarAccion
          titulo="¿Volver a esta versión?"
          descripcion={
            hayCambiosSinPublicar
              ? 'Se sustituirá lo que tienes escrito sin publicar, que se perderá. Tu web no cambia: la versión recuperada queda como borrador hasta que la publiques.'
              : 'Quedará como borrador. Tu web no cambia hasta que lo publiques.'
          }
          textoConfirmar="Sí, volver a esta versión"
          onConfirmar={() => {
            void restaurar(aRestaurar);
          }}
          onCancelar={() => {
            setARestaurar(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * La fecha, en el idioma del panel y sin la hora al segundo.
 *
 * `suppressHydrationWarning` porque el servidor y el navegador pueden estar en zonas horarias
 * distintas: sin él, React avisa de una discrepancia que aquí es esperada y no un fallo.
 */
function FechaLegible({ fecha }: { fecha: Date }) {
  return (
    <time dateTime={fecha.toISOString()} suppressHydrationWarning>
      {formatearFecha(fecha)}
    </time>
  );
}

function formatearFecha(fecha: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(fecha);
}
