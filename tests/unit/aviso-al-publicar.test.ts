import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T-A-1 … T-A-24: el aviso al publicar (spec 16, issue #283).
 *
 * ## Lo que estos casos vigilan de verdad
 *
 * El aviso se manda **después** de responderle al editor, dentro de un `after()`. Eso significa
 * que casi todo lo que puede salir mal aquí sale mal en silencio: nadie mira la pantalla cuando
 * ocurre. Así que la única forma de que estos casos sirvan es que comprueben **el contenido de
 * lo que se manda**, no que se mandó algo.
 *
 * Dos que se escribieron de la forma inútil primero, y por eso están dichos aquí:
 *
 * - Espiar que `fetch` se llamó no dice si el tag que viaja sirve para algo. Es el fallo de
 *   #116 —invalidar el elemento y dejar la lista sin enterarse— y aquí vuelve a caber entero.
 * - Contar llamadas no distingue "no se avisó" de "se avisó y el destino lo rechazó".
 */

// `after` y `audit` se sustituyen: el primero necesita el contexto de una petición de Next, y el
// segundo escribe en la base de datos. Lo que se prueba aquí es qué se les pide, no lo que hacen.
const after = vi.hoisted(() => vi.fn((tarea: () => Promise<void>) => tarea()));
const audit = vi.hoisted(() =>
  vi.fn((_evento: { action: string; meta: Record<string, unknown> }) => Promise.resolve())
);

vi.mock('next/server', () => ({ after }));
vi.mock('@/cms/security/audit', () => ({ audit }));

const {
  avisar,
  componerSobre,
  configuracionDelAviso,
  entregar,
  firmar,
  reiniciarAvisoParaTests,
  tagsDe,
} = await import('@/cms/core/aviso');

const SECRETO = 'un-secreto-de-avisos-con-mas-de-32-caracteres';
const DESTINO = 'https://mi-web.com/api/unocms';

/** El destino y el secreto puestos, que es el caso de la fase encendida. */
function encender(url = DESTINO, secreto = SECRETO): void {
  vi.stubEnv('WEBHOOK_URL', url);
  vi.stubEnv('WEBHOOK_SECRET', secreto);
}

/** Un `fetch` de mentira que guarda lo que le piden y contesta lo que se le diga. */
function fetchQueContesta(...respuestas: (number | Error)[]): {
  buscar: typeof fetch;
  llamadas: { url: string; opciones: RequestInit }[];
} {
  const llamadas: { url: string; opciones: RequestInit }[] = [];
  let vuelta = 0;

  const buscar = (async (url: string, opciones: RequestInit) => {
    llamadas.push({ url, opciones });

    const siguiente = respuestas[Math.min(vuelta, respuestas.length - 1)];
    vuelta += 1;

    if (siguiente instanceof Error) throw siguiente;
    return new Response(null, { status: siguiente });
  }) as unknown as typeof fetch;

  return { buscar, llamadas };
}

const SOBRE_DE_PRUEBA = {
  id: 'aviso-de-prueba',
  evento: 'content.published' as const,
  ts: 1_757_404_800_123,
  claves: [{ key: 'hero', tipo: 'singleton' as const }],
  tags: ['content:hero'],
};

beforeEach(() => {
  reiniciarAvisoParaTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('T-A-1 a T-A-5 — el interruptor', () => {
  it('T-A-1: sin ninguna de las dos variables no hay configuración, y no se queja', () => {
    const queja = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('WEBHOOK_URL', undefined);
    vi.stubEnv('WEBHOOK_SECRET', undefined);

    expect(configuracionDelAviso()).toBeNull();
    // No quejarse es parte del caso: la inmensa mayoría de despliegues no usa esto, y un error
    // por publicación sobre algo que nadie pidió encender es ruido que enseña a no leer los logs.
    expect(queja).not.toHaveBeenCalled();
  });

  it('T-A-2: con una sola de las dos se apaga Y se dice por consola', () => {
    const queja = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('WEBHOOK_URL', DESTINO);
    vi.stubEnv('WEBHOOK_SECRET', undefined);

    expect(configuracionDelAviso()).toBeNull();
    expect(queja).toHaveBeenCalledOnce();
    expect(queja.mock.calls[0]?.[0]).toContain('solo hay una de las dos');
  });

  it('T-A-2b: la queja se dice una vez por proceso, no una por publicación', () => {
    const queja = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('WEBHOOK_URL', DESTINO);
    vi.stubEnv('WEBHOOK_SECRET', undefined);

    configuracionDelAviso();
    configuracionDelAviso();
    configuracionDelAviso();

    expect(queja).toHaveBeenCalledOnce();
  });

  it('T-A-3: una http que no es bucle local apaga la fase', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    encender('http://mi-web.com/api/unocms');

    expect(configuracionDelAviso()).toBeNull();
  });

  it('T-A-3b: y no se cuela por parecerse a localhost', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    for (const disfraz of [
      'http://localhost.malo.io/api',
      'http://mi-web.com/#localhost',
      'http://127.0.0.1.malo.io/api',
    ]) {
      reiniciarAvisoParaTests();
      encender(disfraz);
      expect(configuracionDelAviso(), disfraz).toBeNull();
    }
  });

  it('T-A-4: http en el bucle local sí vale', () => {
    encender('http://localhost:3001/api/unocms');
    expect(configuracionDelAviso()).not.toBeNull();

    encender('http://127.0.0.1:3001/api/unocms');
    expect(configuracionDelAviso()).not.toBeNull();
  });

  it('T-A-5: un secreto corto apaga la fase, y la queja no dice cuánto mide', () => {
    const queja = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    encender(DESTINO, 'corto');

    expect(configuracionDelAviso()).toBeNull();
    // La longitud de un secreto es información sobre el secreto.
    expect(queja.mock.calls[0]?.[0]).not.toContain('5');
  });

  it('una URL que no es absoluta apaga la fase', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    encender('/api/unocms');

    expect(configuracionDelAviso()).toBeNull();
  });
});

