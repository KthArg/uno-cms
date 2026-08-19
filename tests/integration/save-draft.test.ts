import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { saveDraft } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { contentEntries, getDb, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-77-1 a T-77-6: `saveDraft` con bloqueo optimista (SPEC §5.3, spec de fase §3.4).
 *
 * Los casos de conflicto se afirman **sobre la tabla**, no sobre la respuesta: lo que hay que
 * demostrar no es que devuelva `VERSION_CONFLICT`, sino que el contenido del otro editor
 * sigue intacto. Una implementación que escribe y luego devuelve el error pasaría el test
 * fácil y perdería trabajo en producción.
 */

async function crearEditor(email = 'editora@ejemplo.com') {
  const [user] = await getDb()
    .insert(users)
    .values({ email, name: 'Editora', passwordHash: 'no-se-usa-aqui', role: 'editor' })
    .returning();
  return user!;
}

async function crearHero(draft: Record<string, unknown> = {}) {
  const [row] = await getDb()
    .insert(contentEntries)
    .values({ key: 'hero', type: 'hero', draft, status: 'draft', version: 0 })
    .returning();
  return row!;
}

async function leerHero() {
  const [row] = await getDb().select().from(contentEntries).where(eq(contentEntries.key, 'hero'));
  return row!;
}

describeIntegration('saveDraft', () => {
  beforeEach(async () => {
    resetBucketsForTests();
    const editor = await crearEditor();
    setSessionProviderForTests(() =>
      Promise.resolve({ userId: editor.id, email: editor.email, role: 'editor' as const })
    );
  });

  afterEach(() => {
    setSessionProviderForTests(null);
  });

  it('T-77-1: guarda y devuelve el nuevo version', async () => {
    await crearHero();

    const result = await saveDraft({ key: 'hero', data: { title: 'Hola' }, version: 0 });

    expect(result).toMatchObject({ ok: true, data: { version: 1 } });
    expect((await leerHero()).draft).toMatchObject({ title: 'Hola' });
  });

  it('T-77-1: el version devuelto sirve para el siguiente guardado, sin recargar', async () => {
    await crearHero();

    const primero = await saveDraft({ key: 'hero', data: { title: 'Uno' }, version: 0 });
    expect(primero.ok).toBe(true);
    if (!primero.ok) return;

    // Es la razón de devolver el nuevo y no el viejo: el panel encadena guardados. Si aquí
    // hiciera falta recargar, el autosave se rompería en el segundo tecleo.
    const segundo = await saveDraft({
      key: 'hero',
      data: { title: 'Dos' },
      version: primero.data.version,
    });

    expect(segundo).toMatchObject({ ok: true, data: { version: 2 } });
  });

  it('T-77-2: un version viejo da VERSION_CONFLICT y el contenido no cambia', async () => {
    await crearHero();
    await saveDraft({ key: 'hero', data: { title: 'Lo que escribió la otra' }, version: 0 });

    const result = await saveDraft({ key: 'hero', data: { title: 'Lo mío' }, version: 0 });

    expect(result).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    // Lo que de verdad importa: el trabajo ajeno sigue ahí.
    const fila = await leerHero();
    expect(fila.draft).toMatchObject({ title: 'Lo que escribió la otra' });
    expect(fila.version).toBe(1);
  });

  it('T-77-3: dos guardados concurrentes, uno gana y el otro obtiene conflicto', async () => {
    await crearHero();

    // Las dos promesas a la vez, sin `await` entre medias: un test secuencial pasaría igual
    // con una implementación que lee la versión, decide y luego escribe.
    const [a, b] = await Promise.all([
      saveDraft({ key: 'hero', data: { title: 'A' }, version: 0 }),
      saveDraft({ key: 'hero', data: { title: 'B' }, version: 0 }),
    ]);

    const exitos = [a, b].filter((r) => r.ok);
    const conflictos = [a, b].filter((r) => !r.ok && r.code === 'VERSION_CONFLICT');

    expect(exitos).toHaveLength(1);
    expect(conflictos).toHaveLength(1);
    expect((await leerHero()).version).toBe(1);
  });

  it('T-77-4: el richtext se sanea al guardar', async () => {
    await crearHero();

    const result = await saveDraft({
      key: 'hero',
      data: {
        title: 'Con enlace envenenado',
        subtitle: 'texto',
      },
      version: 0,
    });
    expect(result.ok).toBe(true);

    // `about.body` es el campo richtext; se guarda en su propia entrada.
    await getDb()
      .insert(contentEntries)
      .values({ key: 'about', type: 'about', draft: {}, status: 'draft', version: 0 });

    const conJavascript = await saveDraft({
      key: 'about',
      data: {
        heading: 'Sobre nosotras',
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'pincha aquí',
                  marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
              ],
            },
          ],
        },
      },
      version: 0,
    });

    expect(conJavascript.ok).toBe(true);

    const [about] = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, 'about'));

    // El texto se conserva y el enlace desaparece. Rechazar el guardado entero rompería el
    // autosave en bucle sin que el editor supiera por qué.
    const guardado = JSON.stringify(about!.draft);
    expect(guardado).toContain('pincha aquí');
    expect(guardado).not.toContain('javascript:');
  });

  it.each([
    { nombre: 'null', valor: null },
    { nombre: 'una cadena', valor: 'texto plano' },
    { nombre: 'un número', valor: 42 },
    { nombre: 'un array', valor: [] },
  ])(
    'un richtext que no es un documento se rechaza, no borra lo que había: $nombre',
    async ({ valor }) => {
      await getDb()
        .insert(contentEntries)
        .values({ key: 'about', type: 'about', draft: {}, status: 'draft', version: 0 });

      const bueno = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'lo que ya estaba' }] }],
      };
      const guardado = await saveDraft({
        key: 'about',
        data: { heading: 'Sobre', body: bueno },
        version: 0,
      });
      expect(guardado.ok).toBe(true);

      // El saneador devuelve un documento vacío ante cualquier cosa que no sea un documento.
      // Si se aplicara aquí, esto pasaría la validación y **borraría el texto de arriba** —cada
      // dos segundos, mientras el editor escribe sin enterarse.
      const result = await saveDraft({
        key: 'about',
        data: { heading: 'Sobre', body: valor },
        version: 1,
      });

      expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });

      const [about] = await getDb()
        .select()
        .from(contentEntries)
        .where(eq(contentEntries.key, 'about'));
      expect(JSON.stringify(about!.draft)).toContain('lo que ya estaba');
    }
  );

  it('T-77-5: guardar no publica', async () => {
    await crearHero();

    await saveDraft({ key: 'hero', data: { title: 'Solo borrador' }, version: 0 });

    const fila = await leerHero();
    expect(fila.published).toBeNull();
    expect(fila.status).toBe('changed');
  });

  it("el status queda en 'changed' aunque nunca se haya publicado", async () => {
    // No es un detalle: `publishAll` itera las entradas en `changed` (SPEC §5.3). Si una
    // sección recién rellenada se quedara en `draft`, "publicar todo" la saltaría y el editor
    // no vería ningún error que lo explicara.
    await crearHero();

    await saveDraft({ key: 'hero', data: { title: 'Primera vez' }, version: 0 });

    expect((await leerHero()).status).toBe('changed');
  });

  it('T-77-6: el autosave no se corta — 100 guardados seguidos', async () => {
    await crearHero();

    let version = 0;
    for (let i = 0; i < 100; i += 1) {
      const result = await saveDraft({ key: 'hero', data: { title: `v${i}` }, version });
      expect(result.ok, `guardado ${i + 1}`).toBe(true);
      if (!result.ok) return;
      version = result.data.version;
    }

    expect(version).toBe(100);
  });

  it('una clave que no existe da NOT_FOUND, no crea la fila', async () => {
    const result = await saveDraft({ key: 'no-existe', data: {}, version: 0 });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await getDb().select().from(contentEntries)).toHaveLength(0);
  });

  it('un campo con el tipo equivocado da VALIDATION_FAILED con su ruta', async () => {
    await crearHero();

    const result = await saveDraft({ key: 'hero', data: { title: 12345 }, version: 0 });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.ok === false && result.fields?.[0]?.path).toBe('title');
    // Y no se escribe: el borrador sigue vacío.
    expect(await leerHero()).toMatchObject({ version: 0 });
  });

  it('un campo requerido vacío SÍ se puede guardar: es un borrador', async () => {
    await crearHero();

    // `hero.title` es requerido, pero el esquema laxo admite ausencias. Exigirlo aquí haría
    // imposible guardar mientras se escribe, que es justo lo que hace el autosave.
    const result = await saveDraft({ key: 'hero', data: { subtitle: 'solo esto' }, version: 0 });

    expect(result.ok).toBe(true);
  });

  it('un campo que no está en la config no se cuela en el JSONB', async () => {
    await crearHero();

    const result = await saveDraft({
      key: 'hero',
      data: { title: 'Hola', campoInventado: 'basura' },
      version: 0,
    });

    // El esquema es `strict()`: una clave desconocida es un error, no algo que se guarda en
    // silencio y ningún formulario puede volver a editar.
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('un enlace inseguro en un campo link se rechaza, no se limpia', async () => {
    await crearHero();

    // Distinto del richtext a propósito: aquí el editor escribió la URL en su campo, así que
    // puede corregirla. Limpiarla en silencio le dejaría un botón que no lleva a ningún sitio.
    const result = await saveDraft({
      key: 'hero',
      data: { title: 'Hola', ctaHref: 'javascript:alert(1)' },
      version: 0,
    });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.ok === false && result.fields?.[0]?.path).toBe('ctaHref');
  });

  it('el guardado queda auditado con la clave como objetivo', async () => {
    await crearHero();

    await saveDraft({ key: 'hero', data: { title: 'Hola' }, version: 0 });

    const { auditLog } = await import('@/cms/db');
    const [row] = await getDb().select().from(auditLog);
    expect(row).toMatchObject({
      action: 'content.saveDraft',
      targetType: 'content',
      targetId: 'hero',
    });
  });
});
