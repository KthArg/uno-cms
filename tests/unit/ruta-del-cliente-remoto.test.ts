import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/preview-cliente.js/route';
import { FUENTE_DEL_CLIENTE_REMOTO } from '@/cms/preview/cliente-remoto';

/**
 * `GET /preview-cliente.js`: quién puede descargar el cliente (spec 08 §4.6).
 *
 * Va en la suite rápida y no en integración porque esta ruta **no toca la base de datos**:
 * entra un `Origin`, sale un fichero o un 404.
 */

const ORIGEN = 'https://mi-web.example';

function pedir(origen: string | null) {
  const headers = new Headers();
  if (origen !== null) headers.set('origin', origen);

  return new Request('https://mi-cms.example/preview-cliente.js', { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('el cliente solo se sirve a quien está en la lista', () => {
  it('con la fase encendida y un origen permitido, sale el módulo', () => {
    vi.stubEnv('PREVIEW_ORIGINS', ORIGEN);

    const respuesta = GET(pedir(ORIGEN));

    expect(respuesta.status).toBe(200);
    // Un `import()` entre orígenes se hace en modo CORS: sin esta cabecera con el origen
    // exacto, el navegador descarta el módulo aunque el servidor lo haya mandado.
    expect(respuesta.headers.get('access-control-allow-origin')).toBe(ORIGEN);
    expect(respuesta.headers.get('access-control-allow-origin')).not.toBe('*');
    expect(respuesta.headers.get('vary')).toBe('Origin');
    expect(respuesta.headers.get('content-type')).toContain('text/javascript');
    expect(respuesta.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('y lo que sale es exactamente el cliente que se prueba', async () => {
    // Los tests del cliente importan `FUENTE_DEL_CLIENTE_REMOTO`. Si la ruta sirviera otra cosa
    // —una versión compilada, un recorte—, esos tests estarían probando algo que nadie descarga.
    vi.stubEnv('PREVIEW_ORIGINS', ORIGEN);

    expect(await GET(pedir(ORIGEN)).text()).toBe(FUENTE_DEL_CLIENTE_REMOTO);
  });

  it('sin `PREVIEW_ORIGINS`, 404 aunque el origen sea el que sería', async () => {
    vi.stubEnv('PREVIEW_ORIGINS', undefined);

    const respuesta = GET(pedir(ORIGEN));

    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).toBe('');
    expect(respuesta.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('un origen fuera de la lista tampoco, ni uno que la contenga', async () => {
    vi.stubEnv('PREVIEW_ORIGINS', ORIGEN);

    for (const origen of ['https://otra.example', `${ORIGEN}.malo.io`, null]) {
      const respuesta = GET(pedir(origen));

      expect(respuesta.status, String(origen)).toBe(404);
      expect(respuesta.headers.get('access-control-allow-origin'), String(origen)).toBeNull();
    }
  });
});
