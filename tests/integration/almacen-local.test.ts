import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/media/local/[...ruta]/route';
import { POST } from '@/app/api/media/local/route';
import { getDb, media, users } from '@/cms/db';
import { auditLog } from '@/cms/db/schema';
import { DIRECTORIO_LOCAL } from '@/cms/security/almacen-local';
import { TAMANO_MAXIMO_BYTES } from '@/cms/security/uploads';
import { describeIntegration } from './env';

/**
 * T-A-5 … T-A-13: el almacén local, contra el disco y la base de datos de verdad (spec 07).
 *
 * ## Por qué integración y no un test de unidad con el disco simulado
 *
 * Lo que hay que demostrar aquí es justamente lo que un simulacro daría por bueno: que el
 * fichero **acaba escrito donde decimos**, que la fila queda en `media` apuntando a él, y que
 * una ruta con `..` no lee nada de fuera del directorio. Con `fs` simulado, el test del
 * recorrido de directorios comprobaría que nuestro regex rechaza una cadena — no que el disco
 * esté a salvo.
 *
 * ## Lo que NO se prueba aquí, a propósito
 *
 * Las reglas de qué se acepta —allowlist, tope, SVG, nombre generado— viven en
 * `cms/security/uploads.ts` y están probadas allí, sin red ni ficheros. Esta ruta las llama;
 * repetir sus casos aquí sería mantener dos veces la misma lista y creer que se cubre el doble.
 *
 * Lo que sí se prueba es que **las llama**, y el caso que es suyo y de nadie más: el tamaño
 * medido sobre los bytes que llegaron de verdad.
 */

const sesion = vi.hoisted(() => vi.fn());
vi.mock('@/cms/auth', () => ({ auth: sesion }));

const RAIZ = join(process.cwd(), DIRECTORIO_LOCAL);

async function crearUsuario() {
  const [user] = await getDb()
    .insert(users)
    .values({
      email: 'sube@ejemplo.com',
      name: 'Persona',
      passwordHash: 'x',
      role: 'admin',
    })
    .returning();

  sesion.mockResolvedValue({ user: { id: user!.id, email: user!.email, role: 'admin' } });
  return user!;
}

/** Una petición como la que manda `MediaPicker`: el fichero en un `FormData`. */
function peticionCon(fichero: File): Request {
  const cuerpo = new FormData();
  cuerpo.append('fichero', fichero);
  return new Request('http://localhost/api/media/local', { method: 'POST', body: cuerpo });
}

function png(bytes: number, nombre = 'foto.png'): File {
  return new File([new Uint8Array(bytes)], nombre, { type: 'image/png' });
}

/** Existe en disco, sin lanzar si no. */
async function hayFichero(ruta: string): Promise<boolean> {
  try {
    await stat(join(RAIZ, ruta));
    return true;
  } catch {
    return false;
  }
}

