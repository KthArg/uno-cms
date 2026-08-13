import { describe, expect, it } from 'vitest';
import appConfig from '@/cms.config';
import { s } from '@/cms/core/config';
import { draftSchema, strictSchema } from '@/cms/core/schema-gen';

/**
 * T-39-1 a T-39-12: los dos esquemas Zod que se derivan de `cms.config.ts` (SPEC §5.1).
 */

const hero = appConfig.singletons.hero;

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message ?? '';
}

describe('T-39-1 / T-39-2 — esquema laxo: guarda borradores a medias, no basura', () => {
  it('acepta un objeto vacío', () => {
    expect(draftSchema(hero).safeParse({}).success).toBe(true);
  });

  it('acepta un borrador parcial', () => {
    expect(draftSchema(hero).safeParse({ title: 'A medias' }).success).toBe(true);
  });

  it('rechaza el tipo equivocado aunque sea un borrador', () => {
    expect(draftSchema(hero).safeParse({ title: 42 }).success).toBe(false);
  });

  it('rechaza claves que no están en la config', () => {
    // `strict()` y no `passthrough()`: una clave desconocida se guardaría en el JSONB y
    // ningún formulario podría volver a editarla.
    expect(draftSchema(hero).safeParse({ titulo: 'typo' }).success).toBe(false);
  });
});

describe('T-39-3 / T-39-4 — esquema estricto: la puerta de publicación', () => {
  it('rechaza un requerido ausente', () => {
    const result = strictSchema(hero).safeParse({});
    expect(result.success).toBe(false);
  });

  it('rechaza un requerido en blanco igual que ausente', () => {
    const result = strictSchema(hero).safeParse({ title: '   ' });
    expect(result.success).toBe(false);
  });

  it('el mensaje nombra el campo como lo ve el editor, no por su clave', () => {
    // SPEC §9: "Falta el Título principal en Portada". El editor no sabe qué es `title`.
    const result = strictSchema(hero).safeParse({ title: '' });
    expect(firstMessage(result)).toContain('Título principal');
  });

  it('acepta cuando el requerido está relleno', () => {
    expect(strictSchema(hero).safeParse({ title: 'Bienvenido' }).success).toBe(true);
  });
});

describe('ADR-202 — `false` y `0` cuentan como rellenos', () => {
  const flags = s.object({
    visible: s.boolean({ label: 'Visible', required: true }),
    puntuacion: s.number({ label: 'Puntuación', required: true }),
  });

  it('un booleano obligatorio se publica en false', () => {
    // Con una comprobación de veracidad genérica, esto fallaría y el campo sería
    // imposible de publicar en `false`. Es el bug que ADR-202 existe para prevenir.
    const result = strictSchema(flags).safeParse({ visible: false, puntuacion: 5 });
    expect(result.success).toBe(true);
  });

  it('un número obligatorio se publica en 0', () => {
    const result = strictSchema(flags).safeParse({ visible: true, puntuacion: 0 });
    expect(result.success).toBe(true);
  });

  it('pero ausentes siguen fallando', () => {
    expect(strictSchema(flags).safeParse({}).success).toBe(false);
  });
});

describe('T-39-5 — los límites se aplican en ambos esquemas', () => {
  it('max corta en los dos modos', () => {
    const largo = { title: 'x'.repeat(121) };
    expect(draftSchema(hero).safeParse(largo).success).toBe(false);
    expect(strictSchema(hero).safeParse(largo).success).toBe(false);
  });

  it('justo en el límite pasa', () => {
    expect(strictSchema(hero).safeParse({ title: 'x'.repeat(120) }).success).toBe(true);
  });
});

