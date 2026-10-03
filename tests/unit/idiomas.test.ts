import { describe, expect, it, vi } from 'vitest';
import appConfig from '@/cms.config';
import { ConfigError, defineConfig, s, type Idioma } from '@/cms/core/config';
import {
  codigoDeColumna,
  columnaDeIdioma,
  columnaDeIdiomaOpcional,
  hayVariosIdiomas,
  idiomaPorDefecto,
} from '@/cms/core/idiomas';
import { destinoAlCambiarDeIdioma, leerIdiomaDelPanel } from '@/cms/core/idioma-del-panel';

/**
 * Spec 17, idiomas: la configuración (T-ID-1 a T-ID-6), la caché (T-ID-25) y la cookie del panel
 * (T-ID-43). Lo que no necesita base de datos.
 */

const llamadasACache = vi.hoisted(
  () => [] as { claves: readonly string[]; tags: readonly string[] | undefined }[]
);
vi.mock('next/cache', () => ({
  unstable_cache: (
    _leer: () => Promise<unknown>,
    claves: readonly string[],
    opciones?: { tags?: readonly string[] }
  ) => {
    llamadasACache.push({ claves, tags: opciones?.tags });
    return () => Promise.resolve({});
  },
}));

function conIdiomas(idiomas: readonly [Idioma, ...Idioma[]]) {
  return () =>
    defineConfig({
      siteName: 'X',
      idiomas,
      singletons: { hero: s.object({ title: s.text({ label: 'Título' }) }) },
    });
}

describe('T-ID-1 y T-ID-2 — qué idiomas tiene un sitio', () => {
  it('T-ID-1: sin `idiomas`, uno solo, `es`, y es el de por defecto', () => {
    const config = defineConfig({
      siteName: 'X',
      singletons: { hero: s.object({ title: s.text({ label: 'Título' }) }) },
    });

    expect(config.idiomas).toEqual([{ codigo: 'es', nombre: 'Español' }]);
  });

  it('T-ID-2: el primero de la lista es el de por defecto', () => {
    // El `cms.config.ts` del repositorio declara `es` y `en`, en ese orden.
    expect(appConfig.idiomas.map((idioma) => idioma.codigo)).toEqual(['es', 'en']);
    expect(idiomaPorDefecto().codigo).toBe('es');
    expect(hayVariosIdiomas()).toBe(true);
  });
});

describe('T-ID-3 a T-ID-5 — `defineConfig` rechaza lo que no se puede servir', () => {
  it('T-ID-3: lista vacía, código repetido y nombre vacío', () => {
    expect(conIdiomas([] as unknown as [Idioma])).toThrow(ConfigError);
    expect(
      conIdiomas([
        { codigo: 'es', nombre: 'Español' },
        { codigo: 'es', nombre: 'Castellano' },
      ])
    ).toThrow(/repetido/);
    expect(conIdiomas([{ codigo: 'es', nombre: '  ' }])).toThrow(/nombre/);
  });

  it('T-ID-4: códigos mal formados fuera; `es`, `ast` y `pt-BR` dentro', () => {
    for (const malo of ['EN', 'english', 'es_ES', 'es-', 'pt-br', 'e', 'es-ES-x']) {
      expect(conIdiomas([{ codigo: malo, nombre: 'X' }]), malo).toThrow(ConfigError);
    }

    for (const bueno of ['es', 'ast', 'pt-BR']) {
      expect(conIdiomas([{ codigo: bueno, nombre: 'X' }]), bueno).not.toThrow();
    }
  });

  it('T-ID-5: un código que choca con una ruta del CMS', () => {
    // `api` es el único de los cuatro que pasaría el patrón; los demás ya caen por largos, y se
    // comprueban igual para que el día que el patrón cambie esto siga diciendo la verdad.
    for (const propio of ['api', 'admin', 'preview', 'setup']) {
      expect(conIdiomas([{ codigo: propio, nombre: 'X' }]), propio).toThrow(ConfigError);
    }
    expect(conIdiomas([{ codigo: 'api', nombre: 'X' }])).toThrow(/ruta/);
  });
});

describe('T-ID-6 — de código a columna y vuelta', () => {
  it('el de por defecto se guarda como cadena vacía, y los demás con su código', () => {
    expect(columnaDeIdioma('es')).toBe('');
    expect(columnaDeIdioma('en')).toBe('en');
    expect(columnaDeIdioma('fr')).toBeNull();
    expect(columnaDeIdiomaOpcional(undefined)).toBe('');
  });

  it('y la vuelta es exacta', () => {
    for (const codigo of ['es', 'en']) {
      expect(codigoDeColumna(columnaDeIdioma(codigo)!)).toBe(codigo);
    }
  });
});

describe('T-ID-25 — la caché se separa por idioma y el tag no', () => {
  it('la clave lleva la columna del idioma; el tag es el de siempre', async () => {
    const { getContent, getCollection } = await import('@/cms/core/content');
    llamadasACache.length = 0;

    await getContent('hero', 'en');
    await getContent('hero');
    await getContent('hero', 'es');
    await getCollection('faqs', 'en');

    expect(llamadasACache).toEqual([
      { claves: ['content', 'hero', 'en'], tags: ['content:hero'] },
      // Sin idioma y con el de por defecto son **la misma** entrada de caché.
      { claves: ['content', 'hero', ''], tags: ['content:hero'] },
      { claves: ['content', 'hero', ''], tags: ['content:hero'] },
      { claves: ['collection', 'faqs', 'en'], tags: ['content:faqs'] },
    ]);
  });
});

describe('T-ID-43 — la cookie del panel', () => {
  it('un idioma declarado se respeta', () => {
    expect(leerIdiomaDelPanel('en')).toBe('en');
  });

  it('sin cookie, o con un idioma que ya no existe, el de por defecto', () => {
    expect(leerIdiomaDelPanel(undefined)).toBe('es');
    expect(leerIdiomaDelPanel('fr')).toBe('es');
    expect(leerIdiomaDelPanel('')).toBe('es');
  });
});

describe('al cambiar de idioma, a dónde se va', () => {
  it('desde un elemento de lista, a la lista: el elemento no existe en el otro idioma', () => {
    expect(destinoAlCambiarDeIdioma('/admin/content/faqs.123')).toBe('/admin/collections/faqs');
    expect(destinoAlCambiarDeIdioma('/admin/history/testimonials.9')).toBe(
      '/admin/collections/testimonials'
    );
  });

  it('desde una sección fija o cualquier otra pantalla, a ningún sitio', () => {
    expect(destinoAlCambiarDeIdioma('/admin/content/hero')).toBeNull();
    expect(destinoAlCambiarDeIdioma('/admin')).toBeNull();
    expect(destinoAlCambiarDeIdioma('/admin/collections/faqs')).toBeNull();
  });

  it('nunca a una dirección que venga de la ruta y no de `cms.config.ts`', () => {
    // La ruta la manda el navegador. Si el destino se copiara de ella, esto sería una
    // redirección abierta.
    expect(destinoAlCambiarDeIdioma('/admin/content/evil.example')).toBeNull();
    expect(destinoAlCambiarDeIdioma('/admin/content/%E0%A4%A')).toBeNull();
    expect(destinoAlCambiarDeIdioma('https://evil.example/admin/content/faqs.1')).toBeNull();
  });
});
