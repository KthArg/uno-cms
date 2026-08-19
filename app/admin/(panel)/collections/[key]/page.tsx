import { notFound } from 'next/navigation';
import { createItem, deleteItem, reorderItems } from '@/cms/actions';
import { auth } from '@/cms/auth';
import { definicionDeColeccion, listCollectionItems } from '@/cms/core/collections';
import { CollectionScreen } from '@/cms/ui/CollectionScreen';

/**
 * La pantalla de una colección (SPEC §3, §5.3, §9).
 *
 * El panel **ya enlazaba aquí** desde #108 y esta ruta no existía: cada tarjeta de colección
 * llevaba a un 404. Lo encontró la auditoría de pendientes, no una revisión, porque el enlace
 * se escribió pensando en una pantalla que se daba por planificada y no lo estaba.
 */
export const dynamic = 'force-dynamic';

export default async function PantallaDeColeccion({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const definicion = definicionDeColeccion(key);
  // Una colección que no está en `cms.config.ts` no tiene pantalla. 404 y no un mensaje: es lo
  // mismo que hace el editor de una entrada, y distinguir "no existe" de "no puedes" diría qué
  // claves hay.
  if (definicion === null) notFound();

  const session = await auth();
  const elementos = await listCollectionItems(key);

  async function crear(): Promise<{ ok: boolean; key?: string; message?: string }> {
    'use server';

    const resultado = await createItem({ collection: key });

    return resultado.ok
      ? { ok: true, key: resultado.data.key }
      : { ok: false, message: resultado.message };
  }

  async function reordenar(orderedKeys: string[]): Promise<{ ok: boolean; message?: string }> {
    'use server';

    const resultado = await reorderItems({ collection: key, orderedKeys });

    return resultado.ok ? { ok: true } : { ok: false, message: resultado.message };
  }

  async function eliminar(elementKey: string): Promise<{ ok: boolean; message?: string }> {
    'use server';

    const resultado = await deleteItem({ key: elementKey });

    return resultado.ok ? { ok: true } : { ok: false, message: resultado.message };
  }

  return (
    <CollectionScreen
      nombreColeccion={definicion.label}
      elementos={elementos}
      onCrear={crear}
      onReordenar={reordenar}
      onEliminar={eliminar}
      // Eliminar es de administración, igual que en la biblioteca de imágenes: quita contenido
      // que puede estar publicado y no hay deshacer.
      puedeEliminar={session?.user.role === 'admin'}
    />
  );
}
