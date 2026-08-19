import { expect, it } from 'vitest';
import { listSections } from '@/cms/core/content';
import { contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/** T-A-1: el estado que ve el editor en el dashboard (SPEC §9). */

async function insertar(opciones: {
  key: string;
  type: string;
  published?: Record<string, unknown> | null;
  status?: 'draft' | 'published' | 'changed';
}) {
  await getDb()
    .insert(contentEntries)
    .values({
      key: opciones.key,
      type: opciones.type,
      draft: {},
      published: opciones.published ?? null,
      status: opciones.status ?? 'draft',
    });
}

function buscar(secciones: Awaited<ReturnType<typeof listSections>>, key: string) {
  return secciones.find((seccion) => seccion.key === key);
}

describeIntegration('estado de las secciones', () => {
  it('T-A-1: una sección sin fila aparece como sin publicar', async () => {
    // La sección existe en la configuración y la landing la está enseñando con valores
    // vacíos: eso es "sin publicar", no un error ni una ausencia.
    const secciones = await listSections();

    expect(buscar(secciones, 'hero')).toMatchObject({ estado: 'sin-publicar' });
  });

  it('T-A-1: publicada, con cambios y sin publicar se distinguen', async () => {
    await insertar({ key: 'hero', type: 'hero', published: { title: 'x' }, status: 'published' });
    await insertar({ key: 'about', type: 'about', published: { heading: 'y' }, status: 'changed' });
    await insertar({ key: 'seo', type: 'seo', published: null, status: 'changed' });

    const secciones = await listSections();

    expect(buscar(secciones, 'hero')).toMatchObject({ estado: 'publicado' });
    expect(buscar(secciones, 'about')).toMatchObject({ estado: 'con-cambios' });
    // El caso que la lectura ingenua se salta: `saveDraft` deja `changed` siempre, también en
    // una sección que nunca se publicó. Mostrarla como "cambios sin publicar" sugeriría que
    // hay una versión pública que difiere.
    expect(buscar(secciones, 'seo')).toMatchObject({ estado: 'sin-publicar' });
  });

  it('T-A-1: usa el nombre visible de la sección, no la clave', async () => {
    const secciones = await listSections();

    expect(buscar(secciones, 'hero')?.nombre).toBe('Portada');
    expect(buscar(secciones, 'testimonials')?.nombre).toBe('Testimonios');
  });

  it('T-A-1: una lista con un elemento a medias no está publicada', async () => {
    await insertar({
      key: 'testimonials.a',
      type: 'testimonials',
      published: { author: 'Ana' },
      status: 'published',
    });
    await insertar({ key: 'testimonials.b', type: 'testimonials', published: null });

    const lista = buscar(await listSections(), 'testimonials');

    // Con un elemento a medias, lo que el visitante ve no es lo que el editor tiene, y eso es
    // exactamente lo que la tarjeta debe avisar.
    expect(lista).toMatchObject({ estado: 'con-cambios', elementos: 2 });
  });

  it('T-A-1: una lista con todo publicado sí lo está', async () => {
    await insertar({
      key: 'testimonials.a',
      type: 'testimonials',
      published: { author: 'Ana' },
      status: 'published',
    });

    expect(buscar(await listSections(), 'testimonials')).toMatchObject({
      estado: 'publicado',
      elementos: 1,
    });
  });

  it('T-A-1: una lista vacía aparece como sin publicar y con cero elementos', async () => {
    expect(buscar(await listSections(), 'faqs')).toMatchObject({
      estado: 'sin-publicar',
      elementos: 0,
    });
  });

  it('salen todas las secciones de la configuración, singletons y listas', async () => {
    const secciones = await listSections();

    expect(secciones.filter((seccion) => seccion.tipo === 'singleton')).toHaveLength(3);
    expect(secciones.filter((seccion) => seccion.tipo === 'coleccion').length).toBeGreaterThan(0);
  });

  it('una fila de un tipo que ya no está en la configuración no aparece', async () => {
    // Queda de una sección que se quitó de `cms.config.ts`. Enseñarla en el panel llevaría a
    // una pantalla que no puede existir, porque el formulario se genera desde la config.
    await insertar({ key: 'fantasma', type: 'fantasma', published: { x: 1 } });

    expect(buscar(await listSections(), 'fantasma')).toBeUndefined();
  });
});
