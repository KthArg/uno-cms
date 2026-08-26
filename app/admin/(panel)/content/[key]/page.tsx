import { notFound } from 'next/navigation';
import {
  crearTokenDeVistaPreviaRemota,
  createPreviewToken,
  publish,
  revertDraft,
  saveDraft,
} from '@/cms/actions';
import { definicionDeColeccion, tituloDeElemento } from '@/cms/core/collections';
import { readEntryForEditor, schemaForType } from '@/cms/core/content';
import { listMedia } from '@/cms/core/media';
import { usarAlmacenLocal } from '@/cms/security/almacen-local';
import { TAMANO_MAXIMO_BYTES, TIPOS_PERMITIDOS } from '@/cms/security/uploads';
import { EntryEditor } from '@/cms/ui/EntryEditor';
import type { RelevoDeToken } from '@/cms/ui/PreviewFrame';
import type { ResultadoGuardado } from '@/cms/ui/useAutosave';
import { destinoDeVistaPrevia, urlDeVistaPreviaRemota } from '@/cms/vista-previa-remota';

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

  // El nombre que ve el editor.
  //
  // Para un elemento de colección, `schema.label` no existe —la etiqueta vive en la definición
  // de la colección, no en su esquema— así que la versión anterior enseñaba la clave técnica
  // entera: «Testimonios: testimonials.3f2a-…». Eso es justo la jerga que §9 prohíbe, y encima
  // la más fea posible.
  const coleccion = definicionDeColeccion(entrada.type);
  const nombre =
    coleccion === null
      ? (schema.label ?? entrada.key)
      : `${coleccion.label}: ${tituloDeElemento(entrada.draft, coleccion.titleField)}`;
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

  async function deshacerCambios(): Promise<ResultadoGuardado> {
    'use server';

    const resultado = await revertDraft({ key });

    if (resultado.ok) return { ok: true, version: resultado.data.version };

    return { ok: false, code: resultado.code, message: resultado.message };
  }

  /**
   * Pedir un token remoto nuevo sin recargar la pantalla (spec 08 §4.2).
   *
   * Solo se le pasa al panel cuando la fase está encendida. Devuelve `{ ok: false }` sin motivo:
   * la pantalla dice lo mismo pase lo que pase —que la vista previa dejó de actualizarse— y el
   * motivo interno no le sirve a quien lo lee.
   */
  async function renovarTokenRemoto(): Promise<RelevoDeToken> {
    'use server';

    const resultado = await crearTokenDeVistaPreviaRemota({ key });
    if (!resultado.ok) return { ok: false };

    return {
      ok: true,
      token: resultado.data.token,
      vidaEnSegundos: resultado.data.expiresInSeconds,
    };
  }

  /**
   * El enlace del iframe (SPEC §6.1 paso 1, spec 08 §4.5).
   *
   * Dos caminos y **una sola diferencia**: si hay web remota configurada, el token es el de
   * quince minutos y el iframe apunta fuera; si no, todo sigue exactamente como antes de esta
   * fase. Sin `PREVIEW_ORIGINS` no se llega ni a preguntar por la otra action.
   *
   * Si el token no se pudo crear —el limitador, un fallo puntual— la pantalla sigue sirviendo
   * para escribir y publicar: la vista previa es lo que distingue a este CMS, no lo que lo
   * sostiene.
   */
  const urlRemota = urlDeVistaPreviaRemota();

  const enlaceDeVistaPrevia =
    urlRemota === null
      ? await createPreviewToken({ key })
      : await crearTokenDeVistaPreviaRemota({ key });

  const destino = enlaceDeVistaPrevia.ok
    ? destinoDeVistaPrevia(enlaceDeVistaPrevia.data.token, urlRemota)
    : null;
  const vidaDelToken = enlaceDeVistaPrevia.ok ? enlaceDeVistaPrevia.data.expiresInSeconds : 0;

  const vistaPrevia =
    destino === null
      ? {}
      : {
          urlDeVistaPrevia: destino.src,
          ...(destino.origen === null ? {} : { origenDeVistaPrevia: destino.origen }),
          // `destino` solo existe si el token se creó, así que aquí la vida siempre está. El
          // `?? 0` que tenía antes era una rama muerta —y con un valor que habría dado un
          // token nacido caducado si alguna vez se hubiera alcanzado—.
          ...(urlRemota === null
            ? {}
            : {
                renovarTokenDeVistaPrevia: renovarTokenRemoto,
                vidaDelTokenSegundos: vidaDelToken,
              }),
        };

  return (
    <EntryEditor
      nombreSeccion={nombre}
      schema={schema}
      valoresIniciales={entrada.draft}
      versionInicial={entrada.version}
      guardar={guardarBorrador}
      publicar={publicarEntrada}
      deshacer={deshacerCambios}
      entryKey={key}
      // Deshacer solo tiene sentido si hay algo publicado a lo que volver. Sin ello,
      // `revertDraft` devuelve NEVER_PUBLISHED (#79) y ofrecerlo sería un botón que solo
      // sirve para dar un error.
      sePuedeDeshacer={entrada.estado !== 'sin-publicar'}
      {...vistaPrevia}
      imagenes={imagenes}
      tiposAceptados={[...TIPOS_PERMITIDOS]}
      tamanoMaximoBytes={TAMANO_MAXIMO_BYTES}
      // Lo decide el servidor y viaja como dato. El navegador no mira ninguna variable de
      // entorno para esto: no puede contradecir a quien va a recibir el fichero.
      almacenLocal={usarAlmacenLocal()}
    />
  );
}
