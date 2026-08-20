import { eq } from 'drizzle-orm';
import { beforeEach, expect, it, vi } from 'vitest';
import { previewContent } from '@/cms/core/preview-content';
import { contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * ADR-501: la vista previa carga el borrador **solo** de la clave del token.
 *
 * Es lo que hace que la clave que viaja dentro de la firma (#82) acote algo. Sin esto, un enlace
 * filtrado enseñaría todo lo que hay sin publicar en el sitio durante dos horas.
 */

async function ponerEntrada(
  key: string,
  type: string,
  draft: Record<string, unknown>,
  published: Record<string, unknown> | null
) {
  await getDb()
    .insert(contentEntries)
    .values({
      key,
      type,
      draft,
      published,
      status: published === null ? 'draft' : 'changed',
    })
    .onConflictDoUpdate({ target: contentEntries.key, set: { draft, published } });
}

describeIntegration('contenido de la vista previa', () => {
  beforeEach(async () => {
    await ponerEntrada('hero', 'hero', { title: 'BORRADOR hero' }, { title: 'publicado hero' });
    await ponerEntrada(
      'about',
      'about',
      { heading: 'BORRADOR about' },
      { heading: 'publicado about' }
    );
  });

  it('el borrador solo de la clave autorizada; el resto, publicado', async () => {
    const contenido = await previewContent('hero');

    expect((contenido['hero'] as { title: string }).title).toBe('BORRADOR hero');
    // **Lo que hace útil este test**: si `about` saliera en borrador, la clave del token no
    // acotaría nada y un enlace compartido sería una llave maestra.
    expect((contenido['about'] as { heading: string }).heading).toBe('publicado about');
  });

  it('una clave que ya no existe en la configuración no rompe nada', async () => {
    // La configuración pudo cambiar después de emitir el token. Responder con un error
    // castigaría a quien no ha hecho nada raro: se sirve la landing publicada.
    const contenido = await previewContent('seccion-que-ya-no-existe');

    expect((contenido['hero'] as { title: string }).title).toBe('publicado hero');
  });

  it('un elemento de colección sale en borrador y sus vecinos publicados', async () => {
    await ponerEntrada(
      'testimonials.uno',
      'testimonials',
      { author: 'BORRADOR uno', quote: 'x' },
      { author: 'publicado uno', quote: 'x' }
    );
    await ponerEntrada(
      'testimonials.dos',
      'testimonials',
      { author: 'BORRADOR dos', quote: 'y' },
      { author: 'publicado dos', quote: 'y' }
    );

    const contenido = await previewContent('testimonials.uno');
    const lista = contenido['testimonials'] as { author: string }[];

    expect(lista.map((item) => item.author).sort()).toEqual(['BORRADOR uno', 'publicado dos']);
  });

  it('un token de la colección entera sí saca todos sus elementos en borrador', async () => {
    await ponerEntrada(
      'testimonials.uno',
      'testimonials',
      { author: 'BORRADOR uno', quote: 'x' },
      { author: 'publicado uno', quote: 'x' }
    );
    await ponerEntrada(
      'testimonials.dos',
      'testimonials',
      { author: 'BORRADOR dos', quote: 'y' },
      { author: 'publicado dos', quote: 'y' }
    );

    const lista = (await previewContent('testimonials'))['testimonials'] as { author: string }[];

    expect(lista.map((item) => item.author).sort()).toEqual(['BORRADOR dos', 'BORRADOR uno']);
  });

  it('un elemento sin publicar solo aparece si es el que autoriza el token', async () => {
    await ponerEntrada('testimonials.nuevo', 'testimonials', { author: 'Recién creado' }, null);
    await ponerEntrada(
      'testimonials.otro',
      'testimonials',
      { author: 'BORRADOR otro' },
      { author: 'publicado otro', quote: 'y' }
    );

    const conSuToken = (await previewContent('testimonials.nuevo'))['testimonials'] as {
      author: string;
    }[];
    expect(conSuToken.map((item) => item.author)).toContain('Recién creado');

    // Con el token de otro elemento, el recién creado **no** se asoma: ese token no lo autoriza.
    const conOtroToken = (await previewContent('testimonials.otro'))['testimonials'] as {
      author: string;
    }[];
    expect(conOtroToken.map((item) => item.author)).not.toContain('Recién creado');
  });

  it('una clave con el prefijo parecido no se cuela', async () => {
    // `startsWith` haría que un token de `testimonials2.x` tocara `testimonials`.
    await ponerEntrada(
      'testimonials.uno',
      'testimonials',
      { author: 'BORRADOR uno', quote: 'x' },
      { author: 'publicado uno', quote: 'x' }
    );

    const lista = (await previewContent('testimonials2.uno'))['testimonials'] as {
      author: string;
    }[];

    expect(lista.map((item) => item.author)).toEqual(['publicado uno']);
  });

  it('T-I-4: componer la vista previa no escribe nada', async () => {
    const antes = await getDb().select().from(contentEntries).where(eq(contentEntries.key, 'hero'));

    await previewContent('hero');

    const despues = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, 'hero'));

    // La vista previa mira; no toca. Sin esta afirmación, una escritura accidental —marcar como
    // visto, tocar `updated_at`— pasaría desapercibida hasta que alguien mirase la tabla.
    expect(despues).toEqual(antes);
  });

  it('el borrador no se cachea: dos lecturas seguidas ven el cambio', async () => {
    const primera = await previewContent('hero');
    expect((primera['hero'] as { title: string }).title).toBe('BORRADOR hero');

    await getDb()
      .update(contentEntries)
      .set({ draft: { title: 'BORRADOR nuevo' } })
      .where(eq(contentEntries.key, 'hero'));

    const segunda = await previewContent('hero');

    // Si el borrador se cachease, el editor vería su propio texto con retraso — que es la forma
    // más rápida de que deje de fiarse del CMS.
    expect((segunda['hero'] as { title: string }).title).toBe('BORRADOR nuevo');
  });
});

describeIntegration('la ruta de vista previa', () => {
  beforeEach(() => {
    vi.stubEnv('APP_SECRET', 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres');
  });

  it('T-I-2: un token inválido, caducado o de otro propósito dan lo mismo', async () => {
    const { signToken, verifyToken } = await import('@/cms/security/tokens');

    // Lo que se comprueba es que **el resultado es indistinguible**, que es lo que la ruta
    // convierte en 404. Distinguirlos la volvería un comprobador de enlaces ajenos.
    const basura = verifyToken('preview', 'no-es-un-token');
    const deOtroProposito = verifyToken('preview', signToken('password-reset', { key: 'hero' }));
    const caducado = verifyToken('preview', signToken('preview', { key: 'hero' }, -10));

    expect(basura).toEqual({ ok: false });
    expect(deOtroProposito).toEqual({ ok: false });
    expect(caducado).toEqual({ ok: false });
  });
});
