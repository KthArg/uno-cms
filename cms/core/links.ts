import 'server-only';

/**
 * Validación de destinos de enlace (SPEC §7.1, "XSS vía contenido … `link` valida protocolo
 * y bloquea `javascript:`").
 *
 * Vive en su propio módulo, y no dentro de `schema-gen`, porque es la **única** autoridad
 * sobre qué es un enlace aceptable: la usan el esquema al guardar y el filtrado de marcas
 * `link` del richtext. Dos copias de esta lógica serían dos oportunidades de que una se
 * quedara atrás.
 *
 * Es `server-only` a propósito. Sería cómodo compartirla con el panel para avisar al editor
 * mientras teclea, pero eso exigiría marcarla como isomorfa, y una exención sobre un
 * fichero que **sí** emite JavaScript es exactamente el agujero que documenta el issue #46.
 * Si M4 quiere aviso en vivo, que lo decida entonces y con su ADR: hoy la validación al
 * guardar es suficiente y la frontera queda intacta.
 */

/** Protocolos permitidos. Deliberadamente corta: `data:` y `blob:` NO están. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Caracteres de control (U+0000–U+001F y U+007F). Se rechazan antes que nada porque son la
 * vía clásica para partir el nombre del esquema y burlar una comparación ingenua: un byte
 * nulo, un tabulador o un salto de línea metidos dentro de la palabra `javascript`. Ninguna
 * URL legítima los lleva sin codificar.
 */
function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function isSafeLink(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  if (hasControlCharacters(raw)) return false;

  const value = raw.trim();
  if (value === '') return false;

  if (value.startsWith('/')) {
    // Una ruta interna, sí. Pero `//evil.com` es una URL relativa al protocolo: el
    // navegador la resuelve como externa, aunque empiece por barra igual que una ruta.
    return !value.startsWith('//');
  }

  // Anclas y query sueltas son navegación dentro de la propia página.
  if (value.startsWith('#') || value.startsWith('?')) return true;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Sin esquema y sin barra inicial no es ni una ruta ni una URL absoluta. Se rechaza en
    // vez de adivinar: adivinar aquí es como se acaba aceptando `javascript:` escrito raro.
    return false;
  }

  // `URL` normaliza el esquema a minúsculas, así que `JavaScript:` llega como `javascript:`
  // y no hace falta comparar ignorando mayúsculas por nuestra cuenta.
  return ALLOWED_PROTOCOLS.has(parsed.protocol);
}

/** Los protocolos aceptados, para mensajes de error y documentación. */
export const allowedLinkProtocols: readonly string[] = Object.freeze([...ALLOWED_PROTOCOLS]);