describe('T-A-6 a T-A-9 — la firma', () => {
  it('T-A-6: lo firmado es byte a byte lo enviado', async () => {
    const { buscar, llamadas } = fetchQueContesta(200);

    await entregar({ url: DESTINO, secreto: SECRETO }, SOBRE_DE_PRUEBA, buscar);

    const enviado = llamadas[0]?.opciones.body as string;
    const cabeceras = llamadas[0]?.opciones.headers as Record<string, string>;

    // Se recalcula la firma sobre **el cuerpo que salió**, no sobre uno reconstruido. Si el
    // código serializara dos veces —una para firmar y otra para mandar— este caso lo caza.
    const esperada = `sha256=${createHmac('sha256', SECRETO)
      .update(`${SOBRE_DE_PRUEBA.ts}.${enviado}`)
      .digest('hex')}`;

    expect(cabeceras['X-UnoCMS-Firma']).toBe(esperada);
    expect(JSON.parse(enviado)).toEqual(SOBRE_DE_PRUEBA);
  });

  it('T-A-7: cambiar un solo byte del cuerpo cambia la firma', () => {
    const cuerpo = JSON.stringify(SOBRE_DE_PRUEBA);
    const tocado = cuerpo.replace('content:hero', 'content:otro');

    expect(firmar(SECRETO, SOBRE_DE_PRUEBA.ts, tocado)).not.toBe(
      firmar(SECRETO, SOBRE_DE_PRUEBA.ts, cuerpo)
    );
  });

  it('T-A-8: cambiar el ts sin refirmar también la cambia', () => {
    const cuerpo = JSON.stringify(SOBRE_DE_PRUEBA);

    // Es lo que impide reenviar un aviso capturado con una fecha nueva: si el `ts` viajara solo
    // en la cabecera, la ventana anti-replay del receptor no protegería de nada.
    expect(firmar(SECRETO, SOBRE_DE_PRUEBA.ts + 1, cuerpo)).not.toBe(
      firmar(SECRETO, SOBRE_DE_PRUEBA.ts, cuerpo)
    );
  });

  it('T-A-9: la misma firma no sale con APP_SECRET (ADR-1001)', () => {
    const appSecret = 'un-secreto-de-aplicacion-con-mas-de-32-caracteres';
    const cuerpo = JSON.stringify(SOBRE_DE_PRUEBA);

    expect(firmar(appSecret, SOBRE_DE_PRUEBA.ts, cuerpo)).not.toBe(
      firmar(SECRETO, SOBRE_DE_PRUEBA.ts, cuerpo)
    );
  });
});

