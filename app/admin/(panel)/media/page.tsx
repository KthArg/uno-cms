import { auth } from '@/cms/auth';
import { deleteMedia } from '@/cms/actions';
import { listMedia } from '@/cms/core/media';
import { MediaLibrary } from '@/cms/ui/MediaLibrary';
import { TAMANO_MAXIMO_BYTES, TIPOS_PERMITIDOS } from '@/cms/security/uploads';

/**
 * La biblioteca de imágenes (SPEC §3, ADR-005).
 *
 * Dinámica: enseña lo que hay ahora mismo, y quien acaba de subir una imagen espera verla.
 */
export const dynamic = 'force-dynamic';

export default async function BibliotecaDeImagenes() {
  const session = await auth();
  const imagenes = await listMedia();

  async function borrar(id: string): Promise<{ ok: boolean; message?: string }> {
    'use server';

    const resultado = await deleteMedia({ id });

    return resultado.ok ? { ok: true } : { ok: false, message: resultado.message };
  }

  return (
    <MediaLibrary
      imagenes={imagenes}
      tiposAceptados={[...TIPOS_PERMITIDOS]}
      tamanoMaximoBytes={TAMANO_MAXIMO_BYTES}
      puedeBorrar={session?.user.role === 'admin'}
      onBorrar={borrar}
    />
  );
}
