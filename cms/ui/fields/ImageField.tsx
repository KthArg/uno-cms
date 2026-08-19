'use client';

import type { ImageField as ImageFieldDef, ImageValue } from '@/cms/core/config';
import { claseControl, FieldShell, idsDeCampo } from './FieldShell';

/**
 * El campo de imagen (SPEC §5.1, §8).
 *
 * ## El `alt` no es un extra
 *
 * `SPEC.md` §8 dice que "el editor exige `alt`", y el esquema lo exige desde M1. Aquí se
 * refuerza con el texto de ayuda y con el aviso en vivo: quien sube una imagen tiene el
 * contexto para describirla **en ese momento** y no lo tendrá dos semanas después.
 *
 * Una imagen marcada como `decorative` en `cms.config.ts` no lo pide, y eso también es
 * correcto: obligar a describir un adorno lleva a `alt="imagen"`, que es peor que nada porque
 * un lector de pantalla lo lee en voz alta.
 *
 * ## El botón de elegir imagen aparece solo cuando hay biblioteca
 *
 * `onElegir` llega en #104, con la subida a Blob. Hasta entonces el botón **no se pinta**:
 * ofrecer un botón que no hace nada es la versión pequeña del menú con enlaces rotos.
 */

export interface ImageFieldProps {
  readonly id: string;
  readonly field: ImageFieldDef;
  readonly value: ImageValue | undefined;
  readonly onChange: (valor: ImageValue | undefined) => void;
  readonly error?: string | undefined;
  /** Abre la biblioteca de imágenes. Llega en #104. */
  readonly onElegir?: (() => void) | undefined;
}

export function CampoImagen({ id, field, value, onChange, error, onElegir }: ImageFieldProps) {
  const altObligatorio = !field.decorative;
  const faltaAlt = altObligatorio && value !== undefined && value.alt.trim() === '';

  // El mensaje de verdad, no una cadena centinela. La primera versión pasaba `'falta'` para
  // conseguir el borde rojo, y era el tipo de atajo que alguien "arregla" dentro de tres meses
  // pintándolo en pantalla.
  const mensajeDeAlt = faltaAlt ? 'Describe la imagen antes de publicar.' : undefined;

  return (
    <FieldShell
      id={id}
      label={field.label}
      help={field.help}
      error={error}
      required={field.required}
    >
      <div className="space-y-3">
        {value === undefined ? (
          <p className="text-sm text-slate-500">No hay ninguna imagen elegida.</p>
        ) : (
          <div className="flex items-start gap-3">
            {/* `img` y no `next/image`: aquí la URL viene del contenido y puede ser de
                cualquier tamaño. La optimización de la landing es otra historia y otro
                componente (SPEC §8). El `alt` es el que ha escrito el editor, que es
                precisamente lo que hay que dejarle comprobar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.url}
              alt={value.alt}
              className="h-20 w-20 rounded border border-slate-200 object-cover"
            />

            <button
              type="button"
              onClick={() => {
                onChange(undefined);
              }}
              className="text-sm text-slate-700 underline underline-offset-4 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Quitar imagen
            </button>
          </div>
        )}

        {onElegir !== undefined && (
          <button
            type="button"
            onClick={onElegir}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {value === undefined ? 'Elegir imagen' : 'Cambiar imagen'}
          </button>
        )}

        {value !== undefined && altObligatorio && (
          <div className="space-y-1.5">
            <label htmlFor={`${id}-alt`} className="block text-sm font-medium text-slate-900">
              Descripción de la imagen
            </label>
            <input
              id={`${id}-alt`}
              type="text"
              value={value.alt}
              onChange={(evento) => {
                onChange({ ...value, alt: evento.target.value });
              }}
              className={claseControl(mensajeDeAlt ?? error)}
              {...idsDeCampo(`${id}-alt`, undefined, mensajeDeAlt)}
            />
            <p id={`${id}-alt-ayuda`} className="text-xs text-slate-500">
              Para quien no puede verla. Describe lo que se ve, no la palabra «imagen».
            </p>
            {mensajeDeAlt !== undefined && (
              <p id={`${id}-alt-error`} className="text-sm text-red-700">
                {mensajeDeAlt}
              </p>
            )}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
