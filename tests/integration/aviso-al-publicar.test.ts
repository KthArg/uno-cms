import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  deleteItem,
  deleteMedia,
  publish,
  publishAll,
  registrarImagen,
  reorderItems,
  updateSettings,
} from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { ultimoAviso } from '@/cms/core/aviso';
import { contentEntries, getDb, media, users } from '@/cms/db';
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

// El cliente de Vercel Blob se sustituye, como en `media.test.ts`: necesita token y red, y lo
// que se prueba aquí es el aviso, no que Vercel borre.
const borrarEnBlob = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob', () => ({ del: borrarEnBlob }));

vi.mock('next/cache', async () => {
  const actual = await vi.importActual<typeof import('next/cache')>('next/cache');
  return { ...actual, revalidateTag: vi.fn() };
});

const { revalidateTag } = await import('next/cache');

const HERO_COMPLETO = { title: 'Título publicable' };
const TESTIMONIO = { quote: 'Muy bien', author: 'Alguien' };

/**
 * Espera a que terminen las tareas de `after`.
 *
 * `avisar` **no** las espera —van después de responder al editor, esa es toda la idea— así que
 * `entregar` y su `audit` corren en paralelo con lo que venga detrás. Sin esto, un aviso que
 * falla (dos intentos) escribe su fila **más tarde** que uno posterior que va a la primera, y un
 * caso que mire «el último» lee el equivocado. Me pasó escribiendo estos tests, y el fallo era
 * del test, no del código.
 */
async function esperarLosAvisos(): Promise<void> {
  await Promise.all(after.mock.results.map((resultado) => resultado.value));
}

/** Los sobres que salieron, ya deserializados. Es lo que estos casos miran. */
function sobresEnviados(): {
  evento: string;
  tags: string[];
  claves: { key: string }[];
  datos?: Record<string, string>;
}[] {
  return vi
    .mocked(globalThis.fetch)
    .mock.calls.map((llamada) => JSON.parse((llamada[1] as RequestInit).body as string));
}

async function crearEditor(role: 'editor' | 'admin' = 'editor') {
  const [user] = await getDb()
    .insert(users)
    .values({
      email: `${role}@ejemplo.com`,
      name: 'Quien edita',
      passwordHash: 'no-se-usa',
      role,
    })
    .returning();
  return user!;
}

