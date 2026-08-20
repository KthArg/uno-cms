/**
 * Validación de destinos de enlace (SPEC §7.1, "XSS vía contenido … `link` valida protocolo
 * y bloquea `javascript:`").
 *
 * La **única** autoridad sobre qué es un enlace aceptable. La usan el esquema al guardar, el
 * filtrado de marcas del richtext, los ajustes del sitio, el aviso en vivo del editor y el
 * renderizador de la landing. Cinco sitios, una implementación.
 *
 * ## Por qué vive fuera de `cms/core/` (ADR-500)
 *
 * Estuvo en `cms/core/links.ts` con `server-only` hasta M5, y su propio comentario anticipaba
 * este momento: "si M4 quiere aviso en vivo, que lo decida entonces y con su ADR".
 *
 * M5 lo pide de verdad: `<RichText>` decide **al renderizar** si un `href` se convierte en
 * enlace, y eso ocurre en el navegador, tanto en la landing como en la vista previa. Las dos
 * salidas que quedaban eran duplicar la lógica —dos implementaciones que pueden separarse en
 * comportamiento, no solo en datos— o sacarla de la frontera.
 *
 * Se saca, porque lo que esa frontera protege son **credenciales, consultas y sesiones**
 * (SPEC §7.1, "Secretos en cliente"), y esto es un predicado puro sobre cadenas: no lee el
 * entorno, no toca la base de datos y no importa nada. Mandarlo al navegador no revela nada que
 * el navegador no pueda deducir probando enlaces.
 *
 * Y a cambio desaparece la copia de ADR-411, que existía solo porque este módulo no se podía
 * importar desde el cliente. Una implementación no puede divergir de sí misma.
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
