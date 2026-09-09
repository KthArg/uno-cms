import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { crearAlmacen, clavesDeTags } from '@/examples/web-remota/lib/almacen.js';
import { verificarAviso } from '@/examples/web-remota/lib/aviso.js';
import { contenidoParaLaPagina } from '@/examples/web-remota/lib/contenido.js';

/**
 * T-A-37 … T-A-41: **el otro lado del aviso** (issue #287, spec 16 §7.9).
 *
 * ## Por qué esto es lo que cierra la fase
 *
 * Todo lo demás del aviso se probó con el emisor contra un `fetch` de mentira, o sea nuestros
 * dos lados hablando entre ellos. Es la misma fragilidad que ADR-701 dejó anotada y que
 * `examples/web-remota/` vino a cerrar para la vista previa:
 *
 * > Nadie ha integrado esto en una web de verdad.
 *
 * Y **T-A-41 es el caso que justifica la fase entera**: que sin aviso no salga ni una petición.
 * Todo lo demás es maquinaria para que ese caso sea posible.
 */

const SECRETO = 'un-secreto-de-avisos-con-mas-de-32-caracteres';
const CMS = 'https://mi-cms.example';
const AHORA = 1_757_404_800_123;

function sobreDe(tags: string[], id = 'aviso-1', ts = AHORA) {
  return { id, evento: 'content.published', ts, tags };
}

/** Firma como lo hace el CMS: sobre `"<ts>.<cuerpo crudo>"`. */
function firmar(cuerpo: string, ts: number, secreto = SECRETO): string {
  return `sha256=${createHmac('sha256', secreto).update(`${ts}.${cuerpo}`).digest('hex')}`;
}

function cabecerasDe(pares: Record<string, string>) {
  return { get: (nombre: string) => pares[nombre.toLowerCase()] ?? null };
}

/** Un aviso bien formado, tal y como saldría del CMS. */
function avisoValido(tags: string[], opciones: { id?: string; ts?: number } = {}) {
  const ts = opciones.ts ?? AHORA;
  const cuerpoCrudo = JSON.stringify(sobreDe(tags, opciones.id ?? 'aviso-1', ts));

  return {
    cuerpoCrudo,
    cabeceras: cabecerasDe({
      'x-unocms-ts': String(ts),
      'x-unocms-firma': firmar(cuerpoCrudo, ts),
    }),
    secreto: SECRETO,
    ahora: () => AHORA,
  };
}

function respuesta(cuerpo: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) });
}

/** Un CMS de mentira que apunta a qué direcciones se le piden. */
function cmsQueContesta() {
  const buscar = vi.fn((url: string) =>
    url.includes('/testimonials') || url.includes('/faqs')
      ? respuesta({ items: [{ author: 'Ana' }] })
      : respuesta({ data: { title: 'Hola' } })
  );

  return { buscar, pedidas: () => buscar.mock.calls.map(([url]) => url) };
}

