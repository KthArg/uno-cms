import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { auth } from '@/cms/auth';
import { getDb, media } from '@/cms/db';
import { SUBIDA_FALLIDA } from '@/cms/mensajes-de-subida';
import { DIRECTORIO_LOCAL, usarAlmacenLocal } from '@/cms/security/almacen-local';
import { audit } from '@/cms/security/audit';
import { decidirSubida, nombreLegible } from '@/cms/security/uploads';

/**
 * `POST /api/media/local` — subir una imagen al disco, **solo en desarrollo** (spec 07 §4.3).
 *
 * ## Qué relación tiene con `/api/media/upload`
 *
 * Ninguna de decisión: las dos llaman a `decidirSubida()` y esa función no se toca ni se
 * duplica. Lo único que cambia es a dónde van los bytes.
 *
 * Por eso esta ruta no repite un solo test de las reglas —allowlist, tope, SVG, nombre
 * generado—: ya están probadas donde viven, sin red ni proveedor.
 *
 * ## Aquí el fichero **sí** pasa por el servidor, y eso cambia una cosa
 *
 * ADR-005 evita que pase en el camino de Vercel, y la consecuencia conocida es que el tamaño lo
 * **declara el cliente** (`docs/PENDIENTES.md`). Aquí no hay nada que declarar: `request
 * .formData()` construye el `File` a partir de los bytes del cuerpo, así que `fichero.size` **es**
 * lo que llegó. Una sola llamada a `decidirSubida()` ya lo mide de verdad.
 *
 * Escribí aquí una segunda comprobación "sobre los bytes reales", convencido de que la primera
 * miraba un número declarado. No lo mira, y la mutación lo demostró: quitar la segunda no ponía
 * rojo nada, porque no hacía nada. Está fuera.
 *
 * Eso hace este camino más estricto que el de producción, lo cual es una trampa para quien lea
 * este fichero y concluya que la deuda está saldada: **no lo está**. El camino que se despliega
 * sigue siendo el otro.
 *
 * ## Lo que se acepta: el cuerpo se lee entero antes de poder rechazarlo
 *
 * `request.formData()` tiene que consumir el multipart para saber cuánto pesa, así que un
 * fichero de un giga se recibe entero y se descarta después. En una ruta de producción sería
 * inaceptable; aquí corre en el `localhost` de quien desarrolla, contra su propia máquina y con
 * sesión. Si esto se abriera algún día a un servidor de verdad, esto es lo primero que hay que
 * resolver — leyendo el cuerpo por trozos y cortando al pasarse.
 *
 * ## Por qué 404 y no 403 cuando no está activo
 *
 * En un despliegue de verdad esta ruta no debe **parecer que existe**. Un 403 confirma que hay
 * ahí un endpoint de escritura y que lo único que falta es la credencial correcta; un 404 no
 * cuenta nada. Es la misma razón por la que `/api/media/upload` responde igual a "sin sesión"
 * que a "cuerpo inválido".
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (session === null) return Response.json({ error: 'no_autorizado' }, { status: 401 });

  // Antes que nada, y antes de leer el cuerpo: si esto no debe estar activo, no se toca ni un
  // byte de lo que llega.
  if (!usarAlmacenLocal()) return new Response(null, { status: 404 });

  const formulario = await request.formData();
  const fichero = formulario.get('fichero');

  if (!(fichero instanceof File)) {
    return Response.json({ error: SUBIDA_FALLIDA }, { status: 400 });
  }

  const decision = decidirSubida({
    contentType: fichero.type,
    sizeBytes: fichero.size,
    filename: fichero.name,
  });

  if (!decision.ok) return Response.json({ error: decision.mensaje }, { status: 400 });

  const bytes = Buffer.from(await fichero.arrayBuffer());

  // `decision.pathname` lo generó `generarPathname()`: `media/AAAA-MM/<uuid>.<ext>`. No hay
  // ningún fragmento que venga de fuera, así que no hay nada que sanear — el recorrido de
  // directorios no está mitigado, es que no tiene por dónde entrar.
  const destino = join(process.cwd(), DIRECTORIO_LOCAL, decision.pathname);

  // El plugin de seguridad avisa de que la ruta no es literal, y hace bien: es la clase de
  // línea por la que se escriben ficheros donde no se debe. Aquí se silencia porque el único
  // fragmento variable es `decision.pathname`, que **lo generó `generarPathname()`** —
  // `media/AAAA-MM/<uuid>.<ext>`, con la extensión derivada del tipo ya validado. Nada de lo
  // que mandó el cliente llega hasta aquí, ni siquiera su nombre de fichero.
  //
  // La forma la fija T-A-13b, y T-A-11b comprueba que la ruta que sirve no acepta salir del
  // directorio. Si algún día `generarPathname()` empezara a usar algo de fuera, esto dejaría
  // de estar justificado y este comentario sería mentira: por eso dice de dónde sale.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(dirname(destino), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await writeFile(destino, bytes);

  const url = `/api/media/local/${decision.pathname}`;

  await getDb()
    .insert(media)
    .values({
      url,
      pathname: decision.pathname,
      filename: nombreLegible(fichero.name),
      mimeType: decision.contentType,
      // El de Vercel guarda 0 porque su callback no trae el tamaño (deuda aceptada). Aquí se
      // conoce de verdad, así que se guarda de verdad.
      sizeBytes: bytes.byteLength,
      alt: '',
      ...(session.user.id === undefined ? {} : { uploadedBy: session.user.id }),
    })
    .onConflictDoNothing({ target: media.pathname });

  await audit({
    action: 'media.upload',
    ...(session.user.id === undefined ? {} : { actorId: session.user.id }),
    targetType: 'media',
    targetId: decision.pathname,
  });

  return Response.json({
    id: decision.pathname,
    url,
    filename: nombreLegible(fichero.name),
    alt: '',
    mimeType: decision.contentType,
  });
}