/** Se hace pasar por administradora: `updateSettings` y `deleteMedia` lo exigen. */
async function comoAdmin() {
  const admin = await crearEditor('admin');
  setSessionProviderForTests(() =>
    Promise.resolve({ userId: admin.id, email: admin.email, role: 'admin' as const })
  );
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

  it('T-A-19c: si `after` lanza, publicar sigue en ok — es el fallo que la autorevisión encontró', async () => {
    // `after` lanza fuera del contexto de una petición, comprobado ejecutando el de verdad. Sin
    // protección en `avisar`, ese throw sube por el handler, `defineAction` lo captura y
    // devuelve INTERNAL: el editor vería «algo ha fallado por nuestra parte» sobre una
    // publicación **ya escrita y confirmada**. Es la inversión que ADR-1003 prohíbe, colándose
    // por la puerta de las excepciones en vez de por la del resultado.
    after.mockImplementationOnce(() => {
      throw new Error('`after` was called outside a request scope.');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });

    const resultado = await publish({ key: 'hero', version: 0 });

    expect(resultado).toMatchObject({ ok: true, data: { changed: true } });
    const [fila] = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, 'hero'));
    expect(fila?.status).toBe('published');
  });

  it('T-A-17: cambiar un ajuste avisa con el tag `settings` y NINGUNA clave de contenido', async () => {
    await comoAdmin();

    const resultado = await updateSettings({ key: 'site', value: { siteName: 'Otro nombre' } });
    expect(resultado.ok).toBe(true);

    // El tag es el mismo que se invalida hacia dentro, así que una web hecha en Next puede
    // pasárselo a `revalidateTag` sin traducir nada. Y ninguna clave: lo que cambió no es una
    // sección, es la configuración que se aplica a todas.
    expect(sobresEnviados()[0]).toMatchObject({
      evento: 'settings.updated',
      tags: ['settings'],
      claves: [],
    });
  });

  it('T-A-16: subir una imagen avisa SIN tags, y con la url', async () => {
    // El `pathname` tiene que tener **la forma que genera el CMS** —`media/AAAA-MM/<uuid>.<ext>`—
    // o `registrarImagen` lo rechaza antes de llegar al aviso.
    const pathname = 'media/2026-09/3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b.webp';
    const url = `https://ejemplo.public.blob.vercel-storage.com/${pathname}`;

    const resultado = await registrarImagen({
      url,
      pathname,
      filename: 'una-imagen.webp',
      mimeType: 'image/webp',
    });
    expect(resultado.ok).toBe(true);

    const sobre = sobresEnviados()[0];
    // **Sin tags**: subir una imagen no cambia ni una respuesta de la API pública. Con tags,
    // la web remota repediría todo su contenido para encontrar exactamente lo que ya tenía.
    expect(sobre).toMatchObject({ evento: 'media.uploaded', tags: [], claves: [] });
    expect(sobre?.datos).toEqual({ url });
  });

  it('registrar la MISMA imagen dos veces avisa una sola vez', async () => {
    const pathname = 'media/2026-09/11112222-3333-4444-5555-666677778888.webp';
    const entrada = {
      url: `https://ejemplo.public.blob.vercel-storage.com/${pathname}`,
      pathname,
      filename: 'repetida.webp',
      mimeType: 'image/webp',
    };

    expect((await registrarImagen(entrada)).ok).toBe(true);
    // El segundo no inserta nada (`onConflictDoNothing`) y devuelve `ok` igual: es idempotente a
    // propósito. Lo que no puede hacer es volver a despertar a la web de destino.
    expect((await registrarImagen(entrada)).ok).toBe(true);

    expect(sobresEnviados()).toHaveLength(1);
  });

  it('T-A-16b: borrar una imagen avisa sin tags, con la url que dejó de existir', async () => {
    const pathname = 'media/2026-09/7c2b9d10-1a2b-4c3d-9e4f-5a6b7c8d9e0f.webp';
    const url = `https://ejemplo.public.blob.vercel-storage.com/${pathname}`;

    const [fila] = await getDb()
      .insert(media)
      .values({
        url,
        pathname,
        filename: 'otra.webp',
        mimeType: 'image/webp',
        sizeBytes: 0,
        alt: '',
      })
      .returning();

    await comoAdmin();
    const resultado = await deleteMedia({ id: fila!.id });
    expect(resultado.ok).toBe(true);

    const sobre = sobresEnviados()[0];
    // Es el único cambio del CMS que puede romper algo ya publicado sin que el contenido
    // publicado cambie: una URL que servía bytes deja de servirlos.
    expect(sobre).toMatchObject({ evento: 'media.deleted', tags: [] });
    expect(sobre?.datos).toEqual({ url });
  });

  it('T-A-25: la landing de este repositorio no se entera de nada', async () => {
    await crearEntrada({ key: 'testimonials.a1b2', type: 'testimonials', draft: TESTIMONIO });

    await publish({ key: 'testimonials.a1b2', version: 0 });

    // Los mismos dos tags de siempre, hacia dentro: el del elemento y el de la colección. Que
    // hacia fuera viaje solo uno no cambia lo de aquí (#116 sigue cerrado).
    expect(revalidateTag).toHaveBeenCalledWith('content:testimonials.a1b2');
    expect(revalidateTag).toHaveBeenCalledWith('content:testimonials');
  });

  it('T-A-34: con la fase apagada, `ultimoAviso` es null y NO consulta la base de datos', async () => {
    vi.stubEnv('WEBHOOK_URL', undefined);
    vi.stubEnv('WEBHOOK_SECRET', undefined);

    // Un despliegue que no usa esto —la inmensa mayoría— no debe pagar una consulta cada vez que
    // alguien abre el panel. Se comprueba espiando la conexión, no suponiéndolo: la comprobación
    // de configuración va **antes** del `select`.
    const espia = vi.spyOn(getDb(), 'select');

    expect(await ultimoAviso()).toBeNull();
    expect(espia).not.toHaveBeenCalled();
  });

  it('T-A-35: tras un aviso que llegó, el panel puede decir que llegó y cuándo', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });
    await publish({ key: 'hero', version: 0 });
    // Sin esto el caso pasaba **por suerte**: un aviso de un solo intento es rápido y su fila
    // llegaba a tiempo. El de T-A-36, con dos intentos, no — y ahí se vio.
    await esperarLosAvisos();

    const aviso = await ultimoAviso();

    expect(aviso).toMatchObject({ ok: true, evento: 'content.published' });
    expect(aviso?.cuando).toBeInstanceOf(Date);
  });

  it('T-A-36: un aviso que falló se lee COMO fallo, con su motivo', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });
    await publish({ key: 'hero', version: 0 });
    await esperarLosAvisos();

    // Es la diferencia entre «no hay datos» y «tu web lleva sin enterarse desde entonces», y es
    // toda la razón de que esto se lea en el panel.
    expect(await ultimoAviso()).toMatchObject({ ok: false, motivo: 'estado', estado: 503 });
  });

  it('el panel lee EL ÚLTIMO, no uno cualquiera', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 500 }));
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });
    await publish({ key: 'hero', version: 0 });
    // Se espera **antes** del segundo: si no, el fallido —que hace dos intentos— escribe su fila
    // después que el bueno, y este caso comprobaría lo contrario de lo que dice.
    await esperarLosAvisos();

    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await crearEntrada({ key: 'about', type: 'about', draft: { heading: 'Sobre', visible: true } });
    await publish({ key: 'about', version: 0 });
    await esperarLosAvisos();

    // Sin ordenar por fecha descendente, esto devolvería el fallo viejo y el panel diría que la
    // web está desactualizada cuando ya se avisó bien.
    expect(await ultimoAviso()).toMatchObject({ ok: true });
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