describe('T-39-6 — link rechaza destinos peligrosos desde el esquema', () => {
  it('javascript: no pasa ni en borrador', () => {
    // La mitigación vive en el esquema y no en el componente, para que ninguna ruta de
    // escritura pueda saltársela (SPEC §7.1).
    expect(draftSchema(hero).safeParse({ ctaHref: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('una ruta interna sí', () => {
    expect(draftSchema(hero).safeParse({ ctaHref: '/contacto' }).success).toBe(true);
  });
});

describe('T-39-8 — image exige alt salvo que sea decorativa', () => {
  const conAlt = s.object({ foto: s.image({ label: 'Foto' }) });
  const decorativa = s.object({ adorno: s.image({ label: 'Adorno', decorative: true }) });
  const valor = { mediaId: 'm1', url: 'https://cdn/x.png', alt: '' };

  it('rechaza alt vacío', () => {
    const result = draftSchema(conAlt).safeParse({ foto: valor });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toContain('Describe la imagen');
  });

  it('lo acepta si la imagen es decorativa', () => {
    expect(draftSchema(decorativa).safeParse({ adorno: valor }).success).toBe(true);
  });

  it('acepta alt relleno', () => {
    expect(
      draftSchema(conAlt).safeParse({ foto: { ...valor, alt: 'Equipo trabajando' } }).success
    ).toBe(true);
  });
});

describe('T-39-9 / T-39-12 — color y number', () => {
  const tema = s.object({
    fondo: s.color({ label: 'Fondo' }),
    orden: s.number({ label: 'Orden', integer: true, min: 1, max: 5 }),
  });

  it.each(['#fff', '#ffffff', '#ffffffff'])('acepta %s', (valor) => {
    expect(draftSchema(tema).safeParse({ fondo: valor }).success).toBe(true);
  });

  it.each(['red', 'rgb(1,2,3)', '#ff', 'fff'])('rechaza %s', (valor) => {
    expect(draftSchema(tema).safeParse({ fondo: valor }).success).toBe(false);
  });

  it('rechaza un decimal donde se pidió entero', () => {
    expect(draftSchema(tema).safeParse({ orden: 1.5 }).success).toBe(false);
  });

  it('respeta min y max', () => {
    expect(draftSchema(tema).safeParse({ orden: 0 }).success).toBe(false);
    expect(draftSchema(tema).safeParse({ orden: 6 }).success).toBe(false);
    expect(draftSchema(tema).safeParse({ orden: 3 }).success).toBe(true);
  });
});

describe('T-39-10 — richtext solo admite la allowlist de SPEC §6.3', () => {
  const bloque = s.object({ cuerpo: s.richtext({ label: 'Cuerpo' }) });
  const parse = (doc: unknown) => draftSchema(bloque).safeParse({ cuerpo: doc });

  it('acepta un párrafo con negrita', () => {
    expect(
      parse({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hola', marks: [{ type: 'bold' }] }],
          },
        ],
      }).success
    ).toBe(true);
  });

  it('rechaza un nodo script', () => {
    expect(parse({ type: 'doc', content: [{ type: 'script', text: 'alert(1)' }] }).success).toBe(
      false
    );
  });

  it('rechaza un nodo no permitido anidado en profundidad', () => {
    // Un filtro que solo mirase el primer nivel dejaría pasar esto.
    expect(
      parse({
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [{ type: 'paragraph', content: [{ type: 'iframe', text: 'x' }] }],
          },
        ],
      }).success
    ).toBe(false);
  });

  it('rechaza una marca no permitida', () => {
    expect(
      parse({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'script' }] }],
          },
        ],
      }).success
    ).toBe(false);
  });

  it('rechaza una marca link con destino peligroso', () => {
    expect(
      parse({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'pincha',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      }).success
    ).toBe(false);
  });

  it('acepta una marca link con destino permitido', () => {
    expect(
      parse({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'pincha',
                marks: [{ type: 'link', attrs: { href: 'https://ejemplo.com' } }],
              },
            ],
          },
        ],
      }).success
    ).toBe(true);
  });

  it('rechaza un h1, porque SPEC §6.3 solo permite h2 a h4', () => {
    expect(
      parse({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [] }] })
        .success
    ).toBe(false);
    expect(
      parse({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [] }] })
        .success
    ).toBe(true);
  });
});

describe('T-39-11 — los defaults se aplican al parsear', () => {
  it('un campo ausente con default sale con su valor', () => {
    const about = appConfig.singletons.about;
    const result = draftSchema(about).safeParse({});

    expect(result.success).toBe(true);
    expect(result.success && result.data['visible']).toBe(true);
  });

  it('un valor explícito gana al default', () => {
    const about = appConfig.singletons.about;
    const result = draftSchema(about).safeParse({ visible: false });

    expect(result.success && result.data['visible']).toBe(false);
  });
});
