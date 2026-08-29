import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '@/cms/auth';
import { esPathnameGenerado } from '@/cms/nombres-de-subida';
import { getDb, media } from '@/cms/db';
import { audit } from '@/cms/security/audit';
import { mensajeNuestro, SUBIDA_FALLIDA } from '@/cms/mensajes-de-subida';
import { decidirSubida, nombreLegible, TIPOS_PERMITIDOS } from '@/cms/security/uploads';

/**
 * `POST /api/media/upload` — el token firmado de subida (SPEC §5.3, ADR-005).
 *
 * ## Quién decide, y dónde
 *
 * El navegador sube **directamente a Vercel Blob**, sin pasar el fichero por nuestro servidor.
 * Eso es lo que hace viable subir imágenes de diez megas desde una función serverless, y
 * significa que **esta ruta es el único momento en que podemos decir que no**: después ya no
 * hay a quién decírselo.
 *
 * Por eso todo se comprueba aquí, antes de emitir el token:
 *
 * 1. **Sesión.** Sin ella no se emite nada. Un endpoint que reparte permisos de escritura en
 *    un almacén sin comprobar quién llama es un almacén de cualquiera.
 * 2. **Tipo y tamaño**, con la allowlist de `cms/security/uploads.ts`. El `accept` del
 *    formulario viaja en el cliente: es comodidad para quien sube, no una defensa.
 * 3. **El nombre lo ponemos nosotros.** Nunca el del usuario.
 *
 * ## La comprobación va ANTES de llamar a Vercel
 *
 * La primera versión validaba dentro de `onBeforeGenerateToken`, que es donde la documentación
 * de Blob invita a hacerlo. Parecía correcto y tenía un defecto de fondo: **nuestra decisión
 * de seguridad quedaba detrás de una precondición de un tercero**. Sin
 * `BLOB_READ_WRITE_TOKEN` configurado, `handleUpload` falla antes de llamar a la comprobación,
 * y lo que recibe quien sube un SVG no es nuestro "ese tipo no se puede subir" sino un mensaje
 * en inglés de Vercel sobre variables de entorno.
 *
 * Lo destapó CI, donde no hay token: en local pasaba porque yo había puesto uno falso.
 *
 * Ahora se valida primero y se delega después. La comprobación de dentro se queda igualmente
 * —fija la ruta y los tipos que el token autoriza— pero como segunda cerradura, no como la
 * única.
 *
 * ## Y una cosa que el token no puede evitar
 *
 * El token que devuelve `handleUpload` autoriza **una** subida con la ruta y el tipo que
 * fijamos aquí, así que un cliente no puede usarlo para escribir otra cosa. Lo que sí puede es
 * mentir sobre el tamaño: lo declara antes de subir, y quien miente sube más. Vercel Blob
 * aplica su propio límite por fichero, que es el suelo real; el nuestro está para que el
 * rechazo llegue **antes** de gastar la subida y para que el editor lea un motivo en español.
 */
export const runtime = 'nodejs';

/**
 * Esta ruta tiene **dos caminos con dos credenciales distintas**, y confundirlos costó una
 * función entera (issue #201).
 *
 * 1. `blob.generate-client-token` — lo pide el navegador de quien edita. Lo autoriza **la
 *    sesión**: es un permiso de escritura en el almacén y sin sesión sería un almacén de
 *    cualquiera.
 * 2. `blob.upload-completed` — lo manda **Vercel desde sus servidores** cuando el fichero ya
 *    está subido. No lleva cookie porque no viene de un navegador, y exigirle sesión lo
 *    rechazaba con 401: el fichero quedaba en el almacén y el CMS no se enteraba nunca.
 *
 * Lo que autentica el segundo es la cabecera `x-vercel-signature`, que `handleUpload` verifica
 * con HMAC contra el token del almacén antes de llamar a `onUploadCompleted`. **Es la credencial
 * correcta para servidor a servidor**, y la sesión es la equivocada.
 */
function exigeSesion(cuerpo: HandleUploadBody): boolean {
  return cuerpo.type !== 'blob.upload-completed';
}