describe('T-A-37 y T-A-38 — la puerta', () => {
  it('T-A-37: una firma inválida se rechaza', () => {
    const aviso = avisoValido(['content:hero']);

    expect(
      verificarAviso({
        ...aviso,
        cabeceras: cabecerasDe({
          'x-unocms-ts': String(AHORA),
          'x-unocms-firma': `sha256=${'0'.repeat(64)}`,
        }),
      })
    ).toEqual({ ok: false });
  });

  it('T-A-37b: un cuerpo manipulado se rechaza IGUAL, sin decir cuál de las dos cosas falló', () => {
    const aviso = avisoValido(['content:hero']);
    const manipulado = aviso.cuerpoCrudo.replace('content:hero', 'content:faqs');

    const porFirma = verificarAviso({
      ...aviso,
      cabeceras: cabecerasDe({
        'x-unocms-ts': String(AHORA),
        'x-unocms-firma': `sha256=${'0'.repeat(64)}`,
      }),
    });
    const porCuerpo = verificarAviso({ ...aviso, cuerpoCrudo: manipulado });

    // Idénticos: distinguirlos le diría a quien está probando por dónde iba bien.
    expect(porCuerpo).toEqual(porFirma);
    expect(porCuerpo).toEqual({ ok: false });
  });

  it('T-A-37c: una firma hecha con otro secreto no vale', () => {
    const aviso = avisoValido(['content:hero']);

    expect(
      verificarAviso({
        ...aviso,
        cabeceras: cabecerasDe({
          'x-unocms-ts': String(AHORA),
          'x-unocms-firma': firmar(
            aviso.cuerpoCrudo,
            AHORA,
            'otro-secreto-igual-de-largo-pero-otro'
          ),
        }),
      })
    ).toEqual({ ok: false });
  });

  it('T-A-38: un ts fuera de la ventana de cinco minutos se rechaza', () => {
    const viejo = AHORA - 6 * 60 * 1000;
    const aviso = avisoValido(['content:hero'], { ts: viejo });

    // La firma es correcta —es un aviso legítimo capturado y reenviado—, y aun así no pasa.
    // Sin esto, quien lo capture lo puede reenviar cuando quiera, para siempre.
    expect(verificarAviso(aviso)).toEqual({ ok: false });
  });

  it('T-A-38b: y uno del futuro también', () => {
    expect(verificarAviso(avisoValido(['content:hero'], { ts: AHORA + 6 * 60 * 1000 }))).toEqual({
      ok: false,
    });
  });

  it('cambiar el ts de la cabecera sin refirmar no cuela', () => {
    const aviso = avisoValido(['content:hero'], { ts: AHORA - 6 * 60 * 1000 });

    // El intento evidente para esquivar la ventana: reenviar el sobre viejo con un `ts` nuevo en
    // la cabecera. La firma cubre el `ts`, así que deja de cuadrar.
    expect(
      verificarAviso({
        ...aviso,
        cabeceras: cabecerasDe({
          'x-unocms-ts': String(AHORA),
          'x-unocms-firma': aviso.cabeceras.get('x-unocms-firma') ?? '',
        }),
      })
    ).toEqual({ ok: false });
  });

  it('sin secreto configurado no pasa nada, ni siquiera un aviso bueno', () => {
    expect(verificarAviso({ ...avisoValido(['content:hero']), secreto: '' })).toEqual({
      ok: false,
    });
  });

  it('un aviso bueno pasa, y devuelve el sobre del CUERPO', () => {
    const resultado = verificarAviso(avisoValido(['content:hero']));

    expect(resultado).toEqual({
      ok: true,
      sobre: { id: 'aviso-1', evento: 'content.published', ts: AHORA, tags: ['content:hero'] },
    });
  });
});

describe('los tags que esta web entiende', () => {
  it('un tag de contenido se convierte en su clave', () => {
    expect(clavesDeTags(['content:hero', 'content:testimonials'])).toEqual([
      'hero',
      'testimonials',
    ]);
  });

  it('un tag desconocido se ignora, y no rompe nada', () => {
    // El CMS puede añadir tags nuevos —`settings` es el primero— y una web vieja no tiene por
    // qué caerse ni ponerse a pedir lo que no entiende.
    expect(clavesDeTags(['settings', 'content:hero', 'inventado'])).toEqual(['hero']);
  });
});

