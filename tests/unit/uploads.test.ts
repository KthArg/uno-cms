import { describe, expect, it } from 'vitest';
import { generarPathname } from '@/cms/nombres-de-subida';
import {
  decidirSubida,
  nombreLegible,
  TAMANO_MAXIMO_BYTES,
  TIPOS_PERMITIDOS,
} from '@/cms/security/uploads';

/**
 * T-D-1 a T-D-5: las reglas de subida (SPEC §5.3, §7.1 "abuso de uploads").
 *
 * Se prueban aquí y no contra la ruta porque Vercel Blob necesita un token real: un test que
 * pasara por su cliente no se podría ejecutar en CI, y **la parte de seguridad sería justo la
 * que no se prueba**. Esta función no toca red ni proveedor — entra lo que dice el navegador y
 * sale una decisión — así que admite todos los casos hostiles que hagan falta.
 */

const MB = 1024 * 1024;

describe('qué se acepta', () => {
  it('los cinco tipos de la lista', () => {
    for (const tipo of TIPOS_PERMITIDOS) {
      expect(decidirSubida({ contentType: tipo, sizeBytes: MB }).ok, tipo).toBe(true);
    }
  });

  it('T-D-3: el límite son 10 MB, el que fija SPEC §5.3', () => {
    expect(TAMANO_MAXIMO_BYTES).toBe(10 * MB);

    expect(decidirSubida({ contentType: 'image/png', sizeBytes: 10 * MB }).ok).toBe(true);
    expect(decidirSubida({ contentType: 'image/png', sizeBytes: 10 * MB + 1 }).ok).toBe(false);
  });
});

describe('T-D-2: el SVG se rechaza', () => {
  it('image/svg+xml no entra', () => {
    // Lo decide `SPEC.md` §5.3 con todas las letras. Es el formato que todo el mundo espera
    // poder subir a un CMS y el único candidato que es un **documento con scripts dentro**:
    // servido desde nuestro dominio, ejecuta JavaScript con nuestro origen.
    const decision = decidirSubida({ contentType: 'image/svg+xml', sizeBytes: 1024 });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.motivo).toBe('tipo-no-permitido');
  });

  it('tampoco disfrazado de mayúsculas o con parámetros', () => {
    // Una comparación literal contra la lista se salta con la forma en vez de con el
    // contenido, y aquí la forma la elige quien sube.
    for (const disfraz of ['IMAGE/SVG+XML', 'image/svg+xml; charset=utf-8', ' image/svg+xml ']) {
      expect(decidirSubida({ contentType: disfraz, sizeBytes: 1024 }).ok, disfraz).toBe(false);
    }
  });
});

describe('T-D-1: la decisión no se fía de nada de lo que llega', () => {
  it('un tipo que no está en la lista se rechaza', () => {
    for (const tipo of [
      'application/pdf',
      'text/html',
      'application/javascript',
      'image/x-icon',
      'video/mp4',
      '',
    ]) {
      expect(decidirSubida({ contentType: tipo, sizeBytes: 1024 }).ok, tipo).toBe(false);
    }
  });

  it('un tipo que no es ni una cadena se rechaza', () => {
    for (const basura of [undefined, null, 42, {}, ['image/png']]) {
      expect(decidirSubida({ contentType: basura, sizeBytes: 1024 }).ok).toBe(false);
    }
  });

  it('un tamaño ausente, negativo o absurdo se rechaza', () => {
    // Sin esto, un cliente que no manda el tamaño se salta el límite entero.
    for (const tamano of [undefined, null, -1, 0, Number.NaN, Number.POSITIVE_INFINITY, '5']) {
      expect(decidirSubida({ contentType: 'image/png', sizeBytes: tamano }).ok).toBe(false);
    }
  });

  it('un tipo permitido con mayúsculas o parámetros sí se acepta, normalizado', () => {
    const decision = decidirSubida({ contentType: 'IMAGE/PNG; charset=binary', sizeBytes: 1024 });

    expect(decision.ok).toBe(true);
    expect(decision.ok && decision.contentType).toBe('image/png');
  });
});

describe('T-D-5: el nombre se genera, nunca se hereda', () => {
  it('el nombre del usuario no aparece en la ruta guardada', () => {
    const decision = decidirSubida({
      contentType: 'image/png',
      sizeBytes: 1024,
      filename: '../../etc/passwd',
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;

    // Aquí no se sanea el nombre recibido, que es un juego que se pierde tarde o temprano: se
    // descarta y se genera uno.
    expect(decision.pathname).not.toContain('passwd');
    expect(decision.pathname).not.toContain('..');
    expect(decision.pathname).toMatch(/^media\/\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/);
  });

  it('la extensión sale del tipo, no del nombre', () => {
    // Un `.php` en el nombre no llega a ninguna parte: la extensión se deriva del tipo que ya
    // ha pasado la allowlist.
    const decision = decidirSubida({
      contentType: 'image/webp',
      sizeBytes: 1024,
      filename: 'malicioso.php',
    });

    expect(decision.ok && decision.pathname.endsWith('.webp')).toBe(true);
  });

  it('dos subidas del mismo fichero no se pisan', () => {
    // Con el nombre del usuario, dos personas subiendo `logo.png` acabarían con una sola
    // imagen y sin saber cuál.
    const rutas = new Set(Array.from({ length: 50 }, () => generarPathname('image/png')));

    expect(rutas.size).toBe(50);
  });
});

describe('el nombre legible es una etiqueta, no una ruta', () => {
  it('se recorta y se le quitan los caracteres de control', () => {
    expect(nombreLegible(`foto${String.fromCharCode(0)}rara.png`)).toBe('fotorara.png');
    expect(nombreLegible('x'.repeat(500))).toHaveLength(120);
  });

  it('cualquier cosa que no sea un nombre cae en un valor por defecto', () => {
    // Acaba pintándose en una lista: un nombre vacío deja una fila sin nada que leer.
    for (const basura of [undefined, null, 42, '   ']) {
      expect(nombreLegible(basura)).toBe('imagen');
    }
  });
});
