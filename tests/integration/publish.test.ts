import { desc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { publish, publishAll, saveDraft } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { emptyRichTextDoc } from '@/cms/core/richtext';
import { contentEntries, getDb, revisions, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-78-1 a T-78-7: `publish`, `publishAll` y las revisiones (SPEC §5.3, §4; ADR-401, ADR-402).
 */

const HERO_COMPLETO = { title: 'Título publicable' };

vi.mock('next/cache', async () => {
  const actual = await vi.importActual<typeof import('next/cache')>('next/cache');
  return { ...actual, revalidateTag: vi.fn() };
});

const { revalidateTag } = await import('next/cache');

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
  version?: number;
}) {
  await getDb()
    .insert(contentEntries)
    .values({
      key: opciones.key,
      type: opciones.type,
      draft: opciones.draft,
      published: opciones.published ?? null,
      status: opciones.status ?? 'changed',
      version: opciones.version ?? 0,
    });
}

async function leer(key: string) {
  const [row] = await getDb().select().from(contentEntries).where(eq(contentEntries.key, key));
  return row!;
}

async function revisionesDe(key: string) {
  return getDb()
    .select()
    .from(revisions)
    .where(eq(revisions.entryKey, key))
    .orderBy(desc(revisions.publishedAt));
}

describeIntegration('publish', () => {
  beforeEach(async () => {
    resetBucketsForTests();
    vi.mocked(revalidateTag).mockClear();
    const editor = await crearEditor();
    setSessionProviderForTests(() =>
      Promise.resolve({ userId: editor.id, email: editor.email, role: 'editor' as const })
    );
  });

  afterEach(() => {
    setSessionProviderForTests(null);
  });

  it('T-78-1: publica y llama a revalidateTag con content:<key>', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });

    const result = await publish({ key: 'hero', version: 0 });

    expect(result.ok).toBe(true);
    const fila = await leer('hero');
    expect(fila.published).toMatchObject(HERO_COMPLETO);
    expect(fila.status).toBe('published');
    expect(fila.publishedAt).not.toBeNull();
    expect(revalidateTag).toHaveBeenCalledWith('content:hero');
  });

  it('T-78-2: un requerido vacío da VALIDATION_FAILED con la etiqueta y la sección', async () => {
    // `hero.title` es requerido. SPEC §9 pide "Falta el Título principal en Portada": la
    // etiqueta del campo y el nombre de la sección, no la clave técnica.
    await crearEntrada({ key: 'hero', type: 'hero', draft: { subtitle: 'solo esto' } });

    const result = await publish({ key: 'hero', version: 0 });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    if (result.ok) return;

    expect(result.fields?.[0]?.message).toBe('Falta Título principal en Portada.');
    // Y no se publica nada: la sección sigue sin contenido público.
    expect((await leer('hero')).published).toBeNull();
  });

  it('T-78-2: el mensaje no filtra la clave técnica de la sección', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: {} });

    const result = await publish({ key: 'hero', version: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.stringify(result.fields)).not.toContain('"hero"');
  });

  it('T-78-3: la revisión guarda lo sustituido, no lo nuevo', async () => {
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'La versión nueva' },
      published: { title: 'La versión vieja' },
      status: 'changed',
    });

    await publish({ key: 'hero', version: 0 });

    const [revision] = await revisionesDe('hero');
    // Una revisión sirve para volver atrás, y "atrás" es lo que había (ADR-402). Guardando lo
    // entrante, la revisión más reciente sería idéntica a lo publicado actual: inútil.
    expect(revision?.data).toMatchObject({ title: 'La versión vieja' });
  });

  it('T-78-3: la primera publicación no genera revisión', async () => {
    // No había nada que sustituir. El historial vacío de un contenido recién publicado parece
    // un fallo a primera vista y es lo correcto (ADR-402).
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });

    await publish({ key: 'hero', version: 0 });

    expect(await revisionesDe('hero')).toHaveLength(0);
  });

  it('T-78-4: se podan las revisiones por encima de 20', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: { title: 'v0' } });

    let version = 0;
    for (let i = 0; i < 25; i += 1) {
      const guardado = await saveDraft({ key: 'hero', data: { title: `v${i}` }, version });
      expect(guardado.ok, `guardado ${i}`).toBe(true);
      if (!guardado.ok) return;
      version = guardado.data.version;

      const publicado = await publish({ key: 'hero', version });
      expect(publicado.ok, `publicación ${i}`).toBe(true);
    }

    const filas = await revisionesDe('hero');
    expect(filas).toHaveLength(20);
    // Se quedan las 20 más recientes: la más vieja que sobrevive es la de `v4`, porque las de
    // v0..v3 se podaron.
    expect(JSON.stringify(filas)).not.toContain('"v0"');
    expect(JSON.stringify(filas)).toContain('"v23"');
  });

  it('T-78-5: si la publicación falla, no queda revisión suelta', async () => {
    // Todo en la misma transacción. Se provoca el fallo con un `version` que no coincide, ya
    // dentro del bloqueo: si la revisión se escribiera antes de comprobar, quedaría huérfana.
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'nuevo' },
      published: { title: 'viejo' },
      version: 3,
    });

    const result = await publish({ key: 'hero', version: 0 });

    expect(result).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    expect(await revisionesDe('hero')).toHaveLength(0);
    expect((await leer('hero')).published).toMatchObject({ title: 'viejo' });
  });

  it('T-78-6: publishAll publica lo válido y reporta lo que no', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });
    // `about.heading` es requerido y falta: esta sección no puede publicarse.
    await crearEntrada({ key: 'about', type: 'about', draft: { visible: true } });
    await crearEntrada({ key: 'seo', type: 'seo', draft: { title: 'Mi sitio' } });

    const result = await publishAll({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Todo-o-nada **por entrada** (ADR-401): un campo olvidado en una sección que a nadie le
    // urge no bloquea la publicación del resto.
    expect(result.data.published.sort()).toEqual(['hero', 'seo']);
    expect(result.data.failed).toHaveLength(1);
    expect(result.data.failed[0]).toMatchObject({ key: 'about', code: 'VALIDATION_FAILED' });

    expect((await leer('hero')).published).not.toBeNull();
    expect((await leer('about')).published).toBeNull();
  });

  it('T-78-6: publishAll salta las entradas que no tienen cambios', async () => {
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: HERO_COMPLETO,
      published: HERO_COMPLETO,
      status: 'published',
    });

    const result = await publishAll({});

    expect(result.ok && result.data.published).toEqual([]);
  });

  it('T-78-7: publicar algo idéntico no crea revisión ni toca la fila', async () => {
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: HERO_COMPLETO,
      published: HERO_COMPLETO,
      status: 'changed',
    });

    const result = await publish({ key: 'hero', version: 0 });

    expect(result).toMatchObject({ ok: true, data: { changed: false } });
    expect(await revisionesDe('hero')).toHaveLength(0);
    // Pero el estado sí se corrige: la fila decía "con cambios" y no los tenía.
    expect((await leer('hero')).status).toBe('published');
  });

  it('T-78-7: el orden de las claves no cuenta como cambio', async () => {
    // `JSON.stringify` depende del orden de inserción. Comparando así, un formulario que
    // mandara los campos en otro orden crearía una revisión idéntica en cada publicación.
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { subtitle: 'b', title: 'a' },
      published: { title: 'a', subtitle: 'b' },
      status: 'changed',
    });

    const result = await publish({ key: 'hero', version: 0 });

    expect(result).toMatchObject({ ok: true, data: { changed: false } });
    expect(await revisionesDe('hero')).toHaveLength(0);
  });

  it('publicar con un version viejo da VERSION_CONFLICT', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO, version: 5 });

    const result = await publish({ key: 'hero', version: 2 });

    expect(result).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    expect((await leer('hero')).published).toBeNull();
  });

  it('dos publicaciones concurrentes no escriben dos revisiones del mismo estado', async () => {
    // Es lo que compra el `FOR UPDATE` de SPEC §4. Sin él, las dos leerían el mismo
    // `published` anterior y guardarían la misma revisión dos veces, perdiendo un estado del
    // historial.
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'nuevo' },
      published: { title: 'viejo' },
      version: 0,
    });

    await Promise.all([publish({ key: 'hero', version: 0 }), publish({ key: 'hero', version: 0 })]);

    const filas = await revisionesDe('hero');
    expect(filas).toHaveLength(1);
  });

  it('el FOR UPDATE hace que publish vea el cambio de quien tenía la fila bloqueada', async () => {
    // El test anterior con dos `publish()` a la vez **no distinguía**: se comprobó por
    // mutación que pasaba igual sin el bloqueo. Este fuerza el entrelazado a mano.
    //
    // Sin `FOR UPDATE`, `publish` lee la fila (versión 0), valida, y solo al escribir espera a
    // que la otra transacción suelte — y entonces publica encima de un estado que ya cambió.
    // Es la pérdida de actualización clásica: el `version` que comprobó ya no era el actual.
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'nuevo' },
      published: { title: 'viejo' },
      version: 0,
    });

    const db = getDb();
    let soltar!: () => void;
    const bloqueo = new Promise<void>((resolve) => {
      soltar = resolve;
    });

    const otra = db.transaction(async (tx) => {
      await tx.select().from(contentEntries).where(eq(contentEntries.key, 'hero')).for('update');
      await bloqueo;
      // Lo que haría otro editor guardando mientras tanto.
      await tx
        .update(contentEntries)
        .set({ version: 1, draft: { title: 'lo que escribió la otra' } })
        .where(eq(contentEntries.key, 'hero'));
    });

    // Un respiro para que la otra transacción tenga el bloqueo antes de empezar.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const publicacion = publish({ key: 'hero', version: 0 });

    soltar();
    await otra;

    // Con el bloqueo, `publish` lee **después** y ve la versión 1: conflicto, y el trabajo de
    // la otra editora sigue en pie.
    expect(await publicacion).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    expect((await leer('hero')).published).toMatchObject({ title: 'viejo' });
    expect(await revisionesDe('hero')).toHaveLength(0);
  });

  it('T-78-7: el orden de las claves de Postgres no cuenta como cambio', async () => {
    // `about` expone la diferencia y `hero` no: Postgres ordena las claves de un JSONB por
    // longitud —body(4), heading(7), visible(7)—, mientras que Zod las devuelve en el orden
    // del esquema —heading, body, visible—. Con `JSON.stringify` a secas, publicar dos veces
    // lo mismo crearía una revisión idéntica cada vez y se comería el presupuesto de 20.
    const igual = { heading: 'Sobre nosotras', body: emptyRichTextDoc(), visible: true };
    await crearEntrada({
      key: 'about',
      type: 'about',
      draft: igual,
      published: igual,
      status: 'changed',
    });

    const result = await publish({ key: 'about', version: 0 });

    expect(result).toMatchObject({ ok: true, data: { changed: false } });
    expect(await revisionesDe('about')).toHaveLength(0);
  });

  it('una clave inexistente da NOT_FOUND', async () => {
    expect(await publish({ key: 'no-existe', version: 0 })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });

  it('no se revalida el tag cuando la publicación falla', async () => {
    // Invalidar tras un fallo tira el caché sin motivo y hace que la landing vuelva a
    // consultar Postgres para servir exactamente lo mismo.
    await crearEntrada({ key: 'hero', type: 'hero', draft: {} });

    await publish({ key: 'hero', version: 0 });

    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('la publicación queda auditada con la clave como objetivo', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: HERO_COMPLETO });

    await publish({ key: 'hero', version: 0 });

    const { auditLog } = await import('@/cms/db');
    const [row] = await getDb().select().from(auditLog);
    expect(row).toMatchObject({
      action: 'content.publish',
      targetType: 'content',
      targetId: 'hero',
    });
  });
});
