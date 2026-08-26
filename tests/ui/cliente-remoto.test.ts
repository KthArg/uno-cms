import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FUENTE_DEL_CLIENTE_REMOTO } from '@/cms/preview/cliente-remoto';

/**
 * T-R-18: **el cliente que va en la web de destino** (spec 08 §4.6, ADR-701).
 *
 * ## Se prueban los bytes que se sirven, no una copia
 *
 * El módulo se importa con una URL `data:` construida desde la **misma cadena** que devuelve
 * `/preview-cliente.js`. No hay una segunda versión escrita en TypeScript "para poder probarla":
 * eso sería probar una cosa y desplegar otra, que es la forma más cara de tener cobertura.
 *
 * ## Lo único que queda fuera, y es una línea
 *
 * `conectar()` saca el origen del CMS de `import.meta.url`, y un módulo importado desde una URL
 * `data:` no tiene origen. Por eso la lógica vive en `crearCliente(origen)` y los tests le pasan
 * uno. Lo que no cubre ningún caso de aquí es que `conectar` le pase el origen correcto — eso se
 * ve al integrarlo de verdad, y está dicho en `docs/DEVELOPER.md`.
 */

const CMS = 'https://mi-cms.example';

interface Cliente {
  (alCambiar: (contenido: Record<string, unknown>) => void, opciones?: unknown): () => unknown;
}

let crearCliente: (origen: string) => Cliente;

beforeAll(async () => {
  const url = `data:text/javascript;base64,${Buffer.from(FUENTE_DEL_CLIENTE_REMOTO, 'utf8').toString('base64')}`;
  const modulo = (await import(/* @vite-ignore */ url)) as {
    crearCliente: (origen: string) => Cliente;
  };

  crearCliente = modulo.crearCliente;
});

/** La respuesta de la ruta de borradores, con el contenido que se quiera. */
function respuesta(cuerpo: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) });
}

const CONTENIDO = {
  hero: { title: 'BORRADOR hero' },
  testimonials: [{ quote: 'uno' }, { quote: 'dos' }],
};

function mensaje(datos: unknown, origen: string = CMS) {
  window.dispatchEvent(new MessageEvent('message', { data: datos, origin: origen }));
}

/** Deja que se resuelvan las promesas del `fetch` antes de mirar nada. */
async function asentar() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  window.history.replaceState({}, '', '/?unocms_preview=1&token=el-token');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lo primero que hace el cliente', () => {
  it('pide los borradores a la ruta del CMS, con el token y sin cookies', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValue(respuesta({ contenido: CONTENIDO, objetivo: { key: 'hero' } }) as never);
    const alCambiar = vi.fn();

    crearCliente(CMS)(alCambiar);
    await asentar();

    const [url, opciones] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(`${CMS}/api/preview/contenido?token=el-token`);
    // Sin cookies: lo que autoriza es el token, no una sesión. Mandarlas obligaría al servidor
    // a responder con credenciales y no hace falta ninguna.
    expect(opciones).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    expect(alCambiar).toHaveBeenCalledWith(CONTENIDO);
  });

  it('avisa al panel de que hay alguien escuchando, con origen explícito', async () => {
    const alPadre = vi.spyOn(window.parent, 'postMessage');
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      respuesta({ contenido: CONTENIDO, objetivo: { key: 'hero' } }) as never
    );

    crearCliente(CMS)(vi.fn());
    await asentar();

    // Nunca `*`: mandar a `*` entregaría el aviso a quien sea que esté por encima de esta web.
    expect(alPadre).toHaveBeenCalledWith({ type: 'cms:ready' }, CMS);
  });

  it('sin token en la dirección, lo dice y no pide nada', async () => {
    window.history.replaceState({}, '', '/?unocms_preview=1');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const alFallar = vi.fn();

    crearCliente(CMS)(vi.fn(), { alFallar });
    await asentar();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(alFallar).toHaveBeenCalledWith('sin-token');
  });

  it('si el CMS rechaza, lo dice con un motivo genérico', async () => {
    // La ruta responde 404 a todo lo que rechaza y no dice por qué. Aquí tampoco se adivina:
    // inventarse "el token ha caducado" sería afirmar algo que no sabemos.
    vi.spyOn(globalThis, 'fetch').mockReturnValue(Promise.resolve({ ok: false }) as never);
    const alFallar = vi.fn();

    crearCliente(CMS)(vi.fn(), { alFallar });
    await asentar();

    expect(alFallar).toHaveBeenCalledWith('sin-acceso');
  });

  it('si no hay red, también lo dice', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(Promise.reject(new Error('sin red')) as never);
    const alFallar = vi.fn();

    crearCliente(CMS)(vi.fn(), { alFallar });
    await asentar();

    expect(alFallar).toHaveBeenCalledWith('sin-red');
  });
});