describe('T-A-11, T-A-12 y T-A-18 — qué tags viajan', () => {
  it('T-A-11: un singleton manda su propio tag', () => {
    expect(tagsDe('content.published', [{ key: 'hero', tipo: 'singleton' }])).toEqual([
      'content:hero',
    ]);
  });

  it('T-A-12: un elemento de colección manda el tag de LA COLECCIÓN, no el suyo', () => {
    const tags = tagsDe('content.published', [
      { key: 'testimonials.a1b2', tipo: 'item', coleccion: 'testimonials' },
    ]);

    expect(tags).toEqual(['content:testimonials']);
    // Y explícitamente NO el del elemento: `/api/content/testimonials.a1b2` responde 404, así
    // que mandarlo sería mandar algo que quien lo reciba no puede pedir. Es #116 hacia fuera.
    expect(tags).not.toContain('content:testimonials.a1b2');
  });

  it('T-A-12b: varios elementos de la misma colección son UN tag', () => {
    expect(
      tagsDe('content.published', [
        { key: 'testimonials.a', tipo: 'item', coleccion: 'testimonials' },
        { key: 'testimonials.b', tipo: 'item', coleccion: 'testimonials' },
        { key: 'testimonials.c', tipo: 'item', coleccion: 'testimonials' },
      ])
    ).toEqual(['content:testimonials']);
  });

  it('T-A-18: una clave que cms.config.ts ya no declara no viaja', () => {
    // El caso de ADR-404: se quita una sección del código y sus filas siguen en la base de
    // datos. Su tag saldría hacia fuera y la web pediría una clave que responde 404.
    expect(
      tagsDe('content.published', [
        { key: 'hero', tipo: 'singleton' },
        { key: 'seccion-fantasma', tipo: 'singleton' },
        { key: 'x.1', tipo: 'item', coleccion: 'coleccion-fantasma' },
      ])
    ).toEqual(['content:hero']);
  });

  it('un item sin colección no inventa un tag a partir de su clave', () => {
    expect(tagsDe('content.published', [{ key: 'testimonials.a1b2', tipo: 'item' }])).toEqual([]);
  });

  it('los ajustes mandan su tag, y ninguna clave de contenido', () => {
    expect(tagsDe('settings.updated', [])).toEqual(['settings']);
  });

  it('T-A-16: los medios van sin tags', () => {
    const claves = [{ key: 'hero', tipo: 'singleton' as const }];

    expect(tagsDe('media.uploaded', claves)).toEqual([]);
    expect(tagsDe('media.deleted', claves)).toEqual([]);
  });
});

