import { describe, expect, it } from 'vitest';
import { FALLO_DE_RED } from '@/cms/ui/fallo-de-red';
import { mensajeDeSubida } from '@/cms/ui/MediaPicker';

/**
 * Qué lee alguien cuando falla una subida (SPEC §9: cero jerga en el panel).
 *
 * El `catch` de la subida enseñaba `error.message` tal cual, dando por hecho —lo decía su
 * comentario— que el mensaje venía siempre de nuestra ruta. Cuando quien falla es la red, ese
 * texto lo escribe el navegador: "Failed to fetch", en inglés, a alguien que solo quería subir
 * una foto.
 */

describe('el mensaje de una subida fallida', () => {
  it('cuando la red no llega, habla en español', () => {
    // `fetch` rechaza con `TypeError` si la petición no llega a hacerse. Está en su
    // especificación, no es una suposición sobre la librería de subidas.
    expect(mensajeDeSubida(new TypeError('Failed to fetch'))).toBe(FALLO_DE_RED);
  });

  it('cuando el rechazo es nuestro, enseña el motivo', () => {
    // Estos son los tres motivos de `cms/security/uploads.ts`, ya escritos para leerse. Taparlos
    // con un mensaje genérico sería quitarle a quien sube la única pista de qué arreglar.
    const nuestro = 'La imagen pesa demasiado. El máximo son 10 MB.';

    expect(mensajeDeSubida(new Error(nuestro))).toBe(nuestro);
  });

  it('con algo que no es un error, o sin texto, dice lo suyo', () => {
    // Enseñar una cadena vacía es peor que un mensaje genérico: parece que no ha pasado nada.
    expect(mensajeDeSubida(new Error('   '))).toBe('No se ha podido subir la imagen.');
    expect(mensajeDeSubida('vaya')).toBe('No se ha podido subir la imagen.');
    expect(mensajeDeSubida(undefined)).toBe('No se ha podido subir la imagen.');
  });
});
