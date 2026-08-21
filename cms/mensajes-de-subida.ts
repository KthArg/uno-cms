/**
 * Los motivos por los que se rechaza una subida, tal y como los lee quien sube (SPEC §9).
 *
 * ## Por qué están aquí y no en `cms/security/uploads.ts`
 *
 * Porque los necesitan los dos lados. El servidor los devuelve al rechazar; **el navegador los
 * necesita para saber cuáles son suyos**.
 *
 * Y eso hace falta porque el error que le llega al navegador no viene solo de nosotros: la
 * librería de subidas construye **todos** sus errores como `Vercel Blob: <lo que sea>`, así que
 * por el mismo canal llegan cosas como "Vercel Blob: Failed to retrieve the client token" —
 * inglés y jerga, a alguien que solo quería subir una foto.
 *
 * Con esta lista, la pantalla puede aplicar la única regla que no se equivoca: **enseñar
 * únicamente texto que hemos escrito nosotros**, y para todo lo demás un mensaje propio.
 *
 * Es el mismo criterio de ADR-500 y no necesita ADR nuevo: lo que la frontera `server-only`
 * protege son credenciales, consultas y sesiones. Esto son tres frases pensadas para leerse.
 */

export type MotivoDeRechazo = 'tipo-no-permitido' | 'demasiado-grande' | 'nombre-invalido';

export const MENSAJES_DE_SUBIDA: Record<MotivoDeRechazo, string> = {
  'tipo-no-permitido':
    'Ese tipo de archivo no se puede subir. Usa una imagen JPG, PNG, WEBP, AVIF o GIF.',
  'demasiado-grande': 'La imagen pesa demasiado. El máximo son 10 MB.',
  'nombre-invalido': 'Ese archivo no tiene un nombre válido.',
};

/**
 * Lo que se enseña cuando el fallo **no** es uno de los nuestros.
 *
 * Un token mal configurado, el almacén sin conectar, la librería quejándose de algo suyo: nada
 * de eso lo puede arreglar quien está subiendo una foto, y su texto original no le dice nada.
 * Lo que sí puede hacer es reintentar o avisar, y eso es lo que dice.
 *
 * **El texto original no se pierde**: va al registro del navegador, que es donde lo busca quien
 * puede hacer algo con él. Esconder jerga no puede significar tirar el diagnóstico.
 */
export const SUBIDA_FALLIDA =
  'No se ha podido subir la imagen. Vuelve a intentarlo; si sigue fallando, avisa a quien administra el sitio.';

/**
 * Si un texto de error es **uno de los nuestros**, y cuál.
 *
 * La regla que usan los dos lados: se enseña únicamente lo que hemos escrito. Todo lo demás
 * —la librería de subidas, el proveedor, lo que sea— se sustituye por un mensaje propio.
 *
 * Se compara por **contenido y no por igualdad** porque la librería antepone su prefijo:
 * `Vercel Blob: <nuestro mensaje>`. Comparar exacto haría que un rechazo legítimo nuestro
 * —"la imagen pesa demasiado"— acabara enseñándose como un fallo genérico.
 */
export function mensajeNuestro(texto: string): string | null {
  return Object.values(MENSAJES_DE_SUBIDA).find((mensaje) => texto.includes(mensaje)) ?? null;
}
