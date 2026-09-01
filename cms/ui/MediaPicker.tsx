'use client';

import { useRouter } from 'next/navigation';

import { generarPathname } from '@/cms/nombres-de-subida';

import { upload } from '@vercel/blob/client';
import { useState } from 'react';
import type { ImagenDeBiblioteca } from '@/cms/core/media';
import {
  MENSAJES_DE_SUBIDA,
  mensajeNuestro,
  REGISTRO_FALLIDO,
  SUBIDA_FALLIDA,
} from '@/cms/mensajes-de-subida';
import { FALLO_DE_RED } from './fallo-de-red';
import { Icono } from './iconos';
import { BOTON_ICONO } from './estilos';

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
  /**
   * Si las imágenes van al disco de quien desarrolla en vez de a Vercel Blob (spec 07 §4.5).
   *
   * Llega por props y no por una variable `NEXT_PUBLIC_` porque **la decisión es del servidor**:
   * una variable pública sería una segunda fuente de verdad, y el día que discrepara, el
   * navegador subiría a un sitio y el servidor esperaría el otro.
   */
  readonly almacenLocal?: boolean;
  /**
   * Deja constancia de la imagen recién subida, sin esperar al aviso de Vercel (issue #205).
   *
   * Opcional porque el camino del disco (ADR-700) ya escribe la fila en su propia ruta: allí el
   * fichero pasa por el servidor y no hay nada que esperar.
   */
  readonly registrar?: (imagen: {
    url: string;
    pathname: string;
    filename: string;
    mimeType: string;
  }) => Promise<{ ok: boolean }>;
}