describe('T-A-19 a T-A-24 — la entrega', () => {
  const config = { url: DESTINO, secreto: SECRETO };

  it('T-A-19: un 200 es un intento y se acabó', async () => {
    const { buscar, llamadas } = fetchQueContesta(200);

    expect(await entregar(config, SOBRE_DE_PRUEBA, buscar)).toEqual({
      ok: true,
      intentos: 1,
      estado: 200,
    });
    expect(llamadas).toHaveLength(1);
  });

  it('T-A-19b: un 500 se reintenta una vez y se rinde', async () => {
    const { buscar, llamadas } = fetchQueContesta(500);

    expect(await entregar(config, SOBRE_DE_PRUEBA, buscar)).toEqual({
      ok: false,
      intentos: 2,
      estado: 500,
      motivo: 'estado',
    });
    expect(llamadas).toHaveLength(2);
  });

  it('T-A-21: el reintento manda EL MISMO sobre, con el mismo id', async () => {
    const { buscar, llamadas } = fetchQueContesta(new Error('la red se cayó'), 200);

    const resultado = await entregar(config, SOBRE_DE_PRUEBA, buscar);

    expect(resultado.ok).toBe(true);
    expect(resultado.intentos).toBe(2);

    // Es lo que permite a quien recibe descartar el duplicado en vez de revalidar dos veces.
    const ids = llamadas.map((l) => JSON.parse(l.opciones.body as string).id);
    expect(ids).toEqual(['aviso-de-prueba', 'aviso-de-prueba']);
  });

  it('T-A-22: un 4xx NO se reintenta', async () => {
    const { buscar, llamadas } = fetchQueContesta(401);

    expect(await entregar(config, SOBRE_DE_PRUEBA, buscar)).toEqual({
      ok: false,
      intentos: 1,
      estado: 401,
      motivo: 'estado',
    });
    // Su configuración está mal —firma, ruta o secreto—. Repetir no la arregla y le duplica el
    // trabajo de rechazarnos.
    expect(llamadas).toHaveLength(1);
  });

  it('T-A-20: un fallo de red se reintenta y no lanza', async () => {
    const { buscar, llamadas } = fetchQueContesta(new Error('ETIMEDOUT'));

    expect(await entregar(config, SOBRE_DE_PRUEBA, buscar)).toEqual({
      ok: false,
      intentos: 2,
      motivo: 'red',
    });
    expect(llamadas).toHaveLength(2);
  });

  it('T-A-20b: se pide el plazo de dos segundos, y abortarlo se trata como fallo de red', async () => {
    // Se controla el propio `AbortSignal.timeout` en vez de esperar dos segundos de reloj. Así
    // el caso comprueba las dos mitades de verdad: **que se pide el plazo** —si alguien lo
    // quitara, el espía no vería la llamada— y que abortar acaba en `motivo: 'red'`.
    const controlador = new AbortController();
    const espia = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controlador.signal);

    const abortado = (): DOMException =>
      new DOMException('The operation was aborted.', 'AbortError');

    const buscar = ((_url: string, opciones: RequestInit) =>
      new Promise((_, rechazar) => {
        // El segundo intento recibe la MISMA señal, ya abortada: escuchar el evento no vale,
        // porque ya pasó. Sin esta rama el test se queda colgado, que es exactamente lo que le
        // pasaría a `fetch` de verdad si no mirara `aborted` — y por eso lo mira.
        if (opciones.signal?.aborted === true) {
          rechazar(abortado());
          return;
        }

        opciones.signal?.addEventListener('abort', () => {
          rechazar(abortado());
        });
        controlador.abort();
      })) as unknown as typeof fetch;

    expect(await entregar(config, SOBRE_DE_PRUEBA, buscar)).toEqual({
      ok: false,
      intentos: 2,
      motivo: 'red',
    });
    expect(espia).toHaveBeenCalledWith(2000);
  });

  it('una redirección no se sigue, y no se reintenta', async () => {
    const { buscar, llamadas } = fetchQueContesta(302);

    // `fetch` sigue las redirecciones por omisión, y eso mandaría la cabecera de firma **y el
    // cuerpo** al destino nuevo. Quien controle un redirector abierto en el dominio configurado
    // se llevaría un sobre firmado válido.
    expect(await entregar(config, SOBRE_DE_PRUEBA, buscar)).toEqual({
      ok: false,
      intentos: 1,
      estado: 302,
      motivo: 'redirigido',
    });
    expect(llamadas[0]?.opciones.redirect).toBe('manual');
    expect(llamadas).toHaveLength(1);
  });

  it('T-A-24: dos sobres seguidos llevan id distintos', () => {
    const claves = [{ key: 'hero', tipo: 'singleton' as const }];

    expect(componerSobre('content.published', claves).id).not.toBe(
      componerSobre('content.published', claves).id
    );
  });

  it('el ts que se firma es el del sobre', async () => {
    const { buscar, llamadas } = fetchQueContesta(200);
    const sobre = componerSobre(
      'content.published',
      [{ key: 'hero', tipo: 'singleton' }],
      () => 1_000_000_000_000
    );

    await entregar(config, sobre, buscar);

    const cabeceras = llamadas[0]?.opciones.headers as Record<string, string>;
    expect(cabeceras['X-UnoCMS-Ts']).toBe('1000000000000');
    expect(JSON.parse(llamadas[0]?.opciones.body as string).ts).toBe(1_000_000_000_000);
  });
});

