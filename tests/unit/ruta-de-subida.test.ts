import { afterEach, describe, expect, it, vi } from 'vitest';
import { generarPathname } from '@/cms/nombres-de-subida';

/**
 * T-199-2, la mitad del servidor: **nada que el servidor no acepte llega al almacén**
 * (issue #199, ADR-704).
 *
 * ## Por qué no vale un caso de e2e para esto
 *
 * Porque en el entorno de e2e no hay almacén conectado a propósito, así que **toda** petición a
 * esta ruta acaba en 400. Un caso que comprobara «un nombre malo da 400» pasaría sin ejercitar
 * nuestra comprobación: pasaría igual con ella quitada.
 *
 * Aquí se simula la librería para que el camino bueno **sí** llegue al final. Es el contraste lo
 * que hace que este fichero pruebe algo: mismo montaje, mismo cuerpo, y lo único que cambia es
 * el nombre pedido.
 */

const sesion = vi.hoisted(() => vi.fn());
vi.mock('@/cms/auth', () => ({ auth: sesion }));

/**
 * `handleUpload` simulado: llama a `onBeforeGenerateToken` como hace el de verdad y deja pasar.
 *
 * Con esto, la ruta responde 200 salvo que **nuestra** comprobación lance — que es exactamente
 * lo que hay que medir.
 */
const manejarSubida = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob/client', () => ({ handleUpload: manejarSubida }));

manejarSubida.mockImplementation(
  async ({
    body,
    onBeforeGenerateToken,
  }: {
    body: { payload: { pathname: string; clientPayload: string } };
    onBeforeGenerateToken: (p: string, c: string | null, m: boolean) => Promise<unknown>;
  }) => {
    await onBeforeGenerateToken(body.payload.pathname, body.payload.clientPayload, false);
    return { type: 'blob.generate-client-token', clientToken: 'un-token' };
  }
);

function peticion(pathname: string) {
  return new Request('https://ejemplo.test/api/media/upload', {
    method: 'POST',
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: {
        pathname,
        callbackUrl: 'https://ejemplo.test/api/media/upload',
        clientPayload: JSON.stringify({
          contentType: 'image/png',
          sizeBytes: 1024,
          filename: 'foto.png',
        }),
        multipart: false,
      },
    }),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('T-199-2 — el servidor comprueba el nombre antes de emitir el token', () => {
  it('con un nombre nuestro, emite el token', () => {
    // El caso que hace que los de abajo puedan fallar: sin él, «responde 400» pasaría también
    // con la comprobación quitada, porque cualquier otra cosa podría estar rompiendo.
    sesion.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } });

    return import('@/app/api/media/upload/route').then(async ({ POST }) => {
      const respuesta = await POST(peticion(generarPathname('image/png')));

      expect(respuesta.status).toBe(200);
    });
  });

  it('con el nombre crudo de un fichero, no', async () => {
    // **Es lo que se subía hasta ahora**, y el caso exacto del despliegue.
    sesion.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } });
    const { POST } = await import('@/app/api/media/upload/route');

    for (const nombre of ['foto.png', 'Screenshot 2026-08-19 212752.png', 'media/foto.png']) {
      const respuesta = await POST(peticion(nombre));

      expect(respuesta.status, nombre).toBe(400);
      // Y el mensaje es el nuestro, no el de la librería: quien sube una foto no tiene por qué
      // leer el nombre de un proveedor (#164).
      expect(await respuesta.text(), nombre).not.toMatch(/vercel|blob/i);
    }
  });

  it('ni con una extensión que no le toca a ese tipo', async () => {
    sesion.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } });
    const { POST } = await import('@/app/api/media/upload/route');

    // Forma correcta, tipo declarado `image/png`, extensión `.webp`.
    const nombre = generarPathname('image/webp');

    expect((await POST(peticion(nombre))).status).toBe(400);
  });

  it('y sin sesión no se llega ni a mirar el nombre', async () => {
    sesion.mockResolvedValue(null);
    const { POST } = await import('@/app/api/media/upload/route');

    expect((await POST(peticion(generarPathname('image/png')))).status).toBe(401);
    expect(manejarSubida).not.toHaveBeenCalled();
  });
});

