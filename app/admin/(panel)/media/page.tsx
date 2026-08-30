import { auth } from '@/cms/auth';
import { deleteMedia, registrarImagen } from '@/cms/actions';
import { listMedia } from '@/cms/core/media';
import { MediaLibrary } from '@/cms/ui/MediaLibrary';
import { usarAlmacenLocal } from '@/cms/security/almacen-local';
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

  /** Anota una imagen recién subida sin esperar al aviso de Vercel (issue #205, ADR-705). */
  async function registrar(imagen: {
    url: string;
    pathname: string;
    filename: string;
    mimeType: string;
  }): Promise<{ ok: boolean }> {
    'use server';

    return { ok: (await registrarImagen(imagen)).ok };
  }

  async function borrar(id: string): Promise<{ ok: boolean; message?: string }> {
    'use server';

    const resultado = await deleteMedia({ id });

    return resultado.ok ? { ok: true } : { ok: false, message: resultado.message };
  }

  return (
    <MediaLibrary
      imagenes={imagenes}
      registrar={registrar}
      tiposAceptados={[...TIPOS_PERMITIDOS]}
      tamanoMaximoBytes={TAMANO_MAXIMO_BYTES}
      almacenLocal={usarAlmacenLocal()}
      puedeBorrar={session?.user.role === 'admin'}
      onBorrar={borrar}
    />
  );
}
