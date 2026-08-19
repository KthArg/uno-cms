import { expect, it } from 'vitest';
import { campoDeResumen, listRevisions, resumenDeRevision } from '@/cms/core/history';
import { getDb, revisions, users } from '@/cms/db';
import { describeIntegration } from './env';

/** T-E-1: el historial de una entrada (SPEC §4, §9). */

async function crearRevision(entryKey: string, data: Record<string, unknown>, autor?: string) {
  const [fila] = await getDb()
    .insert(revisions)
    .values({ entryKey, data, ...(autor === undefined ? {} : { publishedBy: autor }) })
    .returning();
  return fila!;
}

describeIntegration('historial', () => {
  it('T-E-1: lista las revisiones de esa entrada, no de otras', async () => {
    await crearRevision('hero', { title: 'La del hero' });
    await crearRevision('about', { heading: 'La de about' });

    const revisiones = await listRevisions('hero', 'hero');

    // Sin el filtro se mezclarían las versiones de todas las secciones, y restaurar desde ahí
    // metería el texto de una dentro de otra. La action ya lo impide (#79), pero una pantalla
    // que ofrece lo que la action va a rechazar es una pantalla que miente.
    expect(revisiones).toHaveLength(1);
    expect(revisiones[0]?.resumen).toBe('La del hero');
  });

  it('la más reciente va primero', async () => {
    await crearRevision('hero', { title: 'Primera' });
    await crearRevision('hero', { title: 'Segunda' });

    const resumenes = (await listRevisions('hero', 'hero')).map((r) => r.resumen);

    expect(resumenes[0]).toBe('Segunda');
  });

  it('enseña quién publicó cada versión', async () => {
    const [autora] = await getDb()
      .insert(users)
      .values({ email: 'ana@ejemplo.com', name: 'Ana', passwordHash: 'x', role: 'editor' })
      .returning();
    await crearRevision('hero', { title: 'Con autora' }, autora!.id);

    expect((await listRevisions('hero', 'hero'))[0]?.autor).toBe('Ana');
  });

  it('una revisión de una cuenta borrada no deja la fila sin nada que decir', async () => {
    // `published_by` es `set null`: borrar a un editor no se lleva por delante el historial.
    await crearRevision('hero', { title: 'Sin autora' });

    const revision = (await listRevisions('hero', 'hero'))[0];
    expect(revision?.autor).toBeNull();
    expect(revision?.resumen).toBe('Sin autora');
  });

  it('sin revisiones devuelve una lista vacía, no lanza', async () => {
    expect(await listRevisions('hero', 'hero')).toEqual([]);
  });
});

describeIntegration('qué se enseña de cada revisión', () => {
  it('en un singleton, el primer campo de texto', () => {
    // Una lista de ocho fechas no permite elegir: quien abre el historial busca "aquella
    // versión en la que el titular decía otra cosa".
    expect(campoDeResumen('hero')).toBe('title');
  });

  it('en una colección, el titleField que señala la configuración', () => {
    // SPEC §5.1: "qué mostrar en la lista del admin".
    expect(campoDeResumen('testimonials')).toBe('author');
  });

  it('un tipo desconocido no tiene campo de resumen y no revienta', () => {
    expect(campoDeResumen('inventado')).toBeNull();
    expect(resumenDeRevision({ x: 1 }, null)).toBe('Sin contenido');
  });

  it('un resumen larguísimo se recorta', () => {
    const resumen = resumenDeRevision({ title: 'x'.repeat(300) }, 'title');

    expect(resumen.length).toBeLessThanOrEqual(91);
    expect(resumen.endsWith('…')).toBe(true);
  });

  it('un campo vacío o ausente dice «Sin contenido»', () => {
    for (const data of [{}, { title: '' }, { title: '   ' }, null, 'texto']) {
      expect(resumenDeRevision(data, 'title')).toBe('Sin contenido');
    }
  });
});
