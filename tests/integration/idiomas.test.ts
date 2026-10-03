import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET as GET_PUBLICO } from '@/app/api/content/[key]/route';
import {
  createItem,
  createPreviewToken,
  deleteItem,
  publish,
  publishAll,
  rellenarDesdeIdiomaPorDefecto,
  reorderItems,
  restoreRevision,
  revertDraft,
  saveDraft,
} from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { reiniciarAvisoParaTests } from '@/cms/core/aviso';
import { readCollection, readContent } from '@/cms/core/content';
import { listRevisions } from '@/cms/core/history';
import { previewContent } from '@/cms/core/preview-content';
import { emptyRichTextDoc } from '@/cms/core/richtext';
import { contentEntries, getDb, revisions, users } from '@/cms/db';
import { verifyToken } from '@/cms/security/tokens';
import { describeIntegration } from './env';

/**
 * Spec 17, idiomas: T-ID-7 a T-ID-38, lo que se comprueba contra Postgres.
 *
 * `cms.config.ts` declara `es` (por defecto) y `en`. En la base, el español es `locale = ''` y el
 * inglés `locale = 'en'` (ADR-1100). Los casos escriben las filas a mano para poder decir
 * exactamente qué había en cada idioma antes de la acción, y comprueban **el otro idioma**
 * después: lo que esta fase promete no es que el inglés cambie, es que el español no.
 */

const after = vi.hoisted(() => vi.fn((tarea: () => Promise<void>) => tarea()));
vi.mock('next/server', () => ({ after }));

vi.mock('next/cache', async () => {
  const actual = await vi.importActual<typeof import('next/cache')>('next/cache');
  return { ...actual, revalidateTag: vi.fn() };
});

const ES = '';
const EN = 'en';

async function crearEditor() {
  const [user] = await getDb()
    .insert(users)
    .values({ email: 'editora@ejemplo.com', name: 'Editora', passwordHash: 'x', role: 'editor' })
    .returning();
  return user!;
}

async function crearEntrada(opciones: {
  key: string;
  type?: string;
  locale: string;
  draft: Record<string, unknown>;
  published?: Record<string, unknown> | null;
  status?: 'draft' | 'published' | 'changed';
  version?: number;
  sortOrder?: number;
}) {
  await getDb()
    .insert(contentEntries)
    .values({
      key: opciones.key,
      locale: opciones.locale,
      type: opciones.type ?? opciones.key,
      draft: opciones.draft,
      published: opciones.published ?? null,
      status: opciones.status ?? 'changed',
      version: opciones.version ?? 0,
      sortOrder: opciones.sortOrder ?? 0,
    });
}

async function leer(key: string, locale: string) {
  const [fila] = await getDb()
    .select()
    .from(contentEntries)
    .where(and(eq(contentEntries.key, key), eq(contentEntries.locale, locale)));
  return fila;
}

async function filasDe(type: string, locale: string) {
  return getDb()
    .select()
    .from(contentEntries)
    .where(and(eq(contentEntries.type, type), eq(contentEntries.locale, locale)));
}

const FAQ = (pregunta: string) => ({ question: pregunta, answer: emptyRichTextDoc() });

