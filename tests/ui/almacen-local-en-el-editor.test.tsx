import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBIDA_FALLIDA } from '@/cms/mensajes-de-subida';
import { esPathnameGenerado } from '@/cms/nombres-de-subida';
import { MediaPicker } from '@/cms/ui/MediaPicker';

/**
 * T-A-14 … T-A-16: qué hace el selector de imágenes según a dónde vayan los bytes (spec 07 §5.4).
 *
 * ## Lo que hay que demostrar
 *
 * Que la bifurcación **existe de verdad**. Un test que solo mirara que la imagen aparece en la
 * lista pasaría con los dos caminos y con ninguno, porque el resultado visible es el mismo: por
 * eso aquí se mira a quién se llama, que es lo único que distingue un camino del otro.
 *
 * ## Y lo que hay que demostrar que NO cambia
 *
 * El manejo de errores. Es el mismo `catch` y el mismo `mensajeDeSubida()` para los dos
 * caminos, así que lo aprendido en #164 y #165 —no enseñar jerga, no perder el diagnóstico—
 * vale igual aquí. T-A-16 es el que impide que alguien "arregle" el camino local escribiéndole
 * su propio manejo.
 */

const subirABlob = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob/client', () => ({ upload: subirABlob }));

const PROPS = {
  imagenes: [],
  onElegir: vi.fn(),
  onCerrar: vi.fn(),
  tiposAceptados: ['image/png'],
  tamanoMaximoBytes: 10 * 1024 * 1024,
};

const FICHERO = new File([new Uint8Array(16)], 'foto.png', { type: 'image/png' });

async function elegirFichero(): Promise<void> {
  await userEvent.upload(screen.getByLabelText('Subir una imagen nueva'), FICHERO);
}

describe('a dónde sube el selector de imágenes', () => {
  beforeEach(() => {
    subirABlob.mockReset();
    subirABlob.mockResolvedValue({ pathname: 'media/2026-01/x.png', url: 'https://blob/x.png' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T-A-14: con el almacén local, no se llama a la librería de Vercel', async () => {
    const peticion = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'media/2026-01/y.png',
          url: '/api/media/local/media/2026-01/y.png',
          filename: 'foto.png',
          alt: '',
          mimeType: 'image/png',
        }),
    });
    vi.stubGlobal('fetch', peticion);

    render(<MediaPicker {...PROPS} almacenLocal />);
    await elegirFichero();

    // Lo que de verdad separa los dos caminos.
    expect(subirABlob).not.toHaveBeenCalled();
    expect(peticion).toHaveBeenCalledOnce();

    const [url, opciones] = peticion.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/media/local');
    expect(opciones.method).toBe('POST');
    // El fichero va en el cuerpo, no en la URL ni en una cabecera.
    expect(opciones.body).toBeInstanceOf(FormData);
    expect((opciones.body as FormData).get('fichero')).toBe(FICHERO);
  });

  it('T-A-15: sin él, se sigue subiendo a Vercel exactamente igual que antes', async () => {
    const peticion = vi.fn();
    vi.stubGlobal('fetch', peticion);

    render(<MediaPicker {...PROPS} />);
    await elegirFichero();

    expect(subirABlob).toHaveBeenCalledOnce();
    // Y nada de `fetch` por nuestra cuenta: la librería tiene el suyo y la ruta de subida
    // sigue siendo `/api/media/upload`.
    expect(peticion).not.toHaveBeenCalled();

    const [nombre, fichero, opciones] = subirABlob.mock.calls[0] as [
      string,
      File,
      { handleUploadUrl: string },
    ];
    // **Este caso decía `toBe('foto.png')` y estaba fijando un fallo como si fuera el contrato**
    // (issue #199). El nombre del fichero de quien edita acababa siendo el del objeto en el
    // almacén, con espacios y todo, y dos subidas del mismo fichero chocaban. Ahora el cliente
    // propone un nombre nuestro y el servidor lo comprueba antes de emitir el token.
    expect(esPathnameGenerado(nombre, 'image/png')).toBe(true);
    expect(fichero).toBe(FICHERO);
    expect(opciones.handleUploadUrl).toBe('/api/media/upload');
  });

  it('T-A-16: un fallo del camino local enseña un mensaje nuestro, no el del servidor', async () => {
    // Un 500 con un cuerpo que no es JSON: lo que devuelve un servidor caído de verdad, y lo
    // que rompería un `catch` escrito solo para el camino feliz.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new Error('Unexpected token < in JSON')),
      })
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<MediaPicker {...PROPS} almacenLocal />);
    await elegirFichero();

    expect(await screen.findByText(SUBIDA_FALLIDA)).toBeInTheDocument();
  });

  it('T-A-16b: un rechazo del servidor sí llega entero, porque lo escribimos nosotros', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'La imagen pesa demasiado. El máximo son 10 MB.' }),
      })
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<MediaPicker {...PROPS} almacenLocal />);
    await elegirFichero();

    // Taparlo con el genérico le quitaría a quien sube la única pista de qué arreglar.
    expect(await screen.findByText(/pesa demasiado/)).toBeInTheDocument();
  });
});
