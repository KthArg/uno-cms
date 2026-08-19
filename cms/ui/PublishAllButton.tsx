'use client';

import { useActionState } from 'react';
import type { ActionFieldError } from '@/cms/actions/pipeline';

/**
 * "Publicar todo" (SPEC §9).
 *
 * ## Lo que hace este componente que un botón normal no haría
 *
 * Publicar y decir "listo" es la implementación cómoda y es la que engaña. `publishAll` es
 * todo-o-nada **por sección** (ADR-401): puede publicar seis y dejar dos fuera porque les
 * falta un campo. Si el botón no lo cuenta, el editor se va convencido de que su sitio está
 * al día y hay dos secciones que no lo están.
 *
 * Por eso el resultado se queda en pantalla, dice **qué** se quedó fuera y **qué le falta**,
 * y se anuncia en una región `aria-live` para quien no está mirando el botón.
 */

export interface PublishAllResult {
  readonly publicadas: string[];
  readonly fallidas: { readonly nombre: string; readonly motivo: string }[];
  readonly restantes: number;
  readonly error?: string;
}

export type PublishAllAction = (
  anterior: PublishAllResult | null,
  formData: FormData
) => Promise<PublishAllResult>;

/** Traduce los campos que faltan a una frase, para no enseñar una lista de rutas técnicas. */
export function motivoLegible(codigo: string, campos?: readonly ActionFieldError[]): string {
  if (codigo === 'VALIDATION_FAILED' && campos !== undefined && campos.length > 0) {
    return campos.map((campo) => campo.message).join(' ');
  }
  if (codigo === 'VERSION_CONFLICT') return 'Alguien la modificó mientras publicabas.';
  return 'No se ha podido publicar. Vuelve a intentarlo.';
}

export function PublishAllButton({ action }: { action: PublishAllAction }) {
  const [resultado, formAction, pendiente] = useActionState<PublishAllResult | null, FormData>(
    action,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        {pendiente ? 'Publicando…' : 'Publicar todo'}
      </button>

      {/* `aria-live="polite"`: el resultado aparece sin que nadie lo pida, así que hay que
          anunciarlo. `polite` y no `assertive` porque no interrumpe nada urgente. */}
      <div aria-live="polite" className="text-sm">
        {resultado !== null && <Resumen resultado={resultado} />}
      </div>
    </form>
  );
}

function Resumen({ resultado }: { resultado: PublishAllResult }) {
  if (resultado.error !== undefined) {
    return <p className="text-red-700">{resultado.error}</p>;
  }

  const nadaQuePublicar = resultado.publicadas.length === 0 && resultado.fallidas.length === 0;
  if (nadaQuePublicar) {
    return <p className="text-slate-600">No había cambios sin publicar.</p>;
  }

  return (
    <div className="space-y-2">
      {resultado.publicadas.length > 0 && (
        <p className="text-emerald-800">
          {resultado.publicadas.length === 1
            ? 'Se ha publicado 1 sección.'
            : `Se han publicado ${String(resultado.publicadas.length)} secciones.`}
        </p>
      )}

      {resultado.fallidas.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="font-medium text-amber-900">Estas secciones no se han publicado:</p>
          <ul className="mt-1 space-y-1 text-amber-900">
            {resultado.fallidas.map((fallida) => (
              <li key={fallida.nombre}>
                <strong className="font-medium">{fallida.nombre}</strong>: {fallida.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resultado.restantes > 0 && (
        <p className="text-slate-600">
          Quedan {String(resultado.restantes)} sin publicar. Vuelve a pulsar para continuar.
        </p>
      )}
    </div>
  );
}