describe('T-201-1 a T-201-3 — dos caminos, dos credenciales', () => {
  /**
   * El fallo que esto arregla dejaba la función a medias **sin decirlo**: la imagen se subía al
   * almacén y no aparecía nunca en la biblioteca, ni recargando.
   *
   * `POST /api/media/upload` recibe dos cosas distintas: el navegador pidiendo permiso, y Vercel
   * avisando desde sus servidores de que el fichero ya está. El segundo no lleva cookie —no
   * viene de un navegador— y la comprobación de sesión lo rechazaba con 401.
   */

  function avisoDeFin() {
    return new Request('https://ejemplo.test/api/media/upload', {
      method: 'POST',
      headers: { 'x-vercel-signature': 'una-firma' },
      body: JSON.stringify({
        type: 'blob.upload-completed',
        payload: {
          blob: {
            url: 'https://x.public.blob.vercel-storage.com/media/2026-08/a.png',
            pathname: 'media/2026-08/a.png',
            contentType: 'image/png',
          },
          tokenPayload: JSON.stringify({ userId: 'u1', filename: 'foto.png' }),
        },
      }),
    });
  }

  it('T-201-1: emitir el token sigue exigiendo sesión', async () => {
    sesion.mockResolvedValue(null);
    const { POST } = await import('@/app/api/media/upload/route');

    expect((await POST(peticion(generarPathname('image/png')))).status).toBe(401);
  });

  it('T-201-2: el aviso de fin no la exige, y llega a la librería', async () => {
    // **Sin sesión a propósito**: es lo que manda Vercel, servidor a servidor. Si esto vuelve a
    // dar 401, el fichero se sube y el CMS no se entera — que es exactamente lo que pasaba.
    sesion.mockResolvedValue(null);
    manejarSubida.mockResolvedValueOnce({ type: 'blob.upload-completed', response: 'ok' });
    const { POST } = await import('@/app/api/media/upload/route');

    const respuesta = await POST(avisoDeFin());

    expect(respuesta.status).not.toBe(401);
    expect(manejarSubida).toHaveBeenCalled();
    // Y no se ha llamado a `auth()` siquiera: pedir sesión a quien no puede tenerla es lo que
    // convirtió esto en un 401.
    expect(sesion).not.toHaveBeenCalled();
  });

  it('T-201-3: y lo que autentica ese camino lo comprueba la librería', async () => {
    // **Quitar la sesión de un camino solo vale si lo que la sustituye se comprueba de verdad.**
    // Quien lo comprueba es `handleUpload`: exige `x-vercel-signature` y la verifica con HMAC
    // contra el token del almacén. Aquí se simula que la rechaza, y lo que se mide es que
    // nuestra ruta **no** se la salta ni la trata como un éxito.
    sesion.mockResolvedValue(null);
    manejarSubida.mockRejectedValueOnce(new Error('Invalid callback signature'));
    const { POST } = await import('@/app/api/media/upload/route');

    const respuesta = await POST(avisoDeFin());

    expect(respuesta.status).toBe(400);
    // Y el motivo interno no sale a la respuesta (#165).
    expect(await respuesta.text()).not.toMatch(/signature|vercel/i);
  });
});

describe('T-S-11 — el límite de tamaño va dentro del token, no en lo que declara el cliente', () => {
  it('el token lleva maximumSizeInBytes y caduca en cinco minutos como mucho', async () => {
    sesion.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } });

    // Se captura lo que la ruta le devuelve a la librería: es lo que el SDK firma con
    // `BLOB_READ_WRITE_TOKEN` y lo que Vercel aplica al recibir los bytes.
    let opciones: Record<string, unknown> | undefined;
    manejarSubida.mockImplementationOnce(
      async ({
        body,
        onBeforeGenerateToken,
      }: {
        body: { payload: { pathname: string; clientPayload: string } };
        onBeforeGenerateToken: (p: string, c: string | null, m: boolean) => Promise<unknown>;
      }) => {
        opciones = (await onBeforeGenerateToken(
          body.payload.pathname,
          body.payload.clientPayload,
          false
        )) as Record<string, unknown>;
        return { type: 'blob.generate-client-token', clientToken: 'un-token' };
      }
    );

    const { POST } = await import('@/app/api/media/upload/route');
    const { TAMANO_MAXIMO_BYTES } = await import('@/cms/security/uploads');
    const antes = Date.now();

    const respuesta = await POST(peticion(generarPathname('image/png')));

    expect(respuesta.status).toBe(200);
    expect(opciones?.['maximumSizeInBytes']).toBe(TAMANO_MAXIMO_BYTES);
    expect(opciones?.['validUntil']).toBeTypeOf('number');
    expect(opciones?.['validUntil'] as number).toBeLessThanOrEqual(antes + 5 * 60_000 + 1000);
    expect(opciones?.['allowOverwrite']).toBe(false);
    expect(opciones?.['addRandomSuffix']).toBe(false);
  });
});

describe('T-S-12 — un cuerpo que no se entiende es un 400, no un 500', () => {
  it.each([
    ['que no es JSON', 'esto no es json'],
    ['null', 'null'],
    ['sin payload', JSON.stringify({ type: 'blob.generate-client-token' })],
    ['con un tipo inventado', JSON.stringify({ type: 'otra-cosa', payload: {} })],
    [
      'sin pathname',
      JSON.stringify({ type: 'blob.generate-client-token', payload: { clientPayload: '{}' } }),
    ],
  ])('%s', async (_caso, cuerpo) => {
    sesion.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } });
    const { POST } = await import('@/app/api/media/upload/route');

    const respuesta = await POST(
      new Request('https://ejemplo.test/api/media/upload', { method: 'POST', body: cuerpo })
    );

    expect(respuesta.status).toBe(400);
    expect(manejarSubida).not.toHaveBeenCalled();
  });
});
