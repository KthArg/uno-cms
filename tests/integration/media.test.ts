import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deleteMedia, updateMediaAlt } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { listMedia } from '@/cms/core/media';
import { contentEntries, getDb, media, settings, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-D-6 y las actions de la biblioteca (SPEC §5.3, ADR-005).
 *
 * El cliente de Vercel Blob se sustituye: necesita un token real y una red, y lo que hay que
 * demostrar aquí no es que Vercel borre —eso es cosa suya— sino **el orden**: que el fichero se
 * borra antes que la fila, y que si el almacén falla la fila se queda.
 */

const borrarEnBlob = vi.hoisted(() => vi.fn());

vi.mock('@vercel/blob', () => ({ del: borrarEnBlob }));

async function crearUsuario(role: 'admin' | 'editor') {
  const [user] = await getDb()
    .insert(users)
    .values({ email: `${role}@ejemplo.com`, name: 'Persona', passwordHash: 'x', role })
    .returning();

  setSessionProviderForTests(() => Promise.resolve({ userId: user!.id, email: user!.email, role }));
  return user!;
}

async function crearImagen(pathname = 'media/2026-01/una.png') {
  const [fila] = await getDb()
    .insert(media)
    .values({
      url: `https://x.public.blob.vercel-storage.com/${pathname}`,
      pathname,
      filename: 'una.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
    })
    .returning();
  return fila!;
}

describeIntegration('biblioteca de imágenes', () => {
  beforeEach(() => {
    resetBucketsForTests();
    borrarEnBlob.mockReset();
    borrarEnBlob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setSessionProviderForTests(null);
    vi.restoreAllMocks();
  });

  it('T-D-6: borrar un medio borra también el fichero del almacén', async () => {
    await crearUsuario('admin');
    const imagen = await crearImagen();

    const resultado = await deleteMedia({ id: imagen.id });

    expect(resultado.ok).toBe(true);
    // Sin esto se paga almacenamiento que nadie ve: la fila era la única forma de saber que el
    // fichero existía.
    expect(borrarEnBlob).toHaveBeenCalledWith(imagen.url);
    expect(await getDb().select().from(media)).toHaveLength(0);
  });

  it('T-D-6: si el almacén falla, la fila NO se borra', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await crearUsuario('admin');
    const imagen = await crearImagen();
    borrarEnBlob.mockRejectedValue(new Error('el almacén no responde'));

    const resultado = await deleteMedia({ id: imagen.id });

    expect(resultado).toMatchObject({ ok: false, code: 'INTERNAL' });
    // Es el orden que importa. Borrando la fila primero, un fallo aquí dejaría un fichero que
    // nadie puede volver a encontrar; en este orden queda visible en la biblioteca y se puede
    // reintentar. Un residuo que se ve es recuperable; uno que no, no.
    expect(await getDb().select().from(media)).toHaveLength(1);
    expect(errores).toHaveBeenCalled();
  });

  /** Una entrada que usa la imagen, en el borrador o en lo publicado, y en el idioma que toque. */
  async function usarEn(
    donde: 'draft' | 'published',
    valor: Record<string, unknown>,
    locale = ''
  ): Promise<void> {
    const documento = { titulo: 'Portada', fondo: valor };
    await getDb()
      .insert(contentEntries)
      .values({
        key: `hero-${donde}-${locale || 'base'}`,
        type: 'hero',
        locale,
        draft: donde === 'draft' ? documento : {},
        published: donde === 'published' ? documento : null,
        status: donde === 'draft' ? 'draft' : 'published',
      });
  }

  it.each([
    [
      'en un borrador, por mediaId',
      'draft' as const,
      (id: string) => ({ mediaId: id, url: '', alt: 'x' }),
      '',
    ],
    [
      'en lo publicado, por mediaId',
      'published' as const,
      (id: string) => ({ mediaId: id, url: '', alt: 'x' }),
      '',
    ],
    [
      'en lo publicado de otro idioma',
      'published' as const,
      (id: string) => ({ mediaId: id, url: '', alt: 'x' }),
      'en',
    ],
  ])('T-S-15: una imagen usada %s no se borra', async (_caso, donde, valor, locale) => {
    await crearUsuario('admin');
    const imagen = await crearImagen();
    await usarEn(donde, valor(imagen.id), locale);

    const resultado = await deleteMedia({ id: imagen.id });

    expect(resultado).toMatchObject({ ok: false, code: 'MEDIA_IN_USE' });
    // Ni el fichero ni la fila: la web sigue sirviendo la imagen.
    expect(borrarEnBlob).not.toHaveBeenCalled();
    expect(await getDb().select().from(media)).toHaveLength(1);
  });

  it('T-S-15: también si solo coincide la url', async () => {
    await crearUsuario('admin');
    const imagen = await crearImagen();
    await usarEn('draft', { mediaId: 'otro-id', url: imagen.url, alt: 'x' });

    expect(await deleteMedia({ id: imagen.id })).toMatchObject({ code: 'MEDIA_IN_USE' });
  });

  it('T-S-15: tampoco la que es la imagen por defecto al compartir (seo.ogImageUrl)', async () => {
    await crearUsuario('admin');
    const imagen = await crearImagen();
    await getDb()
      .insert(settings)
      .values({ key: 'seo', value: { title: 'Sitio', ogImageUrl: imagen.url } });

    expect(await deleteMedia({ id: imagen.id })).toMatchObject({ code: 'MEDIA_IN_USE' });
    expect(borrarEnBlob).not.toHaveBeenCalled();
  });

  it('T-S-15: y una que nadie usa se borra, aunque haya contenido con otras', async () => {
    await crearUsuario('admin');
    const usada = await crearImagen('media/2026-01/usada.png');
    const libre = await crearImagen('media/2026-01/libre.png');
    await usarEn('published', { mediaId: usada.id, url: usada.url, alt: 'x' });

    expect((await deleteMedia({ id: libre.id })).ok).toBe(true);
    expect(borrarEnBlob).toHaveBeenCalledWith(libre.url);
  });

  it('un editor no puede borrar imágenes', async () => {
    await crearUsuario('editor');
    const imagen = await crearImagen();

    const resultado = await deleteMedia({ id: imagen.id });

    expect(resultado).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(borrarEnBlob).not.toHaveBeenCalled();
    expect(await getDb().select().from(media)).toHaveLength(1);
  });

  it('borrar una imagen que no existe no toca el almacén', async () => {
    await crearUsuario('admin');

    const resultado = await deleteMedia({ id: '00000000-0000-4000-8000-000000000000' });

    expect(resultado).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(borrarEnBlob).not.toHaveBeenCalled();
  });

  it('el borrado queda auditado con la ruta del fichero', async () => {
    await crearUsuario('admin');
    const imagen = await crearImagen();

    await deleteMedia({ id: imagen.id });

    const { auditLog } = await import('@/cms/db');
    const [fila] = await getDb().select().from(auditLog);
    expect(fila).toMatchObject({ action: 'media.delete', targetType: 'media' });
    expect(fila?.meta).toMatchObject({ pathname: imagen.pathname });
  });

  it('un editor sí puede describir una imagen', async () => {
    // Describir es contenido —lo que lee quien no ve la imagen— y le corresponde a quien
    // escribe, no solo a administración.
    await crearUsuario('editor');
    const imagen = await crearImagen();

    const resultado = await updateMediaAlt({ id: imagen.id, alt: 'Un gato en una silla' });

    expect(resultado.ok).toBe(true);
    const [fila] = await getDb().select().from(media).where(eq(media.id, imagen.id));
    expect(fila?.alt).toBe('Un gato en una silla');
  });

  it('la biblioteca devuelve lo más reciente primero', async () => {
    await crearUsuario('admin');
    await crearImagen('media/2026-01/primera.png');
    await crearImagen('media/2026-01/segunda.png');

    const imagenes = await listMedia();

    // Quien abre la biblioteca casi siempre busca lo que acaba de subir.
    expect(imagenes[0]?.filename).toBe('una.png');
    expect(imagenes).toHaveLength(2);
  });
});
