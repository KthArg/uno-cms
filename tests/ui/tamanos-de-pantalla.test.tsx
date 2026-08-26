import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THROTTLE_MS } from '@/cms/preview/protocolo';
import { PANTALLAS, PreviewFrame, escalaDeVistaPrevia } from '@/cms/ui/PreviewFrame';

/**
 * T-138-1 … T-138-5: **mirar la vista previa en otro tamaño de pantalla** (SPEC §6.1, #138).
 *
 * Lo dibujaba el diagrama de §6.1 desde el principio y se aplazó en M5 con su motivo: lo que
 * resuelve es una anchura de iframe, y la vista previa en vivo funciona entera sin él.
 *
 * Lo que **no** puede hacer es costar la sesión de vista previa, y eso es T-138-1.
 */

const REMOTO = 'https://mi-web.example';

/** El `contentWindow` del iframe, espiado. */
function espiarIframe() {
  const enviados: { mensaje: unknown; origen: unknown }[] = [];

  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue({
    postMessage: (mensaje: unknown, origen: unknown) => {
      enviados.push({ mensaje, origen });
    },
  } as unknown as Window);

  return enviados;
}

/** El `cms:ready` que manda el iframe al montar. Ver el aviso sobre `origin: origen`. */
async function iframeListo(origen: string = window.location.origin) {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'cms:ready' }, origin: origen })
    );
  });
}

function elegir(nombre: RegExp) {
  return act(async () => {
    screen.getByRole('button', { name: nombre }).click();
  });
}

