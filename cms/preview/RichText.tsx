'use client';

import type { ReactNode } from 'react';
import { isSafeLink } from '@/cms/links';

/**
 * El renderizador de texto enriquecido (SPEC §6.3, ADR-107, ADR-106).
 *
 * ## Nunca construye una cadena de HTML, y esa es toda la defensa
 *
 * `SPEC.md` §6.3 dice que `RichText` convierte el JSON de ProseMirror a HTML "pasando siempre
 * por `sanitize.ts`". Eso era imposible: el saneador es del servidor y la vista previa renderiza
 * en el cliente. La salida está en ADR-107 y es más fuerte que la que pedía la spec — **no se
 * deriva HTML en ningún momento**, se emiten elementos de React.
 *
 * La diferencia importa: sanear una cadena es una carrera contra quien escriba la cadena más
 * rara; no tener cadena elimina el terreno de juego. React escapa el texto por defecto y no
 * queda un solo punto donde inyectar markup. Por eso `dangerouslySetInnerHTML` está prohibido
 * en todo el proyecto sin excepciones, y por eso esa regla de lint puede no tener allowlist.
 *
 * **Este componente es la verificación de ADR-107** que el propio ADR dejó pendiente (issue
 * #19): hasta ahora la afirmación no estaba ejercitada porque no había renderizador.
 *
 * ## Filtra otra vez lo que el saneador ya filtró
 *
 * No es duplicar por duplicar. El saneador de M3 protege lo que entra **por las actions**, y un
 * documento puede llegar a la base de datos por otra vía: una restauración, una migración, un
 * `psql` a mano, un volcado de otro entorno. Este renderizador es la última línea y la única
 * que ve quien visita la web.
 *
 * La allowlist es la de §6.3. Lo que no está, se descarta — **el nodo, no el documento**: un
 * bloque desconocido no puede dejar en blanco la página entera.
 */

export interface RichTextProps {
  /** El documento de ProseMirror. `unknown` porque en la vista previa llega por `postMessage`. */
  readonly value: unknown;
  /**
   * Clases para el contenedor, que las pone **quien usa el componente**.
   *
   * Este componente lo aporta el CMS y lo consume la landing de cada proyecto: fijarle aquí un
   * color o un espaciado sería imponerle una paleta a quien lo adopte, y §6.3 promete lo
   * contrario — que adaptar el CMS sea escribir la configuración y las secciones.
   */
  readonly className?: string;
}

/** Nodo de ProseMirror ya comprobado por `esNodo`. */
interface Nodo {
  readonly type: string;
  readonly content?: unknown;
  readonly text?: unknown;
  readonly attrs?: Record<string, unknown>;
  readonly marks?: unknown;
}

function esNodo(valor: unknown): valor is Nodo {
  return typeof valor === 'object' && valor !== null && typeof (valor as Nodo).type === 'string';
}

/** §6.3 dice h2–h4: el h1 pertenece a la página, no al contenido de un campo. */
const NIVELES_DE_TITULO: Record<number, 'h2' | 'h3' | 'h4'> = { 2: 'h2', 3: 'h3', 4: 'h4' };

function hijos(nodo: Nodo): ReactNode {
  if (!Array.isArray(nodo.content)) return null;

  return nodo.content.map((hijo, indice) => (
    // La posición como clave: los nodos de ProseMirror no tienen identidad propia y esta lista
    // se sustituye entera en cada cambio, así que no hay reordenación que confundir.
    <RenderNodo key={indice} nodo={hijo} />
  ));
}

/**
 * Las marcas de un fragmento de texto, aplicadas de fuera hacia dentro.
 *
 * Se envuelve el texto en vez de acumular etiquetas: con `[bold, italic]` sale
 * `<strong><em>…</em></strong>`, o sea que **la primera marca del documento queda por fuera**.
 *
 * Por eso se recorre al revés: envolver es una operación de dentro hacia fuera, así que para
 * que el orden del resultado sea el del documento hay que empezar por la última. Escribí el
 * bucle en el orden natural, el test enseñó `<em><strong>` y el comentario decía lo contrario
 * de lo que hacía el código.
 *
 * En HTML las dos anidaciones significan lo mismo, así que esto no arregla un fallo visible:
 * arregla que el código haga lo que dice.
 */