export function MediaPicker({
  imagenes,
  onElegir,
  onCerrar,
  tiposAceptados,
  tamanoMaximoBytes,
  almacenLocal = false,
  registrar,
}: MediaPickerProps) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recienSubidas, setRecienSubidas] = useState<ImagenDeBiblioteca[]>([]);

  const subir = async (fichero: File): Promise<void> => {
    setError(null);

    // El aviso adelantado. Lo mismo lo comprueba el servidor.
    // Los mismos textos que usa el servidor, no una copia. Estaban escritos a mano aquí, que
    // es exactamente cómo dos mensajes que deben coincidir dejan de coincidir.
    if (!tiposAceptados.includes(fichero.type)) {
      setError(MENSAJES_DE_SUBIDA['tipo-no-permitido']);
      return;
    }
    if (fichero.size > tamanoMaximoBytes) {
      setError(MENSAJES_DE_SUBIDA['demasiado-grande']);
      return;
    }

    setSubiendo(true);
    try {
      // Lo único que se bifurca es a dónde van los bytes. El `catch` de abajo, el mensaje que
      // se enseña y el `finally` son los mismos para los dos, así que lo aprendido en #164 y
      // #165 cubre este camino sin repetirse ni una línea.
      const subida = almacenLocal ? await subirAlDisco(fichero) : await subirABlob(fichero);

      // **Se anota antes de nada, sin esperar al aviso de Vercel** (issue #205).
      //
      // Ese aviso llega desde los servidores de Vercel y llega tarde: medido en el despliegue,
      // el refresco de abajo salía un segundo **antes** que la fila, así que la biblioteca se
      // pintaba sin la imagen. Y era el único que la escribía: si no llegara, el fichero se
      // quedaría en el almacén sin que el CMS lo supiera nunca.
      //
      // Los dos escriben lo mismo y el segundo no hace nada: la fila lleva `pathname` único.
      if (!almacenLocal && registrar !== undefined) {
        const registro = await registrar({
          url: subida.url,
          pathname: subida.id,
          filename: fichero.name,
          mimeType: fichero.type,
        });

        // Si esto falla, el fichero **está subido** y el CMS no lo tiene. No se puede seguir
        // como si nada: se dice, y con un mensaje distinto del de «no se ha podido subir»,
        // porque repetir la subida solo acumularía copias.
        if (!registro.ok) throw new Error(REGISTRO_FALLIDO);
      }

      // El estado local es lo que hace que la imagen se vea **al instante**, sin esperar a la
      // vuelta del servidor. Se queda.
      setRecienSubidas((previas) => [subida, ...previas]);
      onElegir(subida);

      // Y esto le dice a Next que los datos del servidor han cambiado (issue #203).
      //
      // Sin ello, la imagen se veía aquí y desaparecía al cambiar de pantalla y volver: estas
      // pantallas son `force-dynamic`, así que no hay caché de servidor, pero la **caché del
      // enrutador del cliente** reutiliza la respuesta que guardó de la ruta anterior, con la
      // biblioteca de antes. Recargar el sitio entero la tiraba, y por eso parecía funcionar
      // «al recargar».
      //
      // Va después de `onElegir` a propósito: primero lo que ve quien acaba de subir, después
      // lo que confirma el servidor.
      router.refresh();
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      onKeyDown={(evento) => {
        // `Escape` cierra: es lo que espera cualquiera que abra algo encima de lo que estaba
        // haciendo, y sin ello quien navega con teclado se queda atrapado.
        if (evento.key === 'Escape') onCerrar();
      }}
    >
      <div className="lamina-tarjeta max-h-[80vh] w-full max-w-3xl overflow-auto rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-tinta">Elegir una imagen</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className={BOTON_ICONO}>
            <Icono de="cerrar" />
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-tinta" htmlFor="subir-imagen">
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
            {subiendo && <span className="text-tinta-suave">Subiendo…</span>}
            {error !== null && <span className="text-alarma">{error}</span>}
          </p>
        </div>

        {todas.length === 0 ? (
          <p className="mt-6 text-sm text-tinta-tenue">
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
                  className="block w-full overflow-hidden rounded border border-linea hover:border-linea-fuerte focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                >
                  {/* `img` y no `next/image`: la biblioteca enseña miniaturas de imágenes que
                      acaban de subirse, y optimizarlas aquí no aporta nada. El `alt` es el
                      nombre porque es lo que distingue una de otra en una rejilla. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagen.url}
                    alt={imagen.filename}
                    className="h-24 w-full bg-papel object-cover"
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
/**
 * El camino de siempre: el navegador sube **directo** a Vercel Blob (ADR-005).
 *
 * El fichero no pasa por nuestro servidor, que es lo que hace viable subir diez megas desde una
 * función serverless. La contrapartida conocida es que el tamaño que se comprueba lo declara
 * este código: está en `docs/PENDIENTES.md` y sigue siendo así.
 */
async function subirABlob(fichero: File): Promise<ImagenDeBiblioteca> {
  // **El nombre lo propone el cliente porque el SDK no deja otra cosa** (issue #199): lo que
  // devuelva el servidor en `onBeforeGenerateToken` se descarta. Antes se mandaba
  // `fichero.name` tal cual, así que el nombre del fichero de quien edita acababa en una URL
  // pública y dos subidas del mismo fichero chocaban.
  //
  // Que lo proponga el cliente solo vale porque el servidor lo comprueba antes de emitir el
  // token, y rechaza cualquier cosa que no tenga esta forma exacta.
  const blob = await upload(generarPathname(fichero.type), fichero, {
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

  return {
    id: blob.pathname,
    url: blob.url,
    filename: fichero.name,
    alt: '',
    mimeType: fichero.type,
  };
}

/**
 * El camino de desarrollo: el fichero va a nuestro servidor y de ahí al disco (spec 07).
 *
 * Un `fetch` normal con `FormData`, sin librería. Aquí el fichero **sí** pasa por el servidor,
 * así que allí el tope se comprueba sobre los bytes que llegan de verdad.
 *
 * Si la respuesta no es correcta, se lanza con el texto que mandó el servidor. Eso lo recoge
 * `mensajeDeSubida()`, que ya sabe distinguir un rechazo nuestro de cualquier otra cosa: por
 * eso este camino no necesita su propio manejo de errores.
 */
async function subirAlDisco(fichero: File): Promise<ImagenDeBiblioteca> {
  const cuerpo = new FormData();
  cuerpo.append('fichero', fichero);

  const respuesta = await fetch('/api/media/local', { method: 'POST', body: cuerpo });

  if (!respuesta.ok) {
    const datos = (await respuesta.json().catch(() => ({}))) as { error?: string };
    throw new Error(datos.error ?? SUBIDA_FALLIDA);
  }

  return (await respuesta.json()) as ImagenDeBiblioteca;
}

export function mensajeDeSubida(fallo: unknown): string {
  // La misma regla que aplica la ruta, en la misma función: si se separaran, una de las dos
  // acabaría dejando pasar algo que la otra filtra.
  if (fallo instanceof Error) {
    const nuestro = mensajeNuestro(fallo.message);
    if (nuestro !== null) return nuestro;
  }

  // `fetch` rechaza con `TypeError` cuando la petición no llega a hacerse; está en su
  // especificación. Merece un mensaje distinto porque la acción a tomar es distinta: aquí sí
  // sirve mirar la conexión.
  if (fallo instanceof TypeError) return FALLO_DE_RED;

  return SUBIDA_FALLIDA;
}
