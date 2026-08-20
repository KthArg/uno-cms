'use client';

import { upload } from '@vercel/blob/client';
import { useState } from 'react';
import type { ImagenDeBiblioteca } from '@/cms/core/media';
import { FALLO_DE_RED } from './fallo-de-red';

/**
 * El selector de imágenes: subir una nueva o elegir de las que ya hay.
 *
 * ## El `accept` del input no protege nada, y por eso hay dos comprobaciones
 *
 * Lo que se pone aquí —tipos aceptados, tamaño máximo— es **comodidad para quien sube**: le
 * evita elegir un fichero que va a ser rechazado y le da el aviso al instante. Viaja en el
 * cliente, así que se cambia con la consola abierta.
 *
 * La que decide es la del servidor, al emitir el token (`cms/security/uploads.ts`). Esta no la
 * sustituye ni la duplica: la adelanta, para que el editor no espere a subir diez megas para
 * enterarse de que no valían.
 */

export interface MediaPickerProps {
  readonly imagenes: readonly ImagenDeBiblioteca[];
  readonly onElegir: (imagen: ImagenDeBiblioteca) => void;
  readonly onCerrar: () => void;
  /** Los tipos que el servidor acepta, para adelantar el aviso. */
  readonly tiposAceptados: readonly string[];
  readonly tamanoMaximoBytes: number;
}

export function MediaPicker({
  imagenes,
  onElegir,
  onCerrar,
  tiposAceptados,
  tamanoMaximoBytes,
}: MediaPickerProps) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recienSubidas, setRecienSubidas] = useState<ImagenDeBiblioteca[]>([]);

  const subir = async (fichero: File): Promise<void> => {
    setError(null);

    // El aviso adelantado. Lo mismo lo comprueba el servidor.
    if (!tiposAceptados.includes(fichero.type)) {
      setError('Ese tipo de archivo no se puede subir. Usa una imagen JPG, PNG, WEBP, AVIF o GIF.');
      return;
    }
    if (fichero.size > tamanoMaximoBytes) {
      setError('La imagen pesa demasiado. El máximo son 10 MB.');
      return;
    }

    setSubiendo(true);
    try {
      const blob = await upload(fichero.name, fichero, {
        access: 'public',
        handleUploadUrl: '/api/media/upload',
        // Lo que el servidor necesita para decidir. Va aparte del fichero porque la decisión
        // ocurre **antes** de subirlo: si tuviera que mirar el fichero, ya estaría subido.
        clientPayload: JSON.stringify({
          contentType: fichero.type,
          sizeBytes: fichero.size,
          filename: fichero.name,
        }),
      });

      const subida: ImagenDeBiblioteca = {
        id: blob.pathname,
        url: blob.url,
        filename: fichero.name,
        alt: '',
        mimeType: fichero.type,
      };

      setRecienSubidas((previas) => [subida, ...previas]);
      onElegir(subida);
    } catch (fallo) {
      setError(mensajeDeSubida(fallo));
    } finally {
      setSubiendo(false);
    }
  };

  const todas = [...recienSubidas, ...imagenes];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elegir una imagen"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onKeyDown={(evento) => {
        // `Escape` cierra: es lo que espera cualquiera que abra algo encima de lo que estaba
        // haciendo, y sin ello quien navega con teclado se queda atrapado.
        if (evento.key === 'Escape') onCerrar();
      }}
    >
      <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">Elegir una imagen</h2>
          <button
            type="button"
            onClick={onCerrar}
            className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-900" htmlFor="subir-imagen">
            Subir una imagen nueva
          </label>
          <input
            id="subir-imagen"
            type="file"
            accept={tiposAceptados.join(',')}
            disabled={subiendo}
            onChange={(evento) => {
              const fichero = evento.target.files?.[0];
              if (fichero !== undefined) void subir(fichero);
            }}
            className="mt-1 block w-full text-sm"
          />
          <p aria-live="polite" className="mt-2 text-sm">
            {subiendo && <span className="text-slate-600">Subiendo…</span>}
            {error !== null && <span className="text-red-700">{error}</span>}
          </p>
        </div>

        {todas.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            Todavía no hay imágenes. Sube la primera con el botón de arriba.
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {todas.map((imagen) => (
              <li key={imagen.id}>
                <button
                  type="button"
                  onClick={() => {
                    onElegir(imagen);
                  }}
                  className="block w-full overflow-hidden rounded border border-slate-200 hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  {/* `img` y no `next/image`: la biblioteca enseña miniaturas de imágenes que
                      acaban de subirse, y optimizarlas aquí no aporta nada. El `alt` es el
                      nombre porque es lo que distingue una de otra en una rejilla. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagen.url}
                    alt={imagen.filename}
                    className="h-24 w-full bg-slate-50 object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Qué se enseña cuando una subida falla.
 *
 * ## El problema, que es de vocabulario y no de funcionamiento
 *
 * Cuando quien rechaza es **nuestra ruta** —tipo no permitido, demasiado grande, nombre
 * inválido— el mensaje llega en español llano y es exactamente lo que hay que enseñar.
 *
 * Cuando lo que falla es la **red**, no. Ahí el mensaje lo escribe el navegador, y decía cosas
 * como "Failed to fetch" a alguien que solo quería subir una foto. `SPEC.md` §9 pide cero jerga
 * en el panel, y este era el único sitio donde se colaba en inglés — el comentario anterior daba
 * por hecho que el mensaje siempre venía de nuestra ruta.
 *
 * ## Cómo se distinguen, y por qué es "mejor esfuerzo"
 *
 * `fetch` rechaza con **`TypeError`** cuando la petición no llega a hacerse: eso está en su
 * especificación, no es una corazonada sobre la librería. Cualquier otro `Error` se trata como
 * un rechazo con motivo y se enseña tal cual.
 *
 * Es mejor esfuerzo y no una garantía: si la librería envolviera el fallo de red en otro tipo,
 * volveríamos a enseñar su texto. Se queda porque cubre el caso frecuente sin inventar nada y
 * sin mover módulos de sitio.
 */
export function mensajeDeSubida(fallo: unknown): string {
  if (fallo instanceof TypeError) return FALLO_DE_RED;
  if (fallo instanceof Error && fallo.message.trim() !== '') return fallo.message;

  return 'No se ha podido subir la imagen.';
}
