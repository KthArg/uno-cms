import { describe, expect, it } from 'vitest';
import { MENSAJES_DE_SUBIDA, SUBIDA_FALLIDA } from '@/cms/mensajes-de-subida';
import { FALLO_DE_RED } from '@/cms/ui/fallo-de-red';
import { mensajeDeSubida } from '@/cms/ui/MediaPicker';

/**
 * Qué lee alguien cuando falla una subida (SPEC §9: cero jerga en el panel).
 *
 * ## De dónde salen estos casos
 *
 * De probar el CMS en local sin almacén de imágenes conectado. Al elegir una foto, el panel
 * enseñó:
 *
 *     Vercel Blob: Failed to retrieve the client token
 *
 * En inglés y con el nombre del proveedor, a alguien que solo quería subir una foto.
 *
 * La versión anterior de esta función clasificaba al revés —enseñaba el mensaje salvo que fuera
 * un `TypeError` de red— y lo llamé "mejor esfuerzo". No lo era: era una lista negra de un solo
 * caso, y la librería tiene decenas. Ahora la regla es la única que no se equivoca: **se enseña
 * solo texto que hemos escrito nosotros**.
 */

describe('el mensaje de una subida fallida', () => {
  it('el caso real: el token del almacén', () => {
    // Literal, tal y como se leyó en pantalla.
    const real = new Error('Vercel Blob: Failed to retrieve the client token');

    expect(mensajeDeSubida(real)).toBe(SUBIDA_FALLIDA);
    expect(mensajeDeSubida(real)).not.toContain('Vercel');
    expect(mensajeDeSubida(real)).not.toContain('token');
  });

  it('cualquier otra queja de la librería tampoco se enseña', () => {
    // La librería construye **todos** sus errores como `Vercel Blob: <lo que sea>`, así que no
    // hace falta conocerlos: lo que no es nuestro, no se enseña.
    for (const texto of [
      'Vercel Blob: Access denied, please provide a valid token',
      'Vercel Blob: File is too large',
      'Vercel Blob: Sorry, we cannot get a Readable stream in this environment',
    ]) {
      expect(mensajeDeSubida(new Error(texto))).toBe(SUBIDA_FALLIDA);
    }
  });

  it('los rechazos NUESTROS sí se enseñan, con prefijo o sin él', () => {
    // Son los tres motivos de `cms/mensajes-de-subida.ts`, escritos para leerse. Taparlos con el
    // genérico le quitaría a quien sube la única pista de qué arreglar.
    //
    // Se comparan por contenido y no por igualdad **porque la librería antepone su prefijo** al
    // devolver el rechazo de nuestra ruta.
    for (const nuestro of Object.values(MENSAJES_DE_SUBIDA)) {
      expect(mensajeDeSubida(new Error(nuestro))).toBe(nuestro);
      expect(mensajeDeSubida(new Error(`Vercel Blob: ${nuestro}`))).toBe(nuestro);
    }
  });

  it('un fallo de red tiene su propio mensaje, porque la acción es distinta', () => {
    // `fetch` rechaza con `TypeError` si la petición no llega a hacerse; está en su
    // especificación. Aquí sí sirve mirar la conexión, y por eso no es el genérico.
    expect(mensajeDeSubida(new TypeError('Failed to fetch'))).toBe(FALLO_DE_RED);
  });

  it('con algo que no es un error, dice lo suyo', () => {
    expect(mensajeDeSubida('vaya')).toBe(SUBIDA_FALLIDA);
    expect(mensajeDeSubida(undefined)).toBe(SUBIDA_FALLIDA);
  });

  it('ninguno de los mensajes que se enseñan lleva jerga', () => {
    // La misma regla que el test de vocabulario aplica a los componentes, aquí sobre los textos
    // que solo existen en tiempo de ejecución — que es por donde se coló este.
    const todos = [...Object.values(MENSAJES_DE_SUBIDA), SUBIDA_FALLIDA, FALLO_DE_RED];

    for (const mensaje of todos) {
      for (const jerga of ['token', 'Blob', 'fetch', 'error', 'null', 'API']) {
        expect(mensaje.toLowerCase(), mensaje).not.toContain(jerga.toLowerCase());
      }
    }
  });
});