describeIntegration('idiomas: cada uno va por su lado', () => {
  beforeEach(async () => {
    resetBucketsForTests();
    after.mockClear();
    const editora = await crearEditor();
    setSessionProviderForTests(() =>
      Promise.resolve({ userId: editora.id, email: editora.email, role: 'editor' as const })
    );
  });

  afterEach(() => {
    setSessionProviderForTests(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    reiniciarAvisoParaTests();
  });

  // ── La base de datos ───────────────────────────────────────────────────────────────────

  it('T-ID-7: `hero` existe una vez por idioma, y dos en el mismo idioma chocan', async () => {
    await crearEntrada({ key: 'hero', locale: ES, draft: {} });
    await crearEntrada({ key: 'hero', locale: EN, draft: {} });

    await expect(crearEntrada({ key: 'hero', locale: EN, draft: {} })).rejects.toThrow();
  });

  it('T-ID-8: una fila sin `locale` es del idioma por defecto', async () => {
    // Es lo que hacen todas las inserciones de antes de esta fase, y lo que deja la migración en
    // las filas que ya existían.
    await getDb().insert(contentEntries).values({ key: 'hero', type: 'hero', draft: {} });

    expect((await leer('hero', ES))?.locale).toBe(ES);
  });

  // ── Cada idioma va por su lado ─────────────────────────────────────────────────────────

  it('T-ID-9: guardar en inglés no toca el borrador ni la versión del español', async () => {
    await crearEntrada({ key: 'hero', locale: ES, draft: { title: 'Hola' }, version: 4 });
    await crearEntrada({ key: 'hero', locale: EN, draft: { title: 'Hi' }, version: 0 });

    const resultado = await saveDraft({
      key: 'hero',
      idioma: 'en',
      data: { title: 'Hello' },
      version: 0,
    });

    expect(resultado.ok).toBe(true);
    expect((await leer('hero', EN))?.draft).toEqual({ title: 'Hello' });
    expect((await leer('hero', ES))?.draft).toEqual({ title: 'Hola' });
    expect((await leer('hero', ES))?.version).toBe(4);
  });

  it('T-ID-10: publicar en inglés deja lo publicado en español exactamente como estaba', async () => {
    await crearEntrada({
      key: 'hero',
      locale: ES,
      draft: { title: 'Borrador español' },
      published: { title: 'Publicado español' },
      status: 'changed',
    });
    await crearEntrada({ key: 'hero', locale: EN, draft: { title: 'English' } });

    expect((await publish({ key: 'hero', idioma: 'en', version: 0 })).ok).toBe(true);

    const espanol = await leer('hero', ES);
    expect(espanol?.published).toEqual({ title: 'Publicado español' });
    expect(espanol?.status).toBe('changed');
    expect((await leer('hero', EN))?.published).toEqual({ title: 'English' });
  });

  it('T-ID-11: las revisiones llevan su idioma y el historial de uno no enseña las del otro', async () => {
    await crearEntrada({
      key: 'hero',
      locale: EN,
      draft: { title: 'Second' },
      published: { title: 'First' },
    });

    expect((await publish({ key: 'hero', idioma: 'en', version: 0 })).ok).toBe(true);

    const guardadas = await getDb().select().from(revisions);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]?.locale).toBe(EN);

    expect(await listRevisions('hero', 'hero', 'en')).toHaveLength(1);
    expect(await listRevisions('hero', 'hero', 'es')).toHaveLength(0);
  });

  it('T-ID-12: deshacer y restaurar en inglés solo tocan el inglés', async () => {
    await crearEntrada({
      key: 'hero',
      locale: ES,
      draft: { title: 'Borrador español' },
      published: { title: 'Publicado español' },
    });
    await crearEntrada({
      key: 'hero',
      locale: EN,
      draft: { title: 'Draft' },
      published: { title: 'Published' },
    });

    expect((await revertDraft({ key: 'hero', idioma: 'en' })).ok).toBe(true);
    expect((await leer('hero', EN))?.draft).toEqual({ title: 'Published' });
    expect((await leer('hero', ES))?.draft).toEqual({ title: 'Borrador español' });

    // Una revisión del español no se puede restaurar en el inglés, aunque la clave sea la misma.
    const [delEspanol] = await getDb()
      .insert(revisions)
      .values({ entryKey: 'hero', locale: ES, data: { title: 'Viejo español' } })
      .returning();

    const resultado = await restoreRevision({
      key: 'hero',
      idioma: 'en',
      revisionId: delEspanol!.id,
    });

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.code).toBe('NOT_FOUND');
    expect((await leer('hero', EN))?.draft).toEqual({ title: 'Published' });
  });

  it('T-ID-13: crear en inglés cuenta el orden solo en la lista inglesa', async () => {
    for (const posicion of [0, 1, 2]) {
      await crearEntrada({
        key: `faqs.es-${String(posicion)}`,
        type: 'faqs',
        locale: ES,
        draft: FAQ(`¿${String(posicion)}?`),
        sortOrder: posicion,
      });
    }

    const resultado = await createItem({ collection: 'faqs', idioma: 'en' });

    expect(resultado.ok).toBe(true);
    expect(resultado.ok && resultado.data.sortOrder).toBe(0);
    expect(await filasDe('faqs', EN)).toHaveLength(1);
    expect(await filasDe('faqs', ES)).toHaveLength(3);
  });

  it('T-ID-14: reordenar la lista inglesa con una clave de la española es NOT_FOUND', async () => {
    await crearEntrada({ key: 'faqs.es', type: 'faqs', locale: ES, draft: FAQ('¿?') });
    await crearEntrada({ key: 'faqs.en', type: 'faqs', locale: EN, draft: FAQ('?') });

    const resultado = await reorderItems({
      collection: 'faqs',
      idioma: 'en',
      orderedKeys: ['faqs.es'],
    });

    expect(!resultado.ok && resultado.code).toBe('NOT_FOUND');
  });

  it('T-ID-15: borrar desde la lista inglesa no alcanza un elemento de la española', async () => {
    // `deleteItem` es de administración.
    const [admin] = await getDb()
      .insert(users)
      .values({ email: 'admin@ejemplo.com', name: 'Admin', passwordHash: 'x', role: 'admin' })
      .returning();
    setSessionProviderForTests(() =>
      Promise.resolve({ userId: admin!.id, email: admin!.email, role: 'admin' as const })
    );

    await crearEntrada({ key: 'faqs.es', type: 'faqs', locale: ES, draft: FAQ('¿?') });

    const resultado = await deleteItem({ key: 'faqs.es', idioma: 'en' });

    expect(!resultado.ok && resultado.code).toBe('NOT_FOUND');
    expect(await leer('faqs.es', ES)).toBeDefined();
  });

  it('T-ID-16: «Publicar todo» en inglés no publica lo pendiente en español', async () => {
    await crearEntrada({ key: 'hero', locale: ES, draft: { title: 'Pendiente español' } });
    await crearEntrada({ key: 'hero', locale: EN, draft: { title: 'Pending English' } });

    const resultado = await publishAll({ idioma: 'en' });

    expect(resultado.ok && resultado.data.published).toEqual(['hero']);
    expect((await leer('hero', EN))?.published).toEqual({ title: 'Pending English' });
    expect((await leer('hero', ES))?.published).toBeNull();
    expect((await leer('hero', ES))?.status).toBe('changed');
  });

  it('T-ID-17: un idioma que no está declarado es NOT_FOUND y no escribe nada', async () => {
    await crearEntrada({ key: 'hero', locale: ES, draft: { title: 'Hola' } });
    await crearEntrada({ key: 'faqs.es', type: 'faqs', locale: ES, draft: FAQ('¿?') });

    const resultados = [
      await saveDraft({ key: 'hero', idioma: 'fr', data: { title: 'Bonjour' }, version: 0 }),
      await publish({ key: 'hero', idioma: 'fr', version: 0 }),
      await revertDraft({ key: 'hero', idioma: 'fr' }),
      await createItem({ collection: 'faqs', idioma: 'fr' }),
      await reorderItems({ collection: 'faqs', idioma: 'fr', orderedKeys: ['faqs.es'] }),
      await publishAll({ idioma: 'fr' }),
      await rellenarDesdeIdiomaPorDefecto({ key: 'hero', idioma: 'fr', version: 0 }),
      await createPreviewToken({ key: 'hero', idioma: 'fr' }),
    ];

    for (const resultado of resultados) {
      expect(!resultado.ok && resultado.code).toBe('NOT_FOUND');
    }

    // Nada nuevo en ningún idioma: ni una fila en `fr`, ni una lista francesa empezada.
    const todas = await getDb().select().from(contentEntries);
    expect(todas.map((fila) => fila.locale)).toEqual([ES, ES]);
    expect((await leer('hero', ES))?.draft).toEqual({ title: 'Hola' });
  });

  it('T-ID-18: sin idioma, todo va al de por defecto, como antes de esta fase', async () => {
    await crearEntrada({ key: 'hero', locale: ES, draft: {} });
    await crearEntrada({ key: 'hero', locale: EN, draft: { title: 'Hi' } });

    expect((await saveDraft({ key: 'hero', data: { title: 'Hola' }, version: 0 })).ok).toBe(true);
    expect((await createItem({ collection: 'faqs' })).ok).toBe(true);

    expect((await leer('hero', ES))?.draft).toEqual({ title: 'Hola' });
    expect((await leer('hero', EN))?.draft).toEqual({ title: 'Hi' });
    expect(await filasDe('faqs', ES)).toHaveLength(1);
  });

  // ── Rellenar desde el idioma por defecto ───────────────────────────────────────────────

  it('T-ID-19 y T-ID-20: copia el borrador español al inglés, como cambio y sin publicar', async () => {
    const imagen = { mediaId: 'm1', url: 'https://x.example/a.webp', alt: 'Fachada' };
    await crearEntrada({
      key: 'hero',
      locale: ES,
      draft: { title: 'Borrador español', image: imagen },
      published: { title: 'Publicado español' },
    });
    await crearEntrada({
      key: 'hero',
      locale: EN,
      draft: { title: 'Old draft' },
      published: { title: 'Published English' },
      status: 'published',
      version: 3,
    });

    const resultado = await rellenarDesdeIdiomaPorDefecto({
      key: 'hero',
      idioma: 'en',
      version: 3,
    });

    expect(resultado.ok && resultado.data.version).toBe(4);
    const ingles = await leer('hero', EN);
    expect(ingles?.draft).toEqual({ title: 'Borrador español', image: imagen });
    expect(ingles?.status).toBe('changed');
    // T-ID-20: lo publicado en inglés no se toca.
    expect(ingles?.published).toEqual({ title: 'Published English' });
  });

  it('T-ID-21b: sin fila en el idioma destino es NOT_FOUND, no un conflicto inventado', async () => {
    // Nadie ha abierto todavía el editor inglés, que es quien crea la fila. Un `VERSION_CONFLICT`
    // aquí haría decir al panel que otra persona guardó cambios, y no hay nadie más.
    await crearEntrada({ key: 'hero', locale: ES, draft: { title: 'Español' } });

    const resultado = await rellenarDesdeIdiomaPorDefecto({
      key: 'hero',
      idioma: 'en',
      version: 0,
    });

    expect(!resultado.ok && resultado.code).toBe('NOT_FOUND');
    expect(await leer('hero', EN)).toBeUndefined();
  });

  it('T-ID-21: con una versión vieja no copia nada', async () => {
    await crearEntrada({ key: 'hero', locale: ES, draft: { title: 'Español' } });
    await crearEntrada({ key: 'hero', locale: EN, draft: { title: 'Mine' }, version: 5 });

    const resultado = await rellenarDesdeIdiomaPorDefecto({
      key: 'hero',
      idioma: 'en',
      version: 4,
    });

    expect(!resultado.ok && resultado.code).toBe('VERSION_CONFLICT');
    expect((await leer('hero', EN))?.draft).toEqual({ title: 'Mine' });
  });

  it('T-ID-22: en el idioma por defecto o en un elemento de lista es CONFLICT', async () => {
    await crearEntrada({ key: 'hero', locale: ES, draft: { title: 'Español' } });
    await crearEntrada({ key: 'faqs.en', type: 'faqs', locale: EN, draft: FAQ('?') });

    const enElDeDefecto = await rellenarDesdeIdiomaPorDefecto({
      key: 'hero',
      idioma: 'es',
      version: 0,
    });
    const enUnaLista = await rellenarDesdeIdiomaPorDefecto({
      key: 'faqs.en',
      idioma: 'en',
      version: 0,
    });

    expect(!enElDeDefecto.ok && enElDeDefecto.code).toBe('CONFLICT');
    expect(!enUnaLista.ok && enUnaLista.code).toBe('CONFLICT');
  });

  // ── La lectura y la API ────────────────────────────────────────────────────────────────

  it('T-ID-23: leer en inglés no cae al español aunque el inglés no tenga nada publicado', async () => {
    await crearEntrada({
      key: 'hero',
      locale: ES,
      draft: {},
      published: { title: 'Título español' },
    });

    expect((await readContent('hero', 'es')).title).toBe('Título español');
    // `title` es requerido: sin nada publicado sale vacío, que es lo que dice ADR-404. **No** el
    // español (ADR-1101).
    expect((await readContent('hero', 'en')).title).toBe('');
  });

  it('T-ID-24: la lista inglesa solo trae lo suyo, en su orden', async () => {
    await crearEntrada({
      key: 'faqs.es',
      type: 'faqs',
      locale: ES,
      draft: {},
      published: FAQ('¿Español?'),
    });
    await crearEntrada({
      key: 'faqs.en-b',
      type: 'faqs',
      locale: EN,
      draft: {},
      published: FAQ('Second?'),
      sortOrder: 1,
    });
    await crearEntrada({
      key: 'faqs.en-a',
      type: 'faqs',
      locale: EN,
      draft: {},
      published: FAQ('First?'),
      sortOrder: 0,
    });

    const ingles = await readCollection('faqs', 'en');

    expect(ingles.map((faq) => faq.question)).toEqual(['First?', 'Second?']);
  });

  it('T-ID-26 y T-ID-27: la API sirve el idioma pedido, y sin pedirlo dice cuál ha dado', async () => {
    await crearEntrada({ key: 'hero', locale: ES, draft: {}, published: { title: 'Hola' } });
    await crearEntrada({ key: 'hero', locale: EN, draft: {}, published: { title: 'Hello' } });

    const params = { params: Promise.resolve({ key: 'hero' }) };

    const ingles = await GET_PUBLICO(
      new Request('https://cms.example/api/content/hero?idioma=en'),
      params
    );
    expect(await ingles.json()).toMatchObject({
      key: 'hero',
      idioma: 'en',
      data: { title: 'Hello' },
    });

    const sinPedir = await GET_PUBLICO(new Request('https://cms.example/api/content/hero'), {
      params: Promise.resolve({ key: 'hero' }),
    });
    expect(await sinPedir.json()).toMatchObject({ idioma: 'es', data: { title: 'Hola' } });
  });

  it('T-ID-28: un idioma desconocido es 400, y una clave desconocida sigue siendo 404', async () => {
    const idiomaMalo = await GET_PUBLICO(
      new Request('https://cms.example/api/content/hero?idioma=fr'),
      { params: Promise.resolve({ key: 'hero' }) }
    );
    expect(idiomaMalo.status).toBe(400);
    expect(await idiomaMalo.json()).toEqual({ error: 'idioma_desconocido' });

    // Con idioma inventado **y** clave inventada, manda la clave: lo contrario diría a quien
    // tantea qué claves existen.
    const claveMala = await GET_PUBLICO(
      new Request('https://cms.example/api/content/nada?idioma=fr'),
      { params: Promise.resolve({ key: 'nada' }) }
    );
    expect(claveMala.status).toBe(404);
  });

  it('T-ID-29: leer en un idioma no declarado lanza', async () => {
    await expect(readContent('hero', 'fr')).rejects.toThrow(/fr/);
  });

  // ── La vista previa y el aviso ─────────────────────────────────────────────────────────

  it('T-ID-35: la vista previa en inglés usa el borrador inglés y lo publicado inglés del resto', async () => {
    await crearEntrada({
      key: 'hero',
      locale: ES,
      draft: { title: 'Borrador ES' },
      published: { title: 'Publicado ES' },
    });
    await crearEntrada({
      key: 'hero',
      locale: EN,
      draft: { title: 'Draft EN' },
      published: { title: 'Published EN' },
    });
    await crearEntrada({
      key: 'about',
      locale: ES,
      draft: {},
      published: { heading: 'Sobre ES', visible: true },
    });
    await crearEntrada({
      key: 'about',
      locale: EN,
      draft: {},
      published: { heading: 'About EN', visible: true },
    });

    const contenido = await previewContent('hero', 'en');

    expect(contenido['hero']).toMatchObject({ title: 'Draft EN' });
    expect(contenido['about']).toMatchObject({ heading: 'About EN' });
  });

  it('T-ID-35 y T-ID-36: el idioma va firmado en el token, y el de por defecto no se añade', async () => {
    const ingles = await createPreviewToken({ key: 'hero', idioma: 'en' });
    const espanol = await createPreviewToken({ key: 'hero', idioma: 'es' });
    const sinIdioma = await createPreviewToken({ key: 'hero' });

    const datos = (resultado: typeof ingles) => {
      if (!resultado.ok) throw new Error('no hay token');
      const verificado = verifyToken('preview', resultado.data.token);
      if (!verificado.ok) throw new Error('token inválido');
      return verificado.data;
    };

    expect(datos(ingles)).toEqual({ key: 'hero', idioma: 'en' });
    // El token del español es exactamente el de antes de esta fase: así un enlace emitido ayer y
    // uno de hoy se leen igual.
    expect(datos(espanol)).toEqual({ key: 'hero' });
    expect(datos(sinIdioma)).toEqual({ key: 'hero' });
  });

  it('T-ID-37 y T-ID-38: el aviso lleva el idioma, y los tags son los de siempre', async () => {
    vi.stubEnv('WEBHOOK_URL', 'https://mi-web.com/api/unocms');
    vi.stubEnv('WEBHOOK_SECRET', 'un-secreto-de-avisos-con-mas-de-32-caracteres');
    reiniciarAvisoParaTests();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await crearEntrada({ key: 'hero', locale: EN, draft: { title: 'Hello' } });
    await crearEntrada({ key: 'faqs.en', type: 'faqs', locale: EN, draft: FAQ('?') });

    expect((await publish({ key: 'hero', idioma: 'en', version: 0 })).ok).toBe(true);
    expect(
      (await reorderItems({ collection: 'faqs', idioma: 'en', orderedKeys: ['faqs.en'] })).ok
    ).toBe(true);
    await Promise.all(after.mock.results.map((resultado) => resultado.value));

    const sobres = vi
      .mocked(globalThis.fetch)
      .mock.calls.map((llamada) => JSON.parse((llamada[1] as RequestInit).body as string));

    expect(sobres[0]).toMatchObject({
      evento: 'content.published',
      claves: [{ key: 'hero', tipo: 'singleton', idioma: 'en' }],
      tags: ['content:hero'],
    });
    expect(sobres[1]).toMatchObject({
      evento: 'content.reordered',
      claves: [{ key: 'faqs', tipo: 'coleccion', idioma: 'en' }],
      tags: ['content:faqs'],
    });
  });
});