/** El tamaño de ventana que se le está pidiendo a la web de dentro. */
function ventanaPedida(contenedor: HTMLElement) {
  const iframe = contenedor.querySelector('iframe');
  return { ancho: iframe?.style.width ?? null, alto: iframe?.style.height ?? null };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('T-138-2 y T-138-3 — los dos tamaños', () => {
  it('escritorio es el estado inicial y el control dice cuál está elegido', () => {
    espiarIframe();
    render(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />);

    // `aria-pressed` es lo que hace que un lector de pantalla diga cuál está activo. Sin él,
    // los dos botones suenan igual y quien no ve el color no sabe en qué tamaño está mirando.
    expect(screen.getByRole('button', { name: /escritorio/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /móvil/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('cada tamaño pinta la web al ancho de ventana que dice su nombre', async () => {
    espiarIframe();
    const { container } = render(
      <PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />
    );

    // **Este es el caso que hay que leer entero.** No se comprueba que el recuadro se estreche:
    // se comprueba qué ancho de ventana cree tener la web de dentro, que es lo que decide qué
    // maqueta aplica.
    //
    // La primera versión de esta pieza solo estrechaba la caja, y con una web de verdad dentro
    // se vio que en "Escritorio" esa web decía «me creo de 398px, maqueta MÓVIL» — o sea que el
    // control enseñaba móvil en sus dos posiciones. Los siete casos de este fichero estaban en
    // verde. Lo cazó mirarlo, no ejecutarlo.
    expect(ventanaPedida(container)).toEqual({
      ancho: `${String(PANTALLAS.escritorio.ancho)}px`,
      alto: `${String(PANTALLAS.escritorio.alto)}px`,
    });

    await elegir(/móvil/i);
    expect(ventanaPedida(container)).toEqual({
      ancho: `${String(PANTALLAS.movil.ancho)}px`,
      alto: `${String(PANTALLAS.movil.alto)}px`,
    });

    await elegir(/escritorio/i);
    expect(ventanaPedida(container).ancho).toBe(`${String(PANTALLAS.escritorio.ancho)}px`);
  });

  it('los dos anchos son los de las pantallas que dicen ser', () => {
    // Topes en la dirección que importa en cada uno. Si el "móvil" subiera a 900 o el
    // "escritorio" bajara a 500, el control seguiría cambiando algo y dejaría de contestar la
    // pregunta que se hace quien edita.
    expect(PANTALLAS.movil.ancho).toBeLessThanOrEqual(430);
    // Por encima del corte habitual de escritorio: si no lo supera, la web de dentro seguirá
    // aplicando su maqueta estrecha con la etiqueta puesta al revés.
    expect(PANTALLAS.escritorio.ancho).toBeGreaterThanOrEqual(1024);

    // **Y el alto es el de una pantalla de verdad, no el hueco que sobre.** Una portada con
    // `height: 100vh` mide lo que mida esto: con un alto estirado a la escala del recuadro
    // ocuparía unos 1780 px en escritorio, que no es lo que ve nadie.
    expect(PANTALLAS.escritorio.alto).toBeLessThanOrEqual(1000);
    expect(PANTALLAS.escritorio.alto).toBeGreaterThanOrEqual(600);
    expect(PANTALLAS.movil.alto).toBeLessThanOrEqual(1000);
  });

  it('la escala encoge para caber, y nunca agranda', () => {
    // Encoger es lo que permite meter 1280 px en una columna de 400. Agrandar no enseñaría nada
    // nuevo y mentiría sobre el tamaño de las letras.
    expect(escalaDeVistaPrevia({ ancho: 400, alto: 2000 }, { ancho: 1280, alto: 800 })).toBeCloseTo(
      400 / 1280
    );
    expect(escalaDeVistaPrevia({ ancho: 2000, alto: 2000 }, { ancho: 390, alto: 844 })).toBe(1);
  });

  it('manda la dimensión más apretada, para que se vea la pantalla entera', () => {
    // **El caso que quita la doble barra de desplazamiento.** Encogiendo solo por el ancho, un
    // móvil de 844 px de alto no cabía en el recuadro y no se veía dónde corta la pantalla, que
    // es justo lo que se mira en una vista previa de móvil.
    const hueco = { ancho: 400, alto: 552 };

    expect(escalaDeVistaPrevia(hueco, { ancho: 390, alto: 844 })).toBeCloseTo(552 / 844);
    expect(escalaDeVistaPrevia(hueco, { ancho: 1280, alto: 800 })).toBeCloseTo(400 / 1280);
  });

  it('sin haber medido nada, la escala es 1 y no cero', () => {
    // El primer pintado ocurre antes de que nadie mida, y en los tests de componentes jsdom no
    // maqueta: todas las cajas miden cero. Con un cero al dividir, el iframe se quedaría
    // invisible y el fallo parecería del contenido.
    for (const sinMedir of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        escalaDeVistaPrevia({ ancho: sinMedir, alto: sinMedir }, { ancho: 1280, alto: 800 }),
        String(sinMedir)
      ).toBe(1);
    }
  });
});

describe('T-138-1 — cambiar de tamaño no recarga el iframe', () => {
  it('es el mismo nodo, con el mismo `src`, después de cambiar dos veces', async () => {
    espiarIframe();
    const { container } = render(
      <PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />
    );

    const antes = container.querySelector('iframe');
    const src = antes?.getAttribute('src');

    await elegir(/móvil/i);
    await elegir(/escritorio/i);

    // **El mismo nodo del DOM.** Un `key` por tamaño, o mover el iframe a otra rama del árbol
    // según el tamaño, lo remontaría: con una web remota eso recarga esa web y vuelve a pedir
    // los borradores, así que un clic en "Móvil" costaría la sesión de vista previa entera.
    expect(container.querySelector('iframe')).toBe(antes);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(src);
  });

  it('y el panel sigue mandando cambios después de haber cambiado de tamaño', async () => {
    // **Lo que este caso prueba, dicho con precisión**: que cambiar de tamaño no rompe el
    // envío. Escribí encima que "si el iframe se hubiera remontado no saldría ningún mensaje" y
    // es falso — en jsdom el iframe nunca carga nada, así que un remontaje no tendría
    // consecuencia observable aquí. Quien detecta el remontaje es el caso de arriba, mirando la
    // identidad del nodo.
    //
    // Aun así vale la pena: si el selector se hubiera implementado pintando dos subárboles
    // distintos, o reiniciando el estado del componente, el envío se quedaría por el camino y
    // esto se pondría rojo.
    const enviados = espiarIframe();
    const { rerender } = render(
      <PreviewFrame
        src={`${REMOTO}/?unocms_preview=1`}
        entryKey="hero"
        valores={{ title: 'uno' }}
        origenDestino={REMOTO}
      />
    );
    await iframeListo(REMOTO);
    enviados.length = 0;

    await elegir(/móvil/i);

    rerender(
      <PreviewFrame
        src={`${REMOTO}/?unocms_preview=1`}
        entryKey="hero"
        valores={{ title: 'escrito después de cambiar de tamaño' }}
        origenDestino={REMOTO}
      />
    );

    // El envío va con el throttle de §6.1: sin adelantar el reloj se queda esperando, y el
    // caso mediría el temporizador en vez del canal.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THROTTLE_MS + 10);
    });

    expect(enviados.length).toBeGreaterThan(0);
    expect(enviados.at(-1)?.mensaje).toMatchObject({
      data: { title: 'escrito después de cambiar de tamaño' },
    });
    expect(enviados.at(-1)?.origen).toBe(REMOTO);
  });
});

describe('T-138-4 y T-138-5 — lo que el tamaño no toca', () => {
  it('elegir un tamaño no habla con el servidor', async () => {
    // No se guarda en ningún sitio (issue #138): es una preferencia de quien mira, no del
    // sitio. Guardarla haría que una persona le cambiara la vista a otra sin tocar nada.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    espiarIframe();
    render(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />);

    await elegir(/móvil/i);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('el selector está igual con una web remota que con la de este repositorio', () => {
    // Es una anchura: no depende de qué haya dentro del iframe ni de si la fase remota está
    // encendida. Si algún día solo apareciera en uno de los dos casos, sería que el tamaño se
    // coló en una decisión que no es suya.
    espiarIframe();
    const { unmount } = render(
      <PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />
    );
    expect(screen.getByRole('group', { name: /tamaño de pantalla/i })).toBeVisible();
    unmount();

    render(
      <PreviewFrame
        src={`${REMOTO}/?unocms_preview=1`}
        entryKey="hero"
        valores={{ title: 'uno' }}
        origenDestino={REMOTO}
      />
    );
    expect(screen.getByRole('group', { name: /tamaño de pantalla/i })).toBeVisible();
  });
});
