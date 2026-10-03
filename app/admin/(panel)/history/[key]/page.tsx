import { notFound } from 'next/navigation';
import { restoreRevision } from '@/cms/actions';
import { definicionDeColeccion, tituloDeElemento } from '@/cms/core/collections';
import { readEntryForEditor, schemaForType } from '@/cms/core/content';
import { listRevisions } from '@/cms/core/history';
import { idiomaDeLaPantalla } from '@/cms/core/idioma-del-panel';
import { HistoryScreen } from '@/cms/ui/HistoryScreen';

/**
 * El historial de una entrada (SPEC §3, §9).
 *
 * Dinámico: la lista cambia con cada publicación, y una versión cacheada escondería justo la
 * revisión que alguien acaba de crear.
 */
export const dynamic = 'force-dynamic';

export default async function HistorialDeEntrada({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const idioma = await idiomaDeLaPantalla();

  const entrada = await readEntryForEditor(key, idioma.codigo);
  if (entrada === null) notFound();

  const schema = schemaForType(entrada.type);
  if (schema === null) notFound();

  const coleccion = definicionDeColeccion(entrada.type);
  const nombre =
    coleccion === null
      ? (schema.label ?? entrada.key)
      : `${coleccion.label}: ${tituloDeElemento(entrada.draft, coleccion.titleField)}`;

  const revisiones = await listRevisions(key, entrada.type, idioma.codigo);

  async function restaurar(revisionId: string): Promise<{ ok: boolean; message?: string }> {
    'use server';

    const resultado = await restoreRevision({ key, revisionId, idioma: idioma.codigo });

    return resultado.ok ? { ok: true } : { ok: false, message: resultado.message };
  }

  return (
    <HistoryScreen
      key={idioma.codigo}
      {...(idioma.etiqueta === undefined ? {} : { idioma: idioma.etiqueta })}
      nombreSeccion={nombre}
      entryKey={key}
      revisiones={revisiones}
      onRestaurar={restaurar}
      // Si el borrador difiere de lo publicado, restaurar se lo lleva por delante y hay que
      // decirlo **antes**, no después.
      hayCambiosSinPublicar={entrada.estado === 'con-cambios'}
    />
  );
}
