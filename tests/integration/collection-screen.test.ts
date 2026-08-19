import { expect, it } from 'vitest';
import { listCollectionItems, tituloDeElemento } from '@/cms/core/collections';
import { contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/** La lectura de una colección para el panel (#111, SPEC §5.1 `titleField`). */

async function insertar(opciones: {
  key: string;
  draft: Record<string, unknown>;
  sortOrder: number;
  published?: Record<string, unknown> | null;
  status?: 'draft' | 'published' | 'changed';
}) {
  await getDb()
    .insert(contentEntries)
    .values({
      key: opciones.key,
      type: 'testimonials',
      draft: opciones.draft,
      published: opciones.published ?? null,
      status: opciones.status ?? 'draft',
      sortOrder: opciones.sortOrder,
    });
}

describeIntegration('lista de una colección', () => {
  it('enseña el titleField, no la clave técnica', async () => {
    await insertar({
      key: 'testimonials.a',
      draft: { author: 'Ana', quote: 'Genial' },
      sortOrder: 0,
    });

    const [elemento] = await listCollectionItems('testimonials');

    // SPEC §5.1 llama a `titleField` "qué mostrar en la lista del admin".
    expect(elemento?.titulo).toBe('Ana');
    expect(elemento?.titulo).not.toContain('testimonials.');
  });

  it('un elemento recién creado dice «Sin título» en vez de dejar la fila en blanco', async () => {
    // Nace con los valores por defecto, así que el `titleField` está vacío. Una lista con
    // cuatro filas en blanco no se puede usar, y enseñar la clave sería la jerga que §9
    // prohíbe.
    await insertar({ key: 'testimonials.nuevo', draft: {}, sortOrder: 0 });

    expect((await listCollectionItems('testimonials'))[0]?.titulo).toBe('Sin título');
  });

  it('respeta el mismo orden que sirve la landing', async () => {
    await insertar({ key: 'testimonials.z', draft: { author: 'Zoe' }, sortOrder: 5 });
    await insertar({ key: 'testimonials.a', draft: { author: 'Ana' }, sortOrder: 1 });

    const titulos = (await listCollectionItems('testimonials')).map((e) => e.titulo);

    // Si el panel enseñara otro orden, arrastrar un elemento aquí movería otra cosa allí.
    expect(titulos).toEqual(['Ana', 'Zoe']);
  });

  it('distingue los tres estados por elemento', async () => {
    await insertar({ key: 'testimonials.a', draft: { author: 'A' }, sortOrder: 0 });
    await insertar({
      key: 'testimonials.b',
      draft: { author: 'B' },
      published: { author: 'B' },
      status: 'published',
      sortOrder: 1,
    });
    await insertar({
      key: 'testimonials.c',
      draft: { author: 'C2' },
      published: { author: 'C' },
      status: 'changed',
      sortOrder: 2,
    });

    const estados = (await listCollectionItems('testimonials')).map((e) => e.estado);

    expect(estados).toEqual(['sin-publicar', 'publicado', 'con-cambios']);
  });

  it('una colección que no existe devuelve una lista vacía, no lanza', async () => {
    expect(await listCollectionItems('inventada')).toEqual([]);
  });

  it('un título larguísimo se recorta', () => {
    // El `titleField` de una colección puede ser un testimonio entero; sin recortar, la lista
    // queda inservible.
    const titulo = tituloDeElemento({ author: 'x'.repeat(200) }, 'author');

    expect(titulo.length).toBeLessThanOrEqual(81);
    expect(titulo.endsWith('…')).toBe(true);
  });

  it('un borrador que no es un objeto no tumba la lista', () => {
    for (const basura of [null, undefined, 'texto', 42]) {
      expect(tituloDeElemento(basura, 'author')).toBe('Sin título');
    }
  });
});
