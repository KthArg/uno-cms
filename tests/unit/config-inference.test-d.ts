import { describe, expectTypeOf, it } from 'vitest';
import { defineConfig, s, type ImageValue, type RichTextDoc } from '@/cms/core/config';
import type { CollectionItem, CollectionKey, Content, Draft, SingletonKey } from '@/cms/core/types';

/**
 * T-38-2 a T-38-7: la inferencia de `cms.config.ts` (SPEC §5.1).
 *
 * Estos tests son el único modo de saber si la inferencia sigue viva. Una inferencia que se
 * degrada a `any` **sigue compilando** y deja de proteger sin avisar; `expectTypeOf` con
 * `toEqualTypeOf` sí lo detecta, porque `any` no es igual a nada en particular.
 */

describe('T-38-2 / T-38-5 — obligatorios, opcionales y defaults en un singleton', () => {
  it('hero: `title` es requerido y el resto opcional', () => {
    expectTypeOf<Content<'hero'>>().toEqualTypeOf<{
      title: string;
      subtitle?: string;
      ctaLabel?: string;
      ctaHref?: string;
      image?: ImageValue;
    }>();
  });

  it('`title` no admite undefined, y `subtitle` sí', () => {
    expectTypeOf<Content<'hero'>['title']>().toEqualTypeOf<string>();
    expectTypeOf<Content<'hero'>['subtitle']>().toEqualTypeOf<string | undefined>();
  });

  it('un campo con `default` NO es opcional (ADR-202)', () => {
    // `visible: s.boolean({ default: true })` siempre tiene valor tras el parseo.
    expectTypeOf<Content<'about'>>().toEqualTypeOf<{
      heading: string;
      visible: boolean;
      body?: RichTextDoc;
    }>();
    expectTypeOf<Content<'about'>['visible']>().toEqualTypeOf<boolean>();
  });

  it('el borrador tiene todo opcional', () => {
    expectTypeOf<Draft<'hero'>>().toEqualTypeOf<{
      title?: string;
      subtitle?: string;
      ctaLabel?: string;
      ctaHref?: string;
      image?: ImageValue;
    }>();
  });
});

describe('T-38-7 — colecciones', () => {
  it('infiere el elemento desde `schema`', () => {
    expectTypeOf<CollectionItem<'testimonials'>>().toEqualTypeOf<{
      author: string;
      quote: string;
      avatar?: ImageValue;
      rating?: number;
    }>();
  });

  it('las claves de singletons y colecciones son uniones literales', () => {
    expectTypeOf<SingletonKey>().toEqualTypeOf<'hero' | 'about' | 'seo'>();
    expectTypeOf<CollectionKey>().toEqualTypeOf<'testimonials' | 'faqs'>();
  });
});

describe('T-38-3 — una clave inexistente es error de compilación', () => {
  it('rechaza un singleton que no existe', () => {
    // @ts-expect-error 'noExiste' no es una clave de `singletons`.
    expectTypeOf<Content<'noExiste'>>().toBeObject();
  });

  it('rechaza usar una colección como si fuera singleton', () => {
    // @ts-expect-error 'testimonials' es una colección, no un singleton.
    expectTypeOf<Content<'testimonials'>>().toBeObject();
  });
});

describe('T-38-4 — select infiere la unión de sus valores', () => {
  const _config = defineConfig({
    siteName: 'Prueba',
    singletons: {
      layout: s.object({
        align: s.select({
          label: 'Alineación',
          options: [
            { value: 'izquierda', label: 'Izquierda' },
            { value: 'centro', label: 'Centro' },
          ],
          required: true,
        }),
      }),
    },
  });

  it('no se degrada a string', () => {
    type Align = (typeof _config)['singletons']['layout']['fields']['align']['__value'];
    expectTypeOf<NonNullable<Align>>().toEqualTypeOf<'izquierda' | 'centro'>();
    expectTypeOf<NonNullable<Align>>().not.toEqualTypeOf<string>();
  });
});

describe('los tipos de valor de cada campo no se colapsan entre sí', () => {
  it('link y color son cadenas distintas de text solo por su `kind`', () => {
    const _config = defineConfig({
      siteName: 'Prueba',
      singletons: {
        tema: s.object({
          fondo: s.color({ label: 'Fondo', required: true }),
          destino: s.link({ label: 'Destino', required: true }),
          nota: s.text({ label: 'Nota', required: true }),
          portada: s.image({ label: 'Portada', required: true }),
          cuerpo: s.richtext({ label: 'Cuerpo', required: true }),
          orden: s.number({ label: 'Orden', required: true }),
          activo: s.boolean({ label: 'Activo', required: true }),
        }),
      },
    });

    type Tema = (typeof _config)['singletons']['tema'];
    expectTypeOf<Tema['fields']['fondo']['kind']>().toEqualTypeOf<'color'>();
    expectTypeOf<Tema['fields']['destino']['kind']>().toEqualTypeOf<'link'>();
    expectTypeOf<Tema['fields']['nota']['kind']>().toEqualTypeOf<'text'>();
    expectTypeOf<NonNullable<Tema['fields']['portada']['__value']>>().toEqualTypeOf<ImageValue>();
    expectTypeOf<NonNullable<Tema['fields']['cuerpo']['__value']>>().toEqualTypeOf<RichTextDoc>();
    expectTypeOf<NonNullable<Tema['fields']['orden']['__value']>>().toEqualTypeOf<number>();
    expectTypeOf<NonNullable<Tema['fields']['activo']['__value']>>().toEqualTypeOf<boolean>();
  });
});