describe('T-R-18 — de quién se aceptan mensajes', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      respuesta({ contenido: CONTENIDO, objetivo: { key: 'hero' } }) as never
    );
  });

  it('un mensaje que no viene del CMS se descarta', async () => {
    const alCambiar = vi.fn();
    crearCliente(CMS)(alCambiar);
    await asentar();
    alCambiar.mockClear();

    // Bien formado, con la clave correcta y en orden. Lo único que falla es de dónde viene.
    mensaje(
      { type: 'cms:update', key: 'hero', data: { title: 'INYECTADO' }, seq: 1 },
      'https://atacante.example'
    );

    // Y se descarta **en silencio**: contestar —aunque fuera para rechazarlo— confirma que hay
    // alguien escuchando en este iframe.
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('un origen que contiene al del CMS tampoco pasa', async () => {
    // El mismo fallo clásico que T-R-7, ahora del otro lado del canal: comparar con `includes`
    // regalaría el permiso a cualquiera que registre un dominio con el nuestro dentro.
    const alCambiar = vi.fn();
    crearCliente(CMS)(alCambiar);
    await asentar();
    alCambiar.mockClear();

    mensaje(
      { type: 'cms:update', key: 'hero', data: { title: 'INYECTADO' }, seq: 1 },
      `${CMS}.malo.io`
    );

    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('el del CMS sí pasa', async () => {
    // El caso que hace que los dos de arriba puedan fallar: sin este, quitar la comprobación de
    // origen no rompería nada porque nadie comprueba que algún mensaje llegue.
    const alCambiar = vi.fn();
    crearCliente(CMS)(alCambiar);
    await asentar();
    alCambiar.mockClear();

    mensaje({ type: 'cms:update', key: 'hero', data: { title: 'NUEVO' }, seq: 1 });

    expect(alCambiar).toHaveBeenCalledWith(expect.objectContaining({ hero: { title: 'NUEVO' } }));
  });

  it('deja de escuchar al desconectar', async () => {
    const alCambiar = vi.fn();
    const desconectar = crearCliente(CMS)(alCambiar);
    await asentar();
    alCambiar.mockClear();

    desconectar();
    mensaje({ type: 'cms:update', key: 'hero', data: { title: 'NUEVO' }, seq: 1 });

    expect(alCambiar).not.toHaveBeenCalled();
  });
});

describe('qué mensajes se aplican', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      respuesta({ contenido: CONTENIDO, objetivo: { key: 'hero' } }) as never
    );
  });

  it('un mensaje para otra clave se ignora (ADR-501)', async () => {
    // El token autoriza **una** clave. Si un mensaje pudiera cambiar cualquier sección, el
    // iframe se convertiría en una forma de enseñar contenido que ese enlace no autoriza.
    const alCambiar = vi.fn();
    crearCliente(CMS)(alCambiar);
    await asentar();
    alCambiar.mockClear();

    mensaje({ type: 'cms:update', key: 'about', data: { heading: 'OTRO' }, seq: 1 });

    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('un mensaje que se cruzó con otro más nuevo se ignora', async () => {
    // `postMessage` no promete orden entre dos ventanas. Sin esto, dos mensajes que se cruzan
    // dejan la vista previa enseñando **lo que se escribió antes**, y quien mira ve su texto
    // retroceder solo.
    const alCambiar = vi.fn();
    crearCliente(CMS)(alCambiar);
    await asentar();

    mensaje({ type: 'cms:update', key: 'hero', data: { title: 'SEGUNDO' }, seq: 2 });
    alCambiar.mockClear();
    mensaje({ type: 'cms:update', key: 'hero', data: { title: 'PRIMERO' }, seq: 1 });

    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('un sobre mal formado se ignora sin romper nada', async () => {
    const alCambiar = vi.fn();
    crearCliente(CMS)(alCambiar);
    await asentar();
    alCambiar.mockClear();

    for (const basura of [
      null,
      'una cadena',
      { type: 'cms:update' },
      { type: 'cms:update', key: 'hero', data: 'no es un objeto', seq: 1 },
      { type: 'cms:update', key: 'hero', data: { x: 1 }, seq: 'uno' },
      { type: 'otra-cosa', key: 'hero', data: { x: 1 }, seq: 1 },
    ]) {
      mensaje(basura);
    }

    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('un elemento de colección se sustituye en su sitio', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      respuesta({
        contenido: CONTENIDO,
        objetivo: { key: 'testimonials.abc', coleccion: 'testimonials', indice: 1 },
      }) as never
    );

    const alCambiar = vi.fn();
    crearCliente(CMS)(alCambiar);
    await asentar();
    alCambiar.mockClear();

    mensaje({ type: 'cms:update', key: 'testimonials.abc', data: { quote: 'CAMBIADO' }, seq: 1 });

    // La lista conserva el orden y el resto de elementos como estaban: la vista previa tiene que
    // enseñar la sección en su sitio, no un elemento suelto.
    expect(alCambiar).toHaveBeenCalledWith(
      expect.objectContaining({
        testimonials: [{ quote: 'uno' }, { quote: 'CAMBIADO' }],
      })
    );
  });
});

describe('el relevo del token', () => {
  it('si la primera petición falló, el token nuevo la reintenta', async () => {
    // **Este es el caso que hace que el relevo sirva para algo.** El cliente pide una vez al
    // conectar; si solo se guardara el token nuevo, no lo leería nadie y toda la cadena —el
    // reloj del panel, el mensaje, esto— no cambiaría una sola respuesta. Lo escribí así y el
    // test que decía comprobarlo no comprobaba nada; se vio al intentar hacerlo fallar.
    //
    // El caso real: la pestaña del panel llevaba rato abierta antes de que este iframe cargara,
    // así que el token de la dirección ya estaba muerto.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(Promise.resolve({ ok: false }) as never)
      .mockReturnValue(respuesta({ contenido: CONTENIDO, objetivo: { key: 'hero' } }) as never);

    const alCambiar = vi.fn();
    const alFallar = vi.fn();
    crearCliente(CMS)(alCambiar, { alFallar });
    await asentar();

    expect(alFallar).toHaveBeenCalledWith('sin-acceso');
    expect(alCambiar).not.toHaveBeenCalled();

    mensaje({ type: 'cms:token', token: 'el-nuevo', vidaEnSegundos: 900 });
    await asentar();

    // Se vuelve a pedir **con el token nuevo**, y la vista previa arranca en vez de quedarse
    // muerta hasta que alguien recargue.
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(`${CMS}/api/preview/contenido?token=el-nuevo`);
    expect(alCambiar).toHaveBeenCalledWith(CONTENIDO);
  });

  it('si ya hay contenido, un relevo no vuelve a pedir nada', async () => {
    // El token se guarda para cuando haga falta; pedir otra vez por tenerlo nuevo sería una
    // petición por cuarto de hora sin nada que enseñar a cambio.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValue(respuesta({ contenido: CONTENIDO, objetivo: { key: 'hero' } }) as never);

    crearCliente(CMS)(vi.fn());
    await asentar();
    fetchSpy.mockClear();

    mensaje({ type: 'cms:token', token: 'el-nuevo', vidaEnSegundos: 900 });
    await asentar();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('un relevo sin token válido no reintenta con un token vacío', async () => {
    // Si un mensaje mal formado dejara el token a vacío y reintentara, la petición saldría sin
    // credencial y el CMS respondería 404 — un fallo provocado por un mensaje que debería
    // haberse ignorado.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValue(Promise.resolve({ ok: false }) as never);

    crearCliente(CMS)(vi.fn(), { alFallar: vi.fn() });
    await asentar();
    fetchSpy.mockClear();

    mensaje({ type: 'cms:token', token: '', vidaEnSegundos: 900 });
    mensaje({ type: 'cms:token', vidaEnSegundos: 900 });
    await asentar();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