export async function POST(request: Request): Promise<Response> {
  const cuerpo = (await request.json()) as HandleUploadBody;

  // La sesión, solo donde es la credencial que toca. Se responde igual que a un cuerpo
  // inválido: quien prueba no aprende si la ruta existe ni qué espera.
  const session = exigeSesion(cuerpo) ? await auth() : null;

  if (exigeSesion(cuerpo) && session === null) {
    return Response.json({ error: 'no_autorizado' }, { status: 401 });
  }

  // La decisión, antes de que ningún tercero entre en juego.
  const rechazo = comprobarAntesDeDelegar(cuerpo);
  if (rechazo !== null) return Response.json({ error: rechazo }, { status: 400 });

  try {
    const respuesta = await handleUpload({
      body: cuerpo,
      request,
      onBeforeGenerateToken: async (pathnameSolicitado, payloadDelCliente) => {
        const datos = leerDatosDelCliente(payloadDelCliente);

        const decision = decidirSubida({
          contentType: datos.contentType,
          sizeBytes: datos.sizeBytes,
          filename: pathnameSolicitado,
        });

        // `throw` y no un valor de error: es lo que corta la emisión del token en el flujo de
        // `handleUpload`. El mensaje es el de `decidirSubida`, ya en español llano.
        if (!decision.ok) throw new Error(decision.mensaje);

        // **Aquí estaba el fallo, y duró dos hitos.** Esta función devolvía `pathname` con el
        // nombre que generaba el servidor, y un comentario encima decía «lo que pidiera el
        // cliente se ignora por completo». El SDK **no admite `pathname` de vuelta**: lo
        // descartaba en silencio y guardaba el nombre del fichero del usuario, con espacios y
        // todo. Se descubrió porque subir dos veces la misma imagen chocaba.
        //
        // Ahora el nombre lo propone el cliente con nuestra forma y se comprueba aquí, que es lo
        // único que el SDK permite. La invariante no es «el servidor lo escribe», es **«nada que
        // el servidor no acepte llega al almacén»**, y esa sí se sostiene.
        if (!esPathnameGenerado(pathnameSolicitado, datos.contentType)) {
          throw new Error(SUBIDA_FALLIDA);
        }

        return {
          allowedContentTypes: [...TIPOS_PERMITIDOS],
          // Viaja firmado hasta el callback de abajo, que es quien escribe en la base de
          // datos: sin esto habría que fiarse de lo que el cliente diga entonces.
          tokenPayload: JSON.stringify({
            userId: session?.user.id ?? '',
            filename: nombreLegible(datos.filename),
          }),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Lo llama Vercel, no el navegador. Es el único sitio donde se conoce la URL final.
        const payload = JSON.parse(tokenPayload ?? '{}') as {
          userId?: string;
          filename?: string;
        };

        await getDb()
          .insert(media)
          .values({
            url: blob.url,
            pathname: blob.pathname,
            filename: payload.filename ?? 'imagen',
            mimeType: blob.contentType ?? 'application/octet-stream',
            sizeBytes: 0,
            alt: '',
            ...(payload.userId === undefined ? {} : { uploadedBy: payload.userId }),
          })
          .onConflictDoNothing({ target: media.pathname });

        await audit({
          action: 'media.upload',
          ...(payload.userId === undefined ? {} : { actorId: payload.userId }),
          targetType: 'media',
          targetId: blob.pathname,
        });
      },
    });

    return Response.json(respuesta);
  } catch (error) {
    // **Solo salen los mensajes nuestros.** El comentario anterior aquí decía justo esto y el
    // código no lo hacía: devolvía `error.message` sin mirar, así que un fallo interno de la
    // librería salía tal cual. Fue así como llegó "Vercel Blob: Failed to retrieve the client
    // token" a la pantalla de alguien que solo quería subir una foto.
    //
    // Y no es solo cuestión de idioma: el texto de un fallo interno cuenta cosas del servidor
    // —qué proveedor hay detrás, qué le falta— a cualquiera que sepa provocar el error.
    const texto = error instanceof Error ? error.message : '';
    const nuestro = mensajeNuestro(texto);

    // Lo que no sale por la respuesta, sale por el registro: es lo único que le sirve a quien
    // puede arreglar un almacén sin conectar.
    if (nuestro === null) console.error('[media/upload] fallo no previsto', error);

    // **Sigue siendo 400 aunque el fallo sea nuestro, y es a conciencia.** Un almacén sin
    // conectar es un 500 de manual: el cliente no ha hecho nada mal. Pero una vez que la
    // librería ha lanzado, distinguir "no hay token" de "el cuerpo venía mal" solo se puede
    // haciendo lo que este arreglo quita: mirar su texto en inglés. Y equivocarse tiene precio
    // en los dos sentidos — un cuerpo malicioso contando como error nuestro ensucia las
    // alarmas igual que un almacén roto escondido en los 400.
    //
    // Así que el código de estado se queda como estaba y el aviso va al registro, que es donde
    // se distingue sin adivinar. Si algún día hace falta separarlos, la librería expone
    // `BlobError` y sus subclases: eso sí es una comprobación estable.
    return Response.json({ error: nuestro ?? SUBIDA_FALLIDA }, { status: 400 });
  }
}

/**
 * Comprueba la petición de token **antes** de llamar a Vercel.
 *
 * Devuelve el mensaje de rechazo, o `null` si la subida es aceptable. Solo mira las peticiones
 * que piden token: `handleUpload` atiende también el callback de subida completada, que llega
 * firmado desde Vercel y no lleva payload de cliente.
 */
function comprobarAntesDeDelegar(cuerpo: HandleUploadBody): string | null {
  if (cuerpo.type !== 'blob.generate-client-token') return null;

  const datos = leerDatosDelCliente(cuerpo.payload.clientPayload);
  const decision = decidirSubida({
    contentType: datos.contentType,
    sizeBytes: datos.sizeBytes,
    filename: cuerpo.payload.pathname,
  });

  return decision.ok ? null : decision.mensaje;
}

/** Lo que el cliente adjunta a la petición. Todo opcional y todo sospechoso. */
function leerDatosDelCliente(payload: string | null | undefined): {
  contentType: unknown;
  sizeBytes: unknown;
  filename: unknown;
} {
  if (typeof payload !== 'string') return { contentType: null, sizeBytes: null, filename: null };

  try {
    const datos = JSON.parse(payload) as Record<string, unknown>;
    return {
      contentType: datos['contentType'],
      sizeBytes: datos['sizeBytes'],
      filename: datos['filename'],
    };
  } catch {
    return { contentType: null, sizeBytes: null, filename: null };
  }
}
