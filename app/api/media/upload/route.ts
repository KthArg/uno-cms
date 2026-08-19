import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '@/cms/auth';
import { getDb, media } from '@/cms/db';
import { audit } from '@/cms/security/audit';
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
 * ## Y una cosa que el token no puede evitar
 *
 * El token que devuelve `handleUpload` autoriza **una** subida con la ruta y el tipo que
 * fijamos aquí, así que un cliente no puede usarlo para escribir otra cosa. Lo que sí puede es
 * mentir sobre el tamaño: lo declara antes de subir, y quien miente sube más. Vercel Blob
 * aplica su propio límite por fichero, que es el suelo real; el nuestro está para que el
 * rechazo llegue **antes** de gastar la subida y para que el editor lea un motivo en español.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const session = await auth();

  // Sin sesión no se emite token, y se responde igual que a un cuerpo inválido: quien prueba
  // no aprende si la ruta existe ni qué espera.
  if (session === null) {
    return Response.json({ error: 'no_autorizado' }, { status: 401 });
  }

  const cuerpo = (await request.json()) as HandleUploadBody;

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

        return {
          allowedContentTypes: [...TIPOS_PERMITIDOS],
          // El nombre generado. Lo que pidiera el cliente se ignora por completo.
          pathname: decision.pathname,
          // Viaja firmado hasta el callback de abajo, que es quien escribe en la base de
          // datos: sin esto habría que fiarse de lo que el cliente diga entonces.
          tokenPayload: JSON.stringify({
            userId: session.user.id,
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
    // El mensaje sí sale, porque es nuestro y está pensado para el editor ("La imagen pesa
    // demasiado…"). Lo que no sale es nada de lo que venga de dentro de Vercel.
    const mensaje = error instanceof Error ? error.message : 'No se ha podido subir la imagen.';
    return Response.json({ error: mensaje }, { status: 400 });
  }
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