function conMarcas(texto: string, marcas: unknown): ReactNode {
  if (!Array.isArray(marcas)) return texto;

  let salida: ReactNode = texto;

  for (const marca of [...marcas].reverse()) {
    if (!esNodo(marca)) continue;

    if (marca.type === 'bold') salida = <strong>{salida}</strong>;
    else if (marca.type === 'italic') salida = <em>{salida}</em>;
    else if (marca.type === 'link') salida = enlace(marca, salida);
    // Cualquier otra marca se ignora y el texto se conserva. Perder el texto por no reconocer
    // un subrayado sería castigar al lector por un fallo del editor.
  }

  return salida;
}

/**
 * Un enlace, si el destino pasa la comprobación; si no, **solo el texto**.
 *
 * `isSafeLink` es la misma función que valida al guardar (ADR-500), no una copia: una segunda
 * implementación podría separarse en comportamiento y dejar pasar aquí lo que allí se rechaza.
 *
 * `rel="noopener noreferrer"` lo pone el renderizador y no el contenido, porque M1 decidió no
 * guardar `target` ni `rel`: son presentación, no contenido. Va en **todos** los enlaces y no
 * solo en los externos, que es más simple y no cuesta nada — en uno interno sobra, no estorba.
 */
function enlace(marca: Nodo, contenido: ReactNode): ReactNode {
  const href = marca.attrs?.['href'];

  // Sin enlace, pero **con** el texto. Descartar el fragmento entero dejaría un hueco en mitad
  // de una frase, y quien lo leyera no sabría que falta algo.
  if (!isSafeLink(href)) return contenido;

  return (
    // El subrayado se queda, y es la única excepción a "el estilo lo pone quien consume": un
    // enlace que no se distingue del texto que lo rodea es un fallo de accesibilidad, y este
    // componente no puede saber si la hoja de estilos de destino lo resuelve. Quitarlo se hace
    // con una regla de CSS; no ponerlo no se arregla desde fuera.
    <a href={href} rel="noopener noreferrer" className="underline underline-offset-2">
      {contenido}
    </a>
  );
}

function RenderNodo({ nodo }: { nodo: unknown }): ReactNode {
  if (!esNodo(nodo)) return null;

  switch (nodo.type) {
    case 'text':
      return typeof nodo.text === 'string' ? conMarcas(nodo.text, nodo.marks) : null;

    case 'paragraph':
      return <p>{hijos(nodo)}</p>;

    case 'heading': {
      const nivel = nodo.attrs?.['level'];
      const etiqueta = typeof nivel === 'number' ? NIVELES_DE_TITULO[nivel] : undefined;

      // Un `h1` o un `h5` no se convierten en otra cosa: se degradan a párrafo. Cambiarlos por
      // el nivel más cercano falsearía la jerarquía del documento, que es lo que usa quien
      // navega con lector de pantalla para orientarse.
      if (etiqueta === undefined) return <p>{hijos(nodo)}</p>;

      const Titulo = etiqueta;
      return <Titulo>{hijos(nodo)}</Titulo>;
    }

    case 'bulletList':
      return <ul>{hijos(nodo)}</ul>;

    case 'orderedList': {
      const inicio = nodo.attrs?.['start'];
      return <ol start={typeof inicio === 'number' ? inicio : undefined}>{hijos(nodo)}</ol>;
    }

    case 'listItem':
      return <li>{hijos(nodo)}</li>;

    case 'blockquote':
      return <blockquote>{hijos(nodo)}</blockquote>;

    case 'hardBreak':
      return <br />;

    case 'doc':
      return <>{hijos(nodo)}</>;

    default:
      // Fuera de la allowlist. Se descarta **este nodo**, no el documento: un bloque
      // desconocido —una tabla pegada, una imagen de otro editor— no puede dejar la página en
      // blanco. Y no se conserva su contenido, porque no se sabe qué significa.
      return null;
  }
}

export function RichText({ value, className }: RichTextProps) {
  // Un valor que no es un documento no rompe nada: se trata como vacío (ADR-404). En la vista
  // previa esto llega por `postMessage` y ahí lo que entra no lo escribe el servidor.
  if (!esNodo(value) || value.type !== 'doc') return null;

  return <div className={className}>{hijos(value)}</div>;
}
