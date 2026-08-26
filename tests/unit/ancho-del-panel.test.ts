import { describe, expect, it } from 'vitest';
import { esPantallaDeAnchoCompleto } from '@/cms/routes';

/**
 * T-190-6: **el ancho de la ventana es solo para el editor** (issue #190).
 *
 * El panel vive dentro de un techo de lectura de 1152 px y eso está bien: una lista de contenido
 * ocupando 1900 píxeles obliga a barrer la cabeza de un lado a otro para leer una columna. La
 * excepción es el editor de una entrada, donde media pantalla es una vista previa de una web de
 * verdad y el techo la dejaba al tercio de su tamaño.
 *
 * Sin este caso, quitar la condición y devolver `true` a secas no rompía nada: el editor seguía
 * ancho y el resto del panel se ensanchaba en silencio. Lo enseñó una mutación.
 */

describe('T-190-6 — quién usa todo el ancho', () => {
  it('el editor de una entrada, sí', () => {
    expect(esPantallaDeAnchoCompleto('/admin/content/hero')).toBe(true);
    // Un elemento de colección es la misma pantalla, con la clave compuesta.
    expect(esPantallaDeAnchoCompleto('/admin/content/testimonials.3f2a')).toBe(true);
  });

  it('el resto del panel, no', () => {
    for (const ruta of [
      // El listado, que es una lista y se lee mejor estrecho. Ojo a este: es el prefijo del
      // anterior sin la barra, y un `startsWith('/admin/content')` lo daría por ancho.
      '/admin/content',
      '/admin',
      '/admin/media',
      '/admin/users',
      '/admin/settings',
      '/admin/account',
      '/admin/history/hero',
    ]) {
      expect(esPantallaDeAnchoCompleto(ruta), ruta).toBe(false);
    }
  });
});
