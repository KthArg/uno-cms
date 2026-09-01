'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ImagenDeBiblioteca } from '@/cms/core/media';
import { MediaPicker, type MediaPickerProps } from './MediaPicker';
import { FALLO_DE_RED } from './fallo-de-red';
import { Icono } from './iconos';
import {
  BOTON_ALARMA,
  BOTON_ICONO,
  BOTON_PRINCIPAL,
  BOTON_SUAVE,
  SUPERFICIE,
  TITULO,
} from './estilos';

/**
 * La pantalla de la biblioteca de imágenes.
 *
 * Reutiliza el mismo selector que se abre desde un campo de imagen, en vez de tener dos
 * rejillas parecidas: la segunda siempre se queda atrás de la primera.
 */

export interface MediaLibraryProps {
  readonly imagenes: readonly ImagenDeBiblioteca[];
  /** Anota una imagen recién subida, sin esperar al aviso de Vercel (issue #205). */
  readonly registrar?: MediaPickerProps['registrar'];
  readonly tiposAceptados: readonly string[];
  readonly tamanoMaximoBytes: number;
  readonly almacenLocal?: boolean;
  /** Borrar es solo para administración: quita un fichero que puede estar en uso. */
  readonly puedeBorrar: boolean;
  readonly onBorrar: (id: string) => Promise<{ ok: boolean; message?: string }>;
}

export function MediaLibrary({
  imagenes,
  registrar,
  tiposAceptados,
  tamanoMaximoBytes,
  almacenLocal,
  puedeBorrar,
  onBorrar,
}: MediaLibraryProps) {
  const router = useRouter();
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
      // Lo local hace que desaparezca al instante; el refresco le dice a Next que los datos
      // del servidor han cambiado, para que no reaparezca al cambiar de pantalla y volver
      // (issue #203). Son las dos cosas, no una en vez de la otra.
      setBorradas((previas) => [...previas, imagen.id]);
      setAviso(`Se ha eliminado «${imagen.filename}».`);
      router.refresh();
      return;
    }

    setAviso(resultado.message ?? 'No se ha podido eliminar la imagen.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={TITULO}>Imágenes</h1>
        <button
          type="button"
          onClick={() => {
            setAbierto(true);
          }}
          className={BOTON_PRINCIPAL}
        >
          <Icono de="subir" />
          Subir una imagen
        </button>
      </div>

      {/* La región vive siempre, aunque esté vacía: un `aria-live` que se monta con el mensaje
          dentro no siempre se anuncia — el navegador tiene que estar observándola de antes. */}
      <p aria-live="polite" className="flex items-center gap-2 text-sm text-tinta-suave">
        {aviso !== null && <Icono de="publicado" tamano={16} />}
        {aviso}
      </p>

      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-linea p-10 text-center">
          <Icono de="imagenes" tamano={28} className="mx-auto text-tinta-tenue" />
          <p className="mt-3 text-tinta-suave">
            Todavía no hay imágenes. Sube la primera y podrás usarla en cualquier sección.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {visibles.map((imagen) => (
            /* **Superficie opaca, no vidrio**, y es la regla de ADR-800: encima de una foto que
               sube cualquiera no hay contraste garantizado para ningún texto. Es la única zona
               del panel donde el fondo no lo ponemos nosotros. */
            <li key={imagen.id} className={`${SUPERFICIE} overflow-hidden`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagen.url}
                alt={imagen.alt === '' ? imagen.filename : imagen.alt}
                className="h-32 w-full bg-papel object-cover"
              />
              <div className="flex items-center gap-1 p-2">
                <p
                  className="min-w-0 flex-1 truncate text-xs text-tinta-suave"
                  title={imagen.filename}
                >
                  {imagen.filename}
                </p>

                {puedeBorrar && (
                  <button
                    type="button"
                    // El nombre dice **cuál** se elimina. "Eliminar" repetido en doce miniaturas
                    // no distingue ninguna para quien navega con lector de pantalla.
                    aria-label={`Eliminar ${imagen.filename}`}
                    onClick={() => {
                      setAConfirmar(imagen);
                    }}
                    className={`${BOTON_ICONO} size-9 text-alarma hover:bg-alarma-fondo hover:text-alarma`}
                  >
                    <Icono de="eliminar" tamano={16} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <MediaPicker
          imagenes={visibles}
          {...(registrar === undefined ? {} : { registrar })}
          tiposAceptados={tiposAceptados}
          tamanoMaximoBytes={tamanoMaximoBytes}
          almacenLocal={almacenLocal}
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
      className="velo fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') onCancelar();
      }}
    >
      <div className="lamina-tarjeta w-full max-w-md rounded-2xl p-6">
        <h2 className="flex items-start gap-2.5 text-lg font-semibold text-tinta">
          <Icono de="alerta" etiqueta="Atención" className="mt-0.5 text-alarma" />
          ¿Eliminar «{imagen.filename}»?
        </h2>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagen.url}
          alt={imagen.filename}
          className="mt-4 h-32 w-full rounded-xl border border-linea bg-papel object-contain"
        />

        <p className="mt-3 text-sm text-tinta-suave">
          Se borra del almacén y no se puede recuperar. Si alguna sección la está usando, ahí dejará
          de verse.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onConfirmar} className={BOTON_ALARMA}>
            <Icono de="eliminar" tamano={16} />
            Sí, eliminar
          </button>
          <button type="button" onClick={onCancelar} className={BOTON_SUAVE}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