describe('T-A-23 y T-A-27 — lo que queda registrado', () => {
  it('T-A-27: con la fase apagada no se programa nada', () => {
    vi.stubEnv('WEBHOOK_URL', undefined);
    vi.stubEnv('WEBHOOK_SECRET', undefined);

    avisar('content.published', [{ key: 'hero', tipo: 'singleton' }]);

    // La comprobación va **antes** del `after`, no dentro: un despliegue sin esto configurado
    // —la inmensa mayoría— no arrastra una tarea diferida por cada publicación.
    expect(after).not.toHaveBeenCalled();
  });

  it('T-A-23: una entrega buena se audita como webhook.enviado', async () => {
    encender();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    avisar('content.published', [{ key: 'hero', tipo: 'singleton' }], {
      userId: 'u1',
      email: 'quien@publica.com',
    });
    await after.mock.results[0]?.value;

    expect(audit).toHaveBeenCalledOnce();
    const evento = audit.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(evento['action']).toBe('webhook.enviado');
    expect(evento['actorEmail']).toBe('quien@publica.com');
    expect(evento['meta']).toMatchObject({ estado: 204, intentos: 1, tags: ['content:hero'] });
  });

  it('T-A-23b: un fallo se audita como fallo, no se pierde', async () => {
    encender();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    avisar('content.published', [{ key: 'hero', tipo: 'singleton' }]);
    await after.mock.results[0]?.value;

    const evento = audit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(evento['action']).toBe('webhook.fallido');
    expect(evento['meta']).toMatchObject({ intentos: 2, estado: 500, motivo: 'estado' });
  });

  it('T-A-10: ni el secreto ni la firma ni la URL llegan a la auditoría', async () => {
    encender();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    avisar('content.published', [{ key: 'hero', tipo: 'singleton' }]);
    await after.mock.results[0]?.value;

    const registrado = JSON.stringify(audit.mock.calls[0]?.[0]);

    expect(registrado).not.toContain(SECRETO);
    expect(registrado).not.toContain('sha256=');
    expect(registrado).not.toContain('mi-web.com');
  });

  it('el registro usa `tags` y no `claves`, porque `audit` redactaría esa palabra', async () => {
    // No es una preferencia de nombres: `SENSITIVE_KEY_PARTS` de `cms/security/audit.ts` incluye
    // "clave", y compara por inclusión. Un campo llamado `claves` llegaría a la tabla como
    // "[redactado]" — un registro que parece completo y no dice nada.
    const { audit: auditReal } =
      await vi.importActual<typeof import('@/cms/security/audit')>('@/cms/security/audit');
    expect(typeof auditReal).toBe('function');

    encender();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    avisar('content.published', [{ key: 'hero', tipo: 'singleton' }]);
    await after.mock.results[0]?.value;

    const meta = audit.mock.calls[0]?.[0].meta;
    expect(meta).toHaveProperty('tags');
    expect(meta).not.toHaveProperty('claves');
  });
});
