import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deleteItem, publish, publishAll, reorderItems } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { contentEntries, getDb, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-A-13, T-A-14, T-A-15, T-A-19 y T-A-25: qué avisa cada acción de contenido (issue #283).
 *
 * ## Por qué esto es de integración y no unitario
 *
 * Porque lo que hay que comprobar no es que `avisar` componga bien —eso ya está en
 * `tests/unit/aviso-al-publicar.test.ts`— sino **cuándo lo llaman las actions**, y eso depende
 * del estado de la fila: `publish` no avisa si el borrador y lo publicado ya coincidían, y esa
 * condición sale de la base de datos. Con la fila simulada, el caso se prueba a sí mismo.
 *
 * Se sustituyen dos cosas y solo dos: `after`, que necesita el contexto de una petición de Next,
 * y `fetch`, para no salir a la red. Todo lo demás —la transacción, la validación, la
 * auditoría— es de verdad.
 */

const after = vi.hoisted(() => vi.fn((tarea: () => Promise<void>) => tarea()));
vi.mock('next/server', () => ({ after }));

vi.mock('next/cache', async () => {
  const actual = await vi.importActual<typeof import('next/cache')>('next/cache');
  return { ...actual, revalidateTag: vi.fn() };
});

const { revalidateTag } = await import('next/cache');

const HERO_COMPLETO = { title: 'Título publicable' };
const TESTIMONIO = { quote: 'Muy bien', author: 'Alguien' };

/** Los sobres que salieron, ya deserializados. Es lo que estos casos miran. */
function sobresEnviados(): { evento: string; tags: string[]; claves: { key: string }[] }[] {
  return vi
    .mocked(globalThis.fetch)
    .mock.calls.map((llamada) => JSON.parse((llamada[1] as RequestInit).body as string));
}

async function crearEditor() {
  const [user] = await getDb()
    .insert(users)
    .values({
      email: 'editora@ejemplo.com',
      name: 'Editora',
      passwordHash: 'no-se-usa',
      role: 'editor',
    })
    .returning();
  return user!;
}

async function crearEntrada(opciones: {
  key: string;
  type: string;
  draft: Record<string, unknown>;
  published?: Record<string, unknown> | null;
  status?: 'draft' | 'published' | 'changed';
}) {
  await getDb()
    .insert(contentEntries)
    .values({
      key: opciones.key,
      type: opciones.type,
      draft: opciones.draft,
      published: opciones.published ?? null,
      status: opciones.status ?? 'changed',
      version: 0,
    });
}

describeIntegration('el aviso al publicar', () => {
  beforeEach(async () => {
    resetBucketsForTests();
    after.mockClear();
    vi.mocked(revalidateTag).mockClear();

    // La fase, encendida. Sin esto ninguna action avisaría y todos los casos de abajo pasarían
    // por la razón equivocada.
    vi.stubEnv('WEBHOOK_URL', 'https://mi-web.com/api/unocms');
    vi.stubEnv('WEBHOOK_SECRET', 'un-secreto-de-avisos-con-mas-de-32-caracteres');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const editor = await crearEditor();
    setSessionProviderForTests(() =>
      Promise.resolve({ userId: editor.id, email: editor.email, role: 'editor' as const })
    );
  });

  afterEach(() => {
    setSessionProviderForTests(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('T-A-11: publicar un singleton manda su clave y su tag', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });

    expect((await publish({ key: 'hero', version: 0 })).ok).toBe(true);

    const sobres = sobresEnviados();
    expect(sobres).toHaveLength(1);
    expect(sobres[0]).toMatchObject({
      evento: 'content.published',
      tags: ['content:hero'],
      claves: [{ key: 'hero', tipo: 'singleton' }],
    });
  });

  it('T-A-12: publicar un elemento de colección manda el tag de la colección', async () => {
    await crearEntrada({ key: 'testimonials.a1b2', type: 'testimonials', draft: TESTIMONIO });

    expect((await publish({ key: 'testimonials.a1b2', version: 0 })).ok).toBe(true);

    // El tag del elemento no le sirve a nadie: `/api/content/testimonials.a1b2` responde 404.
    // Lo que la web puede repedir es la lista, y es lo único que tiene que viajar.
    expect(sobresEnviados()[0]?.tags).toEqual(['content:testimonials']);
  });

  it('T-A-13: publicar lo que ya estaba publicado NO avisa', async () => {
    // La fila ya tiene el mismo contenido en borrador y en publicado: es lo que pasa al pulsar
    // "Publicar" dos veces seguidas. `publishEntry` devuelve `cambio: false`.
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: HERO_COMPLETO,
      published: HERO_COMPLETO,
      status: 'published',
    });

    const resultado = await publish({ key: 'hero', version: 0 });

    expect(resultado).toMatchObject({ ok: true, data: { changed: false } });
    // Ni un POST: avisar aquí despertaría a la web de destino para que volviera a pedir
    // exactamente lo que ya tiene.
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it('T-A-14: publishAll de varias entradas manda UN aviso, no uno por entrada', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });
    await crearEntrada({ key: 'about', type: 'about', draft: { heading: 'Sobre', visible: true } });
    await crearEntrada({ key: 'testimonials.a', type: 'testimonials', draft: TESTIMONIO });
    await crearEntrada({ key: 'testimonials.b', type: 'testimonials', draft: TESTIMONIO });

    const resultado = await publishAll({});
    expect(resultado.ok).toBe(true);

    const sobres = sobresEnviados();
    expect(sobres).toHaveLength(1);
    expect(sobres[0]?.claves).toHaveLength(4);
    // Y los dos testimonios se funden en un solo tag: es lo que hay que repedir, una vez.
    expect([...(sobres[0]?.tags ?? [])].sort()).toEqual([
      'content:about',
      'content:hero',
      'content:testimonials',
    ]);
  });

  it('T-A-14b: un publishAll que no publica nada no avisa', async () => {
    // `hero.title` es requerido: la entrada falla la validación y no se publica.
    await crearEntrada({ key: 'hero', type: 'hero', draft: { subtitle: 'sin título' } });

    await publishAll({});

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('T-A-15: borrar un elemento avisa con el tag de la colección', async () => {
    await crearEntrada({
      key: 'testimonials.a1b2',
      type: 'testimonials',
      draft: TESTIMONIO,
      published: TESTIMONIO,
      status: 'published',
    });

    expect((await deleteItem({ key: 'testimonials.a1b2' })).ok).toBe(true);

    expect(sobresEnviados()[0]).toMatchObject({
      evento: 'content.deleted',
      tags: ['content:testimonials'],
    });
  });

  it('T-A-15b: reordenar avisa, porque el orden es parte de la respuesta', async () => {
    await crearEntrada({ key: 'testimonials.a', type: 'testimonials', draft: TESTIMONIO });
    await crearEntrada({ key: 'testimonials.b', type: 'testimonials', draft: TESTIMONIO });

    const resultado = await reorderItems({
      collection: 'testimonials',
      orderedKeys: ['testimonials.b', 'testimonials.a'],
    });
    expect(resultado.ok).toBe(true);

    expect(sobresEnviados()[0]).toMatchObject({
      evento: 'content.reordered',
      tags: ['content:testimonials'],
    });
  });

  it('T-A-19: si el destino falla, la publicación sigue escrita y la action sigue en ok', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 500 }));
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });

    const resultado = await publish({ key: 'hero', version: 0 });

    // Lo que importa: publicar ya estaba escrito y confirmado cuando el aviso empezó. Que el
    // aviso falle no puede convertir una publicación buena en un error (ADR-1003).
    expect(resultado.ok).toBe(true);
    const [fila] = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, 'hero'));
    expect(fila?.published).toMatchObject(HERO_COMPLETO);
    expect(fila?.status).toBe('published');
  });

  it('T-A-19b: si el fetch lanza, tampoco tumba la publicación', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('la red no está'));
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });

    expect((await publish({ key: 'hero', version: 0 })).ok).toBe(true);
  });

  it('T-A-25: la landing de este repositorio no se entera de nada', async () => {
    await crearEntrada({ key: 'testimonials.a1b2', type: 'testimonials', draft: TESTIMONIO });

    await publish({ key: 'testimonials.a1b2', version: 0 });

    // Los mismos dos tags de siempre, hacia dentro: el del elemento y el de la colección. Que
    // hacia fuera viaje solo uno no cambia lo de aquí (#116 sigue cerrado).
    expect(revalidateTag).toHaveBeenCalledWith('content:testimonials.a1b2');
    expect(revalidateTag).toHaveBeenCalledWith('content:testimonials');
  });

  it('T-A-1: con la fase apagada no sale ni una petición', async () => {
    vi.stubEnv('WEBHOOK_URL', undefined);
    vi.stubEnv('WEBHOOK_SECRET', undefined);
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });

    expect((await publish({ key: 'hero', version: 0 })).ok).toBe(true);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    // Y lo de siempre sigue igual.
    expect(revalidateTag).toHaveBeenCalledWith('content:hero');
  });
});
