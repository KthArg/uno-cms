import { notFound } from 'next/navigation';
import { publish, saveDraft } from '@/cms/actions';
import { readEntryForEditor, schemaForType } from '@/cms/core/content';
import { listMedia } from '@/cms/core/media';
import { TAMANO_MAXIMO_BYTES, TIPOS_PERMITIDOS } from '@/cms/security/uploads';
import { EntryEditor } from '@/cms/ui/EntryEditor';
import type { ResultadoGuardado } from '@/cms/ui/useAutosave';

/**
 * El editor de una entrada (SPEC §3, §8, §9).
 *
 * Dinámico: enseña un borrador que cambia cada pocos segundos, así que una versión cacheada
 * mostraría el texto de otra sesión.
 */
export const dynamic = 'force-dynamic';

export default async function EditorDeEntrada({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const entrada = await readEntryForEditor(key);
  // 404 y no un mensaje: una clave que no existe no tiene pantalla, y distinguir "no existe"
  // de "no puedes" le diría a quien pruebe qué claves hay.
  if (entrada === null) notFound();

  const schema = schemaForType(entrada.type);
  if (schema === null) notFound();

  const nombre = schema.label ?? entrada.key;
  const imagenes = await listMedia();

  async function guardarBorrador(
    valores: Record<string, unknown>,
    version: number
  ): Promise<ResultadoGuardado> {
    'use server';

    const resultado = await saveDraft({ key, data: valores, version });

    if (resultado.ok) return { ok: true, version: resultado.data.version };

    return {
      ok: false,
      code: resultado.code,
      message: resultado.message,
      ...(resultado.fields === undefined ? {} : { fields: resultado.fields }),
    };
  }

  async function publicarEntrada(version: number): Promise<ResultadoGuardado> {
    'use server';

    const resultado = await publish({ key, version });

    if (resultado.ok) return { ok: true };

    return {
      ok: false,
      code: resultado.code,
      message: resultado.message,
      ...(resultado.fields === undefined ? {} : { fields: resultado.fields }),
    };
  }

  return (
    <EntryEditor
      nombreSeccion={nombre}
      schema={schema}
      valoresIniciales={entrada.draft}
      versionInicial={entrada.version}
      guardar={guardarBorrador}
      publicar={publicarEntrada}
      imagenes={imagenes}
      tiposAceptados={[...TIPOS_PERMITIDOS]}
      tamanoMaximoBytes={TAMANO_MAXIMO_BYTES}
    />
  );
}
