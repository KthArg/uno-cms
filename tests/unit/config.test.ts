import { describe, expect, it } from 'vitest';
import appConfig from '@/cms.config';
import { ConfigError, defineConfig, s } from '@/cms/core/config';

describe('T-38-1 — el ejemplo de SPEC §5.1 se acepta tal cual', () => {
  it('carga con sus tres singletons y sus dos colecciones', () => {
    expect(Object.keys(appConfig.singletons)).toEqual(['hero', 'about', 'seo']);
    expect(Object.keys(appConfig.collections)).toEqual(['testimonials', 'faqs']);
    expect(appConfig.siteName).toBe('Mi Empresa');
  });

  it('conserva las opciones que el panel necesita para pintar el formulario', () => {
    const { title, subtitle } = appConfig.singletons.hero.fields;

    expect(title).toMatchObject({ kind: 'text', label: 'Título principal', max: 120 });
    expect(title.required).toBe(true);
    expect(subtitle).toMatchObject({ kind: 'text', multiline: true, max: 300 });
    expect(subtitle.required).toBe(false);
  });

  it('registra el default de `about.visible` sin marcarlo requerido', () => {
    const visible = appConfig.singletons.about.fields.visible;

    expect(visible.hasDefault).toBe(true);
    expect(visible.defaultValue).toBe(true);
    expect(visible.required).toBe(false);
  });
});

describe('T-38-6 — `required` junto a `default` se rechaza', () => {
  it('lanza nombrando el campo concreto', () => {
    const build = () =>
      defineConfig({
        siteName: 'X',
        singletons: {
          hero: s.object({
            title: s.text({ label: 'Título', required: true, default: 'Hola' }),
          }),
        },
      });

    expect(build).toThrow(ConfigError);
    // El mensaje tiene que decir DÓNDE: el desarrollador lo lee en una traza de arranque.
    expect(build).toThrow(/hero\.title/);
  });
});

describe('validaciones que evitan datos corruptos más adelante', () => {
  it('rechaza un punto en el nombre, que rompería las claves de colección', () => {
    // Las claves de item son `coleccion.nanoid` (SPEC §5.3). Un punto en el nombre haría
    // ambigua esa clave al partirla, y el fallo aparecería mucho más tarde y muy lejos.
    expect(() =>
      defineConfig({
        siteName: 'X',
        singletons: { 'hero.principal': s.object({ t: s.text({ label: 'T' }) }) },
      })
    ).toThrow(/punto/);
  });

  it('rechaza un titleField que no existe, y dice cuáles hay', () => {
    const build = () =>
      defineConfig({
        siteName: 'X',
        singletons: {},
        collections: {
          testimonials: {
            label: 'Testimonios',
            // @ts-expect-error 'autor' no es un campo del esquema; el tipo ya lo impide.
            titleField: 'autor',
            schema: s.object({ author: s.text({ label: 'Nombre' }) }),
          },
        },
      });

    expect(build).toThrow(ConfigError);
    expect(build).toThrow(/author/);
  });

  it('rechaza que un nombre sea a la vez singleton y colección', () => {
    // Ambos viven en el mismo espacio de claves de `content_entries` (SPEC §4): la colisión
    // no daría error de base de datos, daría contenido pisado.
    expect(() =>
      defineConfig({
        siteName: 'X',
        singletons: { faqs: s.object({ t: s.text({ label: 'T' }) }) },
        collections: {
          faqs: {
            label: 'FAQ',
            titleField: 'q',
            schema: s.object({ q: s.text({ label: 'Pregunta' }) }),
          },
        },
      })
    ).toThrow(/singleton y como colección/);
  });

  it('rechaza un select sin opciones', () => {
    expect(() =>
      defineConfig({
        siteName: 'X',
        singletons: {
          layout: s.object({ align: s.select({ label: 'Alineación', options: [] }) }),
        },
      })
    ).toThrow(/al menos una opción/);
  });
});
