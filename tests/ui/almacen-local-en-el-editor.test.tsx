import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBIDA_FALLIDA } from '@/cms/mensajes-de-subida';
import { esPathnameGenerado } from '@/cms/nombres-de-subida';

/**
 * `router.refresh` espiado: es lo que le dice a Next que los datos del servidor han cambiado.
 *
 * Sin él, la imagen se veía al subirla y desaparecía al cambiar de pantalla y volver — la caché
 * del enrutador servía la respuesta anterior, con la biblioteca de antes (issue #203).
 */
const refrescar = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refrescar, push: vi.fn() }) }));
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

describe('T-203-1 y T-203-2 — la biblioteca no espera a que recargues', () => {
  /**
   * El fallo: la imagen aparecía al subirla y **desaparecía al cambiar de pantalla y volver**,
   * hasta recargar el sitio entero.
   *
   * Estas pantallas son `force-dynamic`, así que no hay caché de servidor. Lo que servía lo
   * viejo era la **caché del enrutador del cliente**: al volver a una ruta ya visitada, Next
   * reutiliza la respuesta que guardó. El estado local hacía que se viera aquí y nada le decía
   * al enrutador que lo de fuera había cambiado.
   */

  beforeEach(() => {
    // El montaje del otro bloque no llega hasta aquí: sin esto, la subida simulada devuelve
    // `undefined`, el componente se va por el `catch` y los casos medirían el camino del fallo.
    subirABlob.mockReset();
    subirABlob.mockResolvedValue({ pathname: 'media/2026-01/x.png', url: 'https://blob/x.png' });
    refrescar.mockClear();
    PROPS.onElegir.mockClear();
  });

  it('T-203-1: tras subir, se le pide a Next rehacer los datos del servidor', async () => {
    render(<MediaPicker {...PROPS} />);
    await elegirFichero();

    expect(refrescar).toHaveBeenCalled();
  });

  it('T-203-2: si la subida falla, no se refresca', async () => {
    // No hay nada nuevo que traer, y refrescar borraría de la pantalla el aviso de que ha
    // fallado — que es lo único que quien sube tiene para saber qué ha pasado.
    subirABlob.mockRejectedValueOnce(new Error('sin almacén'));

    render(<MediaPicker {...PROPS} />);
    await elegirFichero();

    expect(refrescar).not.toHaveBeenCalled();
  });

  it('T-203-4: y lo local se queda, que es lo que hace que se vea al instante', async () => {
    // El arreglo obvio —quitar el estado local y confiar en el refresco— cambiaría una espera
    // de cero por una de red en cada subida.
    render(<MediaPicker {...PROPS} />);
    await elegirFichero();

    // La imagen elegida se entrega al formulario sin haber esperado a ningún servidor.
    expect(PROPS.onElegir).toHaveBeenCalled();
  });
});
