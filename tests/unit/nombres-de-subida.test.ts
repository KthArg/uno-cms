import { describe, expect, it } from 'vitest';
import { esPathnameGenerado, generarPathname } from '@/cms/nombres-de-subida';

/**
 * T-199-1 a T-199-4: **el nombre con el que se guarda una imagen** (issue #199, ADR-704).
 *
 * Antes lo ponía el cliente sin que nadie lo mirara: `onBeforeGenerateToken` de `@vercel/blob`
 * **no admite `pathname` de vuelta**, así que el que devolvía el servidor se descartaba en
 * silencio y se guardaba el nombre del fichero del usuario. Se descubrió porque subir dos veces
 * la misma imagen chocaba con «this blob already exists».
 *
 * La invariante ya no es «el servidor escribe el nombre» —el SDK no lo permite— sino **«nada que
 * el servidor no acepte llega al almacén»**. Todo lo de aquí sostiene esa frase.
 */

describe('T-199-1 — la forma del nombre', () => {
  it('es `media/AAAA-MM/<uuid>.<extensión>`', () => {
    const nombre = generarPathname('image/png');

    expect(nombre).toMatch(/^media\/\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/);
    expect(esPathnameGenerado(nombre, 'image/png')).toBe(true);
  });

  it('dos nombres seguidos nunca son iguales', () => {
    // **El fallo con el que se descubrió todo esto.** Sin el UUID, subir dos veces el mismo
    // fichero rebota con «this blob already exists» y quien edita no entiende por qué.
    const nombres = new Set(Array.from({ length: 50 }, () => generarPathname('image/png')));

    expect(nombres.size).toBe(50);
  });

  it('cada tipo aceptado tiene su extensión', () => {
    const esperadas: readonly (readonly [string, string])[] = [
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
      ['image/avif', 'avif'],
      ['image/gif', 'gif'],
    ];

    for (const [tipo, extension] of esperadas) {
      // `endsWith` y no un `RegExp` construido: la regla de seguridad marca los regex hechos
      // con una variable, y aquí no aporta nada que una comparación de sufijo no dé.
      expect(generarPathname(tipo).endsWith(`.${extension}`), tipo).toBe(true);
    }
  });
});

describe('T-199-2 — lo que el servidor rechaza', () => {
  it('el nombre crudo de un fichero, que es lo que se subía hasta ahora', () => {
    // El caso exacto del despliegue: `Screenshot 2026-08-19 212752.png`.
    for (const nombre of [
      'Screenshot 2026-08-19 212752.png',
      'foto.png',
      'media/foto.png',
      'media/2026-08/foto.png',
    ]) {
      expect(esPathnameGenerado(nombre, 'image/png'), nombre).toBe(false);
    }
  });

  it('algo que se le parece pero no lleva un UUID de verdad', () => {
    // Una comprobación laxa —«algo hexadecimal»— aceptaría esto, y entonces no comprobaría nada.
    for (const nombre of [
      'media/2026-08/abcdef.png',
      'media/2026-08/00000000-0000-0000-0000-00000000000.png',
      'media/2026-08/gggggggg-gggg-gggg-gggg-gggggggggggg.png',
    ]) {
      expect(esPathnameGenerado(nombre, 'image/png'), nombre).toBe(false);
    }
  });

  it('una carpeta que no es un mes', () => {
    for (const nombre of [
      'media/2026-13/8a1f0c2e-1111-4222-8333-444455556666.png',
      'media/2026-00/8a1f0c2e-1111-4222-8333-444455556666.png',
      'otra/2026-08/8a1f0c2e-1111-4222-8333-444455556666.png',
      '../media/2026-08/8a1f0c2e-1111-4222-8333-444455556666.png',
    ]) {
      expect(esPathnameGenerado(nombre, 'image/png'), nombre).toBe(false);
    }
  });

  it('lo que no es una cadena', () => {
    for (const basura of [null, undefined, 42, {}, []]) {
      expect(esPathnameGenerado(basura, 'image/png'), String(basura)).toBe(false);
    }
  });
});

describe('T-199-3 — la extensión concuerda con el tipo', () => {
  it('un `.png` declarado como webp no cuela', () => {
    // Pasaría la forma y dejaría en el almacén un objeto cuyo nombre miente sobre su contenido.
    // Lo que se sirve después lo decide la extensión en más sitios de los que uno recuerda.
    const nombre = generarPathname('image/png');

    expect(esPathnameGenerado(nombre, 'image/png')).toBe(true);
    expect(esPathnameGenerado(nombre, 'image/webp')).toBe(false);
  });

  it('un tipo que no aceptamos no vale ni con la forma correcta', () => {
    const nombre = generarPathname('image/png');

    for (const tipo of ['image/svg+xml', 'text/html', 'application/octet-stream', '']) {
      expect(esPathnameGenerado(nombre, tipo), tipo).toBe(false);
    }
  });
});
