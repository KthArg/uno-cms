import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGISTRO_FALLIDO } from '@/cms/mensajes-de-subida';

const refrescar = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refrescar, push: vi.fn() }) }));

const subirABlob = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob/client', () => ({ upload: subirABlob }));

import { MediaPicker } from '@/cms/ui/MediaPicker';

/**
 * T-205-5: **quien sube se entera de que la imagen quedó anotada** (issue #205).
 *
 * ## Por qué este fichero existe aparte
 *
 * Porque este camino no lo ejecutaba **ningún** test. Los e2e corren con el almacén local
 * (ADR-700), donde la fila la escribe la propia ruta; los de integración prueban la action
 * suelta. La parte que se equivocó en producción —el orden en que el cliente hace las cosas— se
 * quedaba justo en medio, sin nadie mirando.
 *
 * ## Y lo que mide
 *
 * Que se anota **antes** de refrescar. Al revés funciona igual de bien mientras nada falle, y
 * es exactamente el fallo que se desplegó: el refresco salía un segundo antes que la fila, así
 * que la biblioteca se pintaba sin la imagen recién subida.
 */

const PROPS = {
  imagenes: [],
  onElegir: vi.fn(),
  onCerrar: vi.fn(),
  tiposAceptados: ['image/png'],
  tamanoMaximoBytes: 10 * 1024 * 1024,
};

const FICHERO = new File([new Uint8Array(16)], 'mi foto.png', { type: 'image/png' });
const SUBIDA = {
  pathname: 'media/2026-08/8a1f0c2e-1111-4222-8333-444455556666.png',
  url: 'https://x.public.blob.vercel-storage.com/media/2026-08/8a1f0c2e-1111-4222-8333-444455556666.png',
};

async function elegirFichero(): Promise<void> {
  await userEvent.upload(screen.getByLabelText('Subir una imagen nueva'), FICHERO);
}

describe('anotar la imagen recién subida', () => {
  beforeEach(() => {
    refrescar.mockReset();
    PROPS.onElegir.mockReset();
    subirABlob.mockReset();
    subirABlob.mockResolvedValue(SUBIDA);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('se anota con lo que devuelve el almacén, y antes de refrescar', async () => {
    const registrar = vi.fn().mockResolvedValue({ ok: true });

    render(<MediaPicker {...PROPS} registrar={registrar} />);
    await elegirFichero();

    expect(registrar).toHaveBeenCalledWith({
      url: SUBIDA.url,
      pathname: SUBIDA.pathname,
      filename: 'mi foto.png',
      mimeType: 'image/png',
    });

    // **El orden es el fallo que se desplegó**, no un detalle de estilo: refrescar primero
    // pinta la biblioteca sin la fila que todavía no se ha escrito.
    expect(refrescar).toHaveBeenCalledOnce();
    expect(registrar.mock.invocationCallOrder[0]).toBeLessThan(
      refrescar.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('si no se puede anotar, se dice — y no se enseña como subida', async () => {
    // El fichero **está** en el almacén y el CMS no lo tiene. Callarse deja a quien sube
    // creyendo que hay una imagen que la biblioteca no va a enseñar nunca.
    const registrar = vi.fn().mockResolvedValue({ ok: false });

    render(<MediaPicker {...PROPS} registrar={registrar} />);
    await elegirFichero();

    expect(await screen.findByText(REGISTRO_FALLIDO)).toBeInTheDocument();
    // Y un mensaje distinto del de «no se ha podido subir»: repetir la subida solo acumularía
    // copias del mismo fichero en el almacén.
    expect(screen.queryByText(/no se ha podido subir/i)).not.toBeInTheDocument();
    expect(PROPS.onElegir).not.toHaveBeenCalled();
  });

  it('con el almacén local no se anota nada: ya lo hace la ruta', async () => {
    // Allí el fichero pasa por nuestro servidor, que escribe la fila en la misma petición. Una
    // segunda escritura desde aquí no arreglaría nada y duplicaría el camino.
    const registrar = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'media/2026-08/y.png',
            url: '/api/media/local/media/2026-08/y.png',
            filename: 'mi foto.png',
            alt: '',
            mimeType: 'image/png',
          }),
      })
    );

    render(<MediaPicker {...PROPS} almacenLocal registrar={registrar} />);
    await elegirFichero();

    expect(registrar).not.toHaveBeenCalled();
    expect(refrescar).toHaveBeenCalledOnce();
  });
});