describe('T-A-39, T-A-40 y T-A-41 — qué se pide y cuándo', () => {
  it('T-A-41: SIN AVISO NO SE PIDE NADA', async () => {
    const almacen = crearAlmacen();
    const { buscar, pedidas } = cmsQueContesta();

    // La primera visita llena el almacén: cinco claves, cinco peticiones.
    await contenidoParaLaPagina(CMS, almacen, buscar);
    expect(pedidas()).toHaveLength(5);

    // Y a partir de ahí, nada. Es lo que se pedía al abrir la fase: que el contenido se solicite
    // solo cuando llega el aviso, y de otra manera no.
    const contenido = await contenidoParaLaPagina(CMS, almacen, buscar);
    await contenidoParaLaPagina(CMS, almacen, buscar);

    expect(pedidas()).toHaveLength(5);
    // Y lo que se sirve es el contenido de verdad, no un hueco.
    expect(contenido['hero']).toEqual({ title: 'Hola' });
    expect(contenido['testimonials']).toEqual([{ author: 'Ana' }]);
  });

  it('T-A-40: al llegar un aviso se pide SOLO lo que nombra, y con ?v=', async () => {
    const almacen = crearAlmacen();
    const { buscar, pedidas } = cmsQueContesta();

    await contenidoParaLaPagina(CMS, almacen, buscar);
    buscar.mockClear();

    almacen.aplicarAviso(sobreDe(['content:testimonials']));
    await contenidoParaLaPagina(CMS, almacen, buscar);

    // Una sola petición, la de la colección avisada. Ni `hero`, ni `about`, ni `seo`, ni `faqs`.
    expect(pedidas()).toEqual([`${CMS}/api/content/testimonials?v=${AHORA}`]);
  });

  it('T-A-40b: el ?v= es lo que esquiva la CDN, así que tiene que ser el ts del aviso', async () => {
    const almacen = crearAlmacen();
    const { buscar, pedidas } = cmsQueContesta();

    await contenidoParaLaPagina(CMS, almacen, buscar);
    // La primera vez va **sin** `v`: no hay copia vieja en la CDN que esquivar, y ensuciar la
    // caché con una entrada por visita sería justo lo contrario de lo que se busca.
    expect(pedidas()[0]).not.toContain('?v=');

    buscar.mockClear();
    almacen.aplicarAviso(sobreDe(['content:hero'], 'otro', 999));
    await contenidoParaLaPagina(CMS, almacen, buscar);

    expect(pedidas()).toEqual([`${CMS}/api/content/hero?v=999`]);
  });

  it('T-A-39: un aviso repetido con el mismo id no revalida dos veces', async () => {
    const almacen = crearAlmacen();
    const { buscar, pedidas } = cmsQueContesta();

    await contenidoParaLaPagina(CMS, almacen, buscar);

    expect(almacen.aplicarAviso(sobreDe(['content:hero'], 'aviso-repetido'))).toBe(true);
    await contenidoParaLaPagina(CMS, almacen, buscar);
    buscar.mockClear();

    // El reintento del CMS manda el MISMO id, justamente para que esto se pueda hacer.
    expect(almacen.aplicarAviso(sobreDe(['content:hero'], 'aviso-repetido'))).toBe(false);
    await contenidoParaLaPagina(CMS, almacen, buscar);

    expect(pedidas()).toEqual([]);
  });

  it('T-A-39b: dos avisos distintos sobre la misma clave sí se aplican los dos', async () => {
    const almacen = crearAlmacen();
    const { buscar, pedidas } = cmsQueContesta();

    await contenidoParaLaPagina(CMS, almacen, buscar);

    almacen.aplicarAviso(sobreDe(['content:hero'], 'uno'));
    await contenidoParaLaPagina(CMS, almacen, buscar);
    buscar.mockClear();

    // Si la memoria de ids fuera por clave en vez de por id, este segundo cambio se perdería.
    almacen.aplicarAviso(sobreDe(['content:hero'], 'dos'));
    await contenidoParaLaPagina(CMS, almacen, buscar);

    expect(pedidas()).toHaveLength(1);
  });

  it('si el CMS no contesta se sirve la copia vieja, y se reintenta en la siguiente visita', async () => {
    const almacen = crearAlmacen();
    const { buscar } = cmsQueContesta();

    await contenidoParaLaPagina(CMS, almacen, buscar);
    almacen.aplicarAviso(sobreDe(['content:hero']));

    const caido = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
    const conElCmsCaido = await contenidoParaLaPagina(CMS, almacen, caido);

    // Enseñar lo anterior es enseñar algo desactualizado; dejarlo fuera es enseñar la página
    // rota. Lo primero es menos malo, y además es recuperable.
    expect(conElCmsCaido['hero']).toEqual({ title: 'Hola' });

    // Y sigue pendiente: no se ha dado por bueno un fallo.
    const otraVez = vi.fn(() => respuesta({ data: { title: 'Ya sí' } }));
    const recuperado = await contenidoParaLaPagina(CMS, almacen, otraVez);
    expect(recuperado['hero']).toEqual({ title: 'Ya sí' });
  });

  it('un aviso de una clave que nunca se pidió no provoca una petición', async () => {
    const almacen = crearAlmacen();
    const { buscar, pedidas } = cmsQueContesta();

    // Marcar lo que no se tiene no adelanta nada: la primera vez se pide igual, y sin `?v=`
    // porque no hay copia vieja que esquivar.
    almacen.aplicarAviso(sobreDe(['content:hero']));
    await contenidoParaLaPagina(CMS, almacen, buscar);

    expect(pedidas().filter((url) => url.includes('?v='))).toEqual([]);
    expect(pedidas()).toHaveLength(5);
  });

  it('la memoria de ids tiene tope, o sería una fuga', () => {
    const almacen = crearAlmacen();

    // 250 avisos distintos, con tope 200: el primero tiene que haberse olvidado.
    for (let i = 0; i < 250; i += 1) almacen.aplicarAviso(sobreDe(['content:hero'], `id-${i}`));

    expect(almacen.aplicarAviso(sobreDe(['content:hero'], 'id-0'))).toBe(true);
    // Y los recientes se siguen recordando, que es para lo que sirve.
    expect(almacen.aplicarAviso(sobreDe(['content:hero'], 'id-249'))).toBe(false);
  });
});
