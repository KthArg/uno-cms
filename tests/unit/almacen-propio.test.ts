import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostDelAlmacen, patronesDeImagenes } from '@/cms/nombres-de-subida';

/**
 * T-S-14: el optimizador de imágenes solo procesa el almacén de **este** despliegue (spec 19).
 *
 * El patrón era `**.public.blob.vercel-storage.com`, y ese sufijo es de todos los clientes de
 * Vercel: cualquiera subía imágenes a su almacén gratuito y nuestro `/_next/image` las procesaba
 * con nuestra factura.
 */

const TOKEN = 'vercel_blob_rw_TiendaDePrueba1_secreto-de-usar-y-tirar';
const HOST = 'tiendadeprueba1.public.blob.vercel-storage.com';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('T-S-14 — el host del almacén sale del token', () => {
  it('el tercer segmento, en minúsculas, como lo construye el SDK', () => {
    expect(hostDelAlmacen(TOKEN)).toBe(HOST);
  });

  it.each([
    ['sin token', undefined],
    ['vacío', ''],
    ['sin id', 'vercel_blob_rw_'],
    ['un id con caracteres que no son de host', 'vercel_blob_rw_mal.io/x_secreto'],
  ])('%s, ninguno', (_caso, token) => {
    expect(hostDelAlmacen(token)).toBeNull();
    expect(patronesDeImagenes(token)).toEqual([]);
  });

  it('y next.config.ts admite ese host y ningún otro', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
    const { default: config } = await import('@/next.config');

    expect(config.images?.remotePatterns).toEqual([{ protocol: 'https', hostname: HOST }]);
  });

  it('sin token, next.config.ts no admite ningún host remoto', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', undefined);
    const { default: config } = await import('@/next.config');

    expect(config.images?.remotePatterns).toEqual([]);
  });
});
