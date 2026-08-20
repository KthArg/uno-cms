'use client';

import { useState } from 'react';
import type { ImagenDeBiblioteca } from '@/cms/core/media';
import { MediaPicker } from './MediaPicker';
import { FALLO_DE_RED } from './fallo-de-red';

/**
 * La pantalla de la biblioteca de imágenes.
 *
 * Reutiliza el mismo selector que se abre desde un campo de imagen, en vez de tener dos
 * rejillas parecidas: la segunda siempre se queda atrás de la primera.
 */

export interface MediaLibraryProps {
  readonly imagenes: readonly ImagenDeBiblioteca[];
  readonly tiposAceptados: readonly string[];
  readonly tamanoMaximoBytes: number;
  /** Borrar es solo para administración: quita un fichero que puede estar en uso. */
  readonly puedeBorrar: boolean;
  readonly onBorrar: (id: string) => Promise<{ ok: boolean; message?: string }>;
}

export function MediaLibrary({
  imagenes,
  tiposAceptados,
  tamanoMaximoBytes,
  puedeBorrar,
  onBorrar,
}: MediaLibraryProps) {
  const [abierto, setAbierto] = useState(false);
  const [aConfirmar, setAConfirmar] = useState<ImagenDeBiblioteca | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [borradas, setBorradas] = useState<string[]>([]);

  const visibles = imagenes.filter((imagen) => !borradas.includes(imagen.id));

  const confirmarBorrado = async (imagen: ImagenDeBiblioteca): Promise<void> => {
    setAConfirmar(null);

    let resultado;
    try {
      resultado = await onBorrar(imagen.id);
    } catch {
      setAviso(FALLO_DE_RED);
      return;
    }

    if (resultado.ok) {
      setBorradas((previas) => [...previas, imagen.id]);
      setAviso(`Se ha eliminado «${imagen.filename}».`);
      return;
    }

    setAviso(resultado.message ?? 'No se ha podido eliminar la imagen.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Imágenes</h1>
        <button
          type="button"
          onClick={() => {
            setAbierto(true);
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Subir una imagen
        </button>
      </div>

      <p aria-live="polite" className="text-sm text-slate-600">
        {aviso}
      </p>

      {visibles.length === 0 ? (
        <p className="text-slate-600">
          Todavía no hay imágenes. Sube la primera y podrás usarla en cualquier sección.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {visibles.map((imagen) => (
            <li key={imagen.id} className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagen.url}
                alt={imagen.alt === '' ? imagen.filename : imagen.alt}
                className="h-32 w-full rounded border border-slate-200 bg-slate-50 object-cover"
              />
              <p className="truncate text-xs text-slate-600" title={imagen.filename}>
                {imagen.filename}
              </p>

              {puedeBorrar && (
                <button
                  type="button"
                  onClick={() => {
                    setAConfirmar(imagen);
                  }}
                  className="text-xs text-red-700 underline underline-offset-4 hover:text-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <MediaPicker
          imagenes={visibles}
          tiposAceptados={tiposAceptados}
          tamanoMaximoBytes={tamanoMaximoBytes}
          onElegir={() => {
            setAbierto(false);
          }}
          onCerrar={() => {
            setAbierto(false);
          }}
        />
      )}

      {aConfirmar !== null && (
        <ConfirmarBorrado
          imagen={aConfirmar}
          onConfirmar={() => {
            void confirmarBorrado(aConfirmar);
          }}
          onCancelar={() => {
            setAConfirmar(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * La confirmación dice **qué** se pierde, no "¿estás seguro?".
 *
 * Un cuadro genérico se acepta sin leer a la tercera vez. Este enseña la imagen y su nombre, y
 * avisa de lo que el editor no puede ver desde aquí: que puede estar usada en alguna sección.
 */
function ConfirmarBorrado({
  imagen,
  onConfirmar,
  onCancelar,
}: {
  imagen: ImagenDeBiblioteca;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Eliminar ${imagen.filename}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') onCancelar();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">¿Eliminar «{imagen.filename}»?</h2>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagen.url}
          alt={imagen.filename}
          className="mt-3 h-32 w-full rounded border border-slate-200 object-contain"
        />

        <p className="mt-3 text-sm text-slate-700">
          Se borra del almacén y no se puede recuperar. Si alguna sección la está usando, ahí dejará
          de verse.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConfirmar}
            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Sí, eliminar
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
