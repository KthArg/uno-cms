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