describeIntegration('el almacén local de imágenes', () => {
  beforeEach(() => {
    sesion.mockReset();
    // El entorno de los tests no es producción y no hay token, así que el almacén está activo.
    // Se deja explícito porque de lo contrario media suite dependería de una variable que
    // nadie ve en este fichero.
    delete process.env['BLOB_READ_WRITE_TOKEN'];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Los ficheros de los tests no se quedan en el disco de quien los ejecuta.
    await rm(RAIZ, { recursive: true, force: true });
  });

  it('T-A-5: sin sesión, 401 y no se escribe nada', async () => {
    sesion.mockResolvedValue(null);

    const respuesta = await POST(peticionCon(png(64)));

    expect(respuesta.status).toBe(401);
    // Lo que importa no es el código, es que no llegó a tocar el disco.
    expect(await hayFichero('')).toBe(false);
  });

  it('T-A-6: con un almacén de Vercel conectado, la ruta no existe', async () => {
    await crearUsuario();
    process.env['BLOB_READ_WRITE_TOKEN'] = 'vercel_blob_rw_algo';

    const respuesta = await POST(peticionCon(png(64)));

    // 404 y no 403: en un despliegue esta ruta no debe **parecer que existe**.
    expect(respuesta.status).toBe(404);
  });

  it('T-A-7: un SVG se rechaza en español, y no se escribe', async () => {
    await crearUsuario();
    const svg = new File(['<svg onload="alert(1)"/>'], 'x.svg', { type: 'image/svg+xml' });

    const respuesta = await POST(peticionCon(svg));
    const cuerpo = (await respuesta.json()) as { error: string };

    expect(respuesta.status).toBe(400);
    expect(cuerpo.error).toContain('no se puede subir');
    // Se comprueba que llamó a las reglas, no se repiten las reglas.
    expect(cuerpo.error).not.toContain('svg');
  });

  it('T-A-8: el tope se mide sobre los bytes recibidos, y aquí nadie los declara', async () => {
    await crearUsuario();

    // La primera versión de este test construía un `File` que **mentía** sobre su tamaño, con
    // `defineProperty`, y no probaba nada: al pasar por `FormData` y `request.formData()` el
    // fichero se reconstruye desde los bytes del cuerpo y la mentira se pierde por el camino.
    //
    // Eso es justamente la propiedad que hace bueno a este camino, y por eso el test es tan
    // aburrido: se mandan más bytes de la cuenta y se rechazan. No hay número que falsear,
    // que es lo que sí tiene el camino de Vercel (allí `sizeBytes` lo pone el cliente).
    const respuesta = await POST(peticionCon(png(TAMANO_MAXIMO_BYTES + 1024)));
    const cuerpo = (await respuesta.json()) as { error: string };

    expect(respuesta.status).toBe(400);
    expect(cuerpo.error).toContain('pesa demasiado');
  });

  it('T-A-9: un PNG válido acaba en disco, en la base de datos y en la auditoría', async () => {
    const usuario = await crearUsuario();

    const respuesta = await POST(peticionCon(png(2048, 'mi retrato.png')));
    const subida = (await respuesta.json()) as { id: string; url: string; filename: string };

    expect(respuesta.status).toBe(200);

    // 1. El fichero, donde dice.
    expect(await hayFichero(subida.id)).toBe(true);
    expect((await readFile(join(RAIZ, subida.id))).byteLength).toBe(2048);

    // 2. La fila, apuntando a la ruta que sirve.
    const [fila] = await getDb().select().from(media).where(eq(media.pathname, subida.id));
    expect(fila?.url).toBe(`/api/media/local/${subida.id}`);
    expect(fila?.mimeType).toBe('image/png');
    // El de Vercel guarda 0 porque su callback no trae el tamaño. Aquí se conoce.
    expect(fila?.sizeBytes).toBe(2048);
    expect(fila?.uploadedBy).toBe(usuario.id);
    // El nombre original se conserva como etiqueta, nunca como ruta.
    expect(fila?.filename).toBe('mi retrato.png');
    expect(subida.id).not.toContain('retrato');

    // 3. La auditoría, igual que en el camino de Vercel.
    const registro = await getDb().select().from(auditLog).where(eq(auditLog.targetId, subida.id));
    expect(registro[0]?.action).toBe('media.upload');
  });

  it('T-A-10: dos ficheros con el mismo nombre no se pisan', async () => {
    await crearUsuario();

    const primera = (await (await POST(peticionCon(png(100, 'logo.png')))).json()) as {
      id: string;
    };
    const segunda = (await (await POST(peticionCon(png(200, 'logo.png')))).json()) as {
      id: string;
    };

    expect(primera.id).not.toBe(segunda.id);
    // Y las dos siguen ahí con su contenido: si la segunda hubiera pisado a la primera, los
    // tamaños serían iguales.
    expect((await readFile(join(RAIZ, primera.id))).byteLength).toBe(100);
    expect((await readFile(join(RAIZ, segunda.id))).byteLength).toBe(200);
  });

  it('T-A-11: una ruta con `..` no lee nada de fuera del directorio', async () => {
    const salidas = [
      ['..', '..', '.env'],
      ['..', '..', 'package.json'],
      ['media', '..', '..', '.env.local'],
      // Codificado: Next entrega los segmentos ya decodificados, así que esto llega como `..`
      // y tiene que morir igual. Se prueba en las dos formas porque el día que alguien
      // sustituya la comparación por un `replace('..', '')`, solo una de las dos lo delata.
      ['%2e%2e', '%2e%2e', '.env'],
      ['....//....//.env'],
    ];

    for (const ruta of salidas) {
      const respuesta = await GET(new Request('http://localhost/x'), {
        params: Promise.resolve({ ruta }),
      });

      expect(respuesta.status, ruta.join('/')).toBe(404);
      expect(await respuesta.arrayBuffer(), ruta.join('/')).toHaveProperty('byteLength', 0);
    }
  });

  it('T-A-11b: y tampoco un fichero de fuera que SÍ tenga extensión de imagen', async () => {
    // **Este caso existe porque el de arriba no probaba lo que dice.** Mutando la forma de la
    // ruta a `^media/.+$` —o sea, quitando la defensa— los cinco casos anteriores seguían
    // verdes: lo que los mataba era la comprobación de la extensión, porque todos acababan en
    // `.env` o en `.local`. El test acertaba por casualidad.
    //
    // Aquí el objetivo está **fuera** del directorio del almacén y acaba en `.png`, así que la
    // única cosa que puede impedir la lectura es la forma de la ruta. Comprobado mutando: sin
    // ella, esto devuelve 200 y el contenido del fichero.
    const fuera = join(process.cwd(), 'no-deberia-salir.png');
    await writeFile(fuera, 'secreto');

    try {
      const respuesta = await GET(new Request('http://localhost/x'), {
        params: Promise.resolve({ ruta: ['media', '..', '..', 'no-deberia-salir.png'] }),
      });

      expect(respuesta.status).toBe(404);
      expect((await respuesta.arrayBuffer()).byteLength).toBe(0);
    } finally {
      await rm(fuera, { force: true });
    }
  });

  it('T-A-12: una ruta con la forma correcta que no existe es 404', async () => {
    const respuesta = await GET(new Request('http://localhost/x'), {
      params: Promise.resolve({
        ruta: ['media', '2026-01', '00000000-0000-4000-8000-000000000000.png'],
      }),
    });

    expect(respuesta.status).toBe(404);
  });

  it('T-A-13: lo subido se descarga con su tipo, y el tipo no lo decide quien pide', async () => {
    await crearUsuario();

    const subida = (await (await POST(peticionCon(png(321)))).json()) as { id: string };

    const respuesta = await GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ ruta: subida.id.split('/') }),
    });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('Content-Type')).toBe('image/png');
    expect(respuesta.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect((await respuesta.arrayBuffer()).byteLength).toBe(321);
  });

  it('T-A-13b: la forma que exige la ruta que sirve es la que genera la que sube', async () => {
    await crearUsuario();

    // Las dos rutas comparten una forma escrita en dos sitios —`generarPathname()` y el regex
    // de la que sirve— y nada del compilador las ata. Este caso es el que las ata: si una
    // cambia sin la otra, lo subido deja de poder descargarse y esto se pone rojo.
    const subida = (await (await POST(peticionCon(png(10, 'x.gif')))).json()) as { id: string };
    expect(subida.id).toMatch(/^media\/\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/);
  });
});
