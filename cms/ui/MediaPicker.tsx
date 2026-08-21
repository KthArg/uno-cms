'use client';

import { upload } from '@vercel/blob/client';
import { useState } from 'react';
import type { ImagenDeBiblioteca } from '@/cms/core/media';
import { MENSAJES_DE_SUBIDA, SUBIDA_FALLIDA } from '@/cms/mensajes-de-subida';
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
      // El texto original al registro: es lo único que le sirve a quien puede arreglar un
      // almacén sin conectar o un token caducado.
      console.error('[subida] ha fallado', fallo);
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
 * ## La regla: solo se enseña texto que hemos escrito nosotros
 *
 * El error que llega aquí no viene solo de nuestra ruta. La librería de subidas construye
 * **todos** sus errores como `Vercel Blob: <lo que sea>`, así que por el mismo canal llegan
 * cosas como **"Vercel Blob: Failed to retrieve the client token"** — que es exactamente lo que
 * se leía en el panel al probarlo en local sin almacén conectado.
 *
 * La primera versión de esta función clasificaba al revés: enseñaba el mensaje salvo que fuera
 * un `TypeError` de red. Eso deja pasar **todo** lo demás, y lo demás es inglés y jerga. Lo dije
 * como "mejor esfuerzo" y no lo era: era una lista negra de un solo caso.
 *
 * Ahora se comprueba lo contrario, que es lo único que no se equivoca: si el mensaje **contiene**
 * uno de los nuestros —`cms/mensajes-de-subida.ts`— se enseña ese; si no, uno propio. Se compara
 * por contenido y no por igualdad justamente porque la librería antepone su prefijo.
 *
 * ## Y el original no se pierde
 *
 * Va al registro del navegador. Esconder jerga no puede significar tirar el diagnóstico: quien
 * puede arreglar un almacén sin conectar necesita leer que el fallo era el token.
 */
export function mensajeDeSubida(fallo: unknown): string {
  if (fallo instanceof Error) {
    const nuestro = Object.values(MENSAJES_DE_SUBIDA).find((mensaje) =>
      fallo.message.includes(mensaje)
    );

    if (nuestro !== undefined) return nuestro;
  }

  // `fetch` rechaza con `TypeError` cuando la petición no llega a hacerse; está en su
  // especificación. Merece un mensaje distinto porque la acción a tomar es distinta: aquí sí
  // sirve mirar la conexión.
  if (fallo instanceof TypeError) return FALLO_DE_RED;

  return SUBIDA_FALLIDA;
}
