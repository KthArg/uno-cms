import { afterEach, expect, it, vi } from 'vitest';
import {
  getCollection,
  getContent,
  getDraft,
  readCollection,
  readContent,
} from '@/cms/core/content';
import { contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-76-1 a T-76-6: la lectura de contenido (SPEC §5.2, ADR-404, ADR-405).
 *
 * Van contra `readContent`/`readCollection` y no contra los envoltorios cacheados porque
 * `unstable_cache` exige el contexto de petición de Next y lanza fuera de él. Esa misma
 * limitación se aprovecha en T-76-6 para demostrar cuál está cacheado y cuál no.
 */

const HERO_PUBLICADO = {
  title: 'Lo publicado',
  subtitle: 'Visible para todo el mundo',
};

async function insertarHero(valores: {
  draft?: Record<string, unknown>;
  published?: Record<string, unknown> | null;
}) {
  await getDb()
    .insert(contentEntries)
    .values({
      key: 'hero',
      type: 'hero',
      draft: valores.draft ?? {},
      published: valores.published ?? null,
      status: 'draft',
    });
}

async function insertarTestimonio(opciones: {
  key: string;
  sortOrder: number;
  published: Record<string, unknown> | null;
}) {
  await getDb().insert(contentEntries).values({
    key: opciones.key,
    type: 'testimonials',
    draft: {},
    published: opciones.published,
    sortOrder: opciones.sortOrder,
    status: 'draft',
  });
}

describeIntegration('lectura de contenido', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T-76-1: devuelve lo publicado, no el borrador', async () => {
    await insertarHero({
      draft: { title: 'Borrador a medias que nadie debe ver' },
      published: HERO_PUBLICADO,
    });

    const content = await readContent('hero');

    expect(content.title).toBe('Lo publicado');
    // Lo importante no es que el título sea correcto, sino que el borrador **no se asoma**:
    // es la razón de que `published` sea una columna aparte (SPEC §4).
    expect(JSON.stringify(content)).not.toContain('Borrador');
  });

  it('T-76-2: sin publicar devuelve valores vacíos y por defecto, no un error', async () => {
    await insertarHero({ draft: { title: 'algo escrito' }, published: null });

    // La letra de SPEC §5.2 (`strictSchema(...).parse(...)`) lanzaría aquí, porque
    // `hero.title` es requerido y no tiene default. Una landing recién desplegada devolvería
    // 500 hasta la primera publicación (issue #86, ADR-404).
    const content = await readContent('hero');

    expect(content.title).toBe('');
    expect(content.subtitle).toBeUndefined();
  });

  it('T-76-2: una entrada que ni siquiera existe tampoco es un error', async () => {
    const content = await readContent('hero');

    expect(content.title).toBe('');
  });

  it('T-76-2: los campos con default traen su default, no el vacío', async () => {
    // `about.visible` es `default: true`. Devolver `false` escondería la sección entera en
    // una landing sin publicar, que es exactamente lo contrario de lo que dice la config.
    const about = await readContent('about');

    expect(about.visible).toBe(true);
  });

  it('T-76-3: la colección ordena por sortOrder y omite lo no publicado', async () => {
    await insertarTestimonio({
      key: 'testimonials.c',
      sortOrder: 2,
      published: { author: 'Carmen', quote: 'Tercera' },
    });
    await insertarTestimonio({
      key: 'testimonials.a',
      sortOrder: 0,
      published: { author: 'Ana', quote: 'Primera' },
    });
    await insertarTestimonio({ key: 'testimonials.b', sortOrder: 1, published: null });

    const items = await readCollection('testimonials');

    expect(items.map((item) => item.author)).toEqual(['Ana', 'Carmen']);
  });

  it('T-76-3: el orden no depende del orden de inserción', async () => {
    // Sin `ORDER BY`, Postgres suele devolver las filas en orden de inserción y el test
    // pasaría igual con la implementación rota. Insertando al revés, deja de pasar.
    await insertarTestimonio({
      key: 'testimonials.z',
      sortOrder: 9,
      published: { author: 'Zoe', quote: 'La última' },
    });
    await insertarTestimonio({
      key: 'testimonials.a',
      sortOrder: 1,
      published: { author: 'Ana', quote: 'La primera' },
    });

    const items = await readCollection('testimonials');

    expect(items.map((item) => item.author)).toEqual(['Ana', 'Zoe']);
  });

  it('T-76-5: un campo publicado que ya no pasa su esquema no tumba la lectura', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // El caso real: alguien cambia `cms.config.ts` y lo que había publicado deja de encajar.
    await insertarHero({
      published: { title: 'Este título sí vale', subtitle: 12345 },
    });

    const content = await readContent('hero');

    // Se sustituye **solo** el campo roto. Descartar el objeto entero dejaría la sección en
    // blanco por un campo secundario.
    expect(content.title).toBe('Este título sí vale');
    expect(content.subtitle).toBeUndefined();
    // Y queda en el log: sustituir en silencio deja una landing mostrando defaults sin que
    // nadie sepa por qué.
    expect(spy).toHaveBeenCalled();
  });

  it('T-76-5: un `published` que no es ni un objeto se trata como vacío', async () => {
    await insertarHero({ published: ['esto', 'no', 'es', 'un', 'objeto'] as never });

    await expect(readContent('hero')).resolves.toMatchObject({ title: '' });
  });

  it('un enlace inseguro publicado no llega a la landing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Defensa en profundidad: `saveDraft` y `publish` ya rechazan esto (SPEC §7.1), pero si
    // algo escribiera en la tabla por otra vía, la lectura no debe servirlo.
    await insertarHero({
      published: { title: 'Hola', ctaHref: 'javascript:alert(1)' },
    });

    const content = await readContent('hero');

    expect(content.ctaHref).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it('getDraft devuelve el borrador, no lo publicado', async () => {
    await insertarHero({
      draft: { title: 'Lo que estoy escribiendo' },
      published: HERO_PUBLICADO,
    });

    const draft = await getDraft('hero');

    expect(draft.title).toBe('Lo que estoy escribiendo');
  });

  it('T-76-6: getContent está cacheado y getDraft no', async () => {
    await insertarHero({ published: HERO_PUBLICADO });

    // `unstable_cache` necesita el contexto de petición de Next y lanza fuera de él. Esa
    // limitación sirve aquí de aserto: si `getContent` dejara de estar cacheado, esto pasaría
    // a resolver y el test caería (ADR-405).
    await expect(getContent('hero')).rejects.toThrow(/incrementalCache/);
    await expect(getCollection('testimonials')).rejects.toThrow(/incrementalCache/);

    // Y el borrador, al contrario: cachearlo haría que el editor viese su propio texto con
    // retraso, que es la forma más rápida de que deje de fiarse del CMS.
    await expect(getDraft('hero')).resolves.toBeDefined();
  });
});
