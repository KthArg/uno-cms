import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_TTL } from '@/cms/security/tokens';
import { PreviewFrame, type RelevoDeToken } from '@/cms/ui/PreviewFrame';

/**
 * T-R-16, T-R-17, T-R-19 y T-R-20: **el panel hablando con una web que vive fuera**
 * (spec 08 §4.2 y §4.5, ADR-701).
 *
 * jsdom no carga el `src` de un iframe, así que `contentWindow` existe y está vacío. Basta y
 * sobra: lo que se comprueba aquí es **a qué origen se manda**, **cuándo se pide un token
 * nuevo** y **qué se enseña cuando eso falla**. Lo que hace el otro lado es de #181.
 */

const REMOTO = 'https://mi-web.example';
const VIDA = TOKEN_TTL['preview-remoto'];

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

/**
 * El `cms:ready` que manda el iframe al montar, desde el origen que toque.
 *
 * **`origin: origen` y no el atajo `{ origin }`.** Escribí el atajo con el parámetro en
 * español, y no falla: `origin` existe como **global del navegador** —vale el origen del
 * documento— así que el evento salía siempre desde `http://localhost:3000` y TypeScript no
 * tenía nada que objetar. El resultado era que el panel rechazaba el `cms:ready`, no se ponía
 * listo, y cuatro casos daban un cero que parecía un fallo del componente.
 */
async function iframeListo(origen: string = window.location.origin) {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'cms:ready' }, origin: origen })
    );
  });
}

/**
 * Adelanta el reloj **y** el que mide lo transcurrido.
 *
 * Los dos, y no es un detalle: el latido va con temporizadores y la decisión de renovar mira
 * `performance.now()`. Moviendo solo uno, el efecto se dispararía y siempre vería el token
 * recién emitido — el test pasaría a comprobar que no pasa nada.
 */
async function avanzar(segundos: number) {
  const ahora = performance.now();
  vi.spyOn(performance, 'now').mockReturnValue(ahora + segundos * 1000);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(segundos * 1000);
  });
}

describe('a qué origen manda el panel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('T-R-16: con web remota, manda al origen de esa URL y nunca a `*`', async () => {
    const enviados = espiarIframe();

    const { rerender } = render(
      <PreviewFrame
        src={`${REMOTO}/?unocms_preview=1&token=x`}
        entryKey="hero"
        valores={{ title: 'uno' }}
        origenDestino={REMOTO}
      />
    );
    // El `cms:ready` llega **desde la web remota**, que es quien está dentro del iframe.
    await iframeListo(REMOTO);
    rerender(
      <PreviewFrame
        src={`${REMOTO}/?unocms_preview=1&token=x`}
        entryKey="hero"
        valores={{ title: 'dos' }}
        origenDestino={REMOTO}
      />
    );

    expect(enviados.length).toBeGreaterThan(0);
    for (const { origen } of enviados) {
      expect(origen).toBe(REMOTO);
      expect(origen).not.toBe('*');
    }
  });

  it('T-R-17: sin ella, al propio, exactamente como antes de esta fase', async () => {
    const enviados = espiarIframe();

    const { rerender } = render(
      <PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />
    );
    await iframeListo();
    rerender(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'dos' }} />);

    expect(enviados.length).toBeGreaterThan(0);
    for (const { origen } of enviados) {
      expect(origen).toBe(window.location.origin);
    }
  });

  it('un `cms:ready` de otro origen no despierta al panel', async () => {
    // El mensaje de vuelta se filtra por el mismo origen al que se manda. Sin esto, cualquier
    // ventana podría hacer que el panel se creyera listo y empezara a mandar borradores a un
    // iframe que todavía no es quien dice ser.
    const enviados = espiarIframe();

    const { rerender } = render(
      <PreviewFrame
        src={`${REMOTO}/?unocms_preview=1`}
        entryKey="hero"
        valores={{ title: 'uno' }}
        origenDestino={REMOTO}
      />
    );
    await iframeListo('https://otra.example');
    rerender(
      <PreviewFrame
        src={`${REMOTO}/?unocms_preview=1`}
        entryKey="hero"
        valores={{ title: 'dos' }}
        origenDestino={REMOTO}
      />
    );

    expect(enviados).toEqual([]);
  });
});

describe('T-R-19 y T-R-20 — la renovación del token', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function montar(renovar: () => Promise<RelevoDeToken>) {
    const enviados = espiarIframe();

    const vista = render(
      <PreviewFrame
        src={`${REMOTO}/?unocms_preview=1&token=viejo`}
        entryKey="hero"
        valores={{ title: 'uno' }}
        origenDestino={REMOTO}
        renovarToken={renovar}
        vidaDelTokenSegundos={VIDA}
      />
    );

    /** Vuelve a pintar con **otra** referencia de `renovarToken`, que rearma el efecto. */
    function repintarConOtraReferencia(otra: () => Promise<RelevoDeToken>) {
      vista.rerender(
        <PreviewFrame
          src={`${REMOTO}/?unocms_preview=1&token=viejo`}
          entryKey="hero"
          valores={{ title: 'uno' }}
          origenDestino={REMOTO}
          renovarToken={otra}
          vidaDelTokenSegundos={VIDA}
        />
      );
    }

    return { enviados, vista, repintarConOtraReferencia };
  }

  it('T-R-19: se pide uno nuevo antes de caducar y el iframe no se recarga', async () => {
    const renovar = vi.fn(async (): Promise<RelevoDeToken> => ({
      ok: true,
      token: 'nuevo',
      vidaEnSegundos: VIDA,
    }));
    const { enviados, vista } = montar(renovar);
    await iframeListo(REMOTO);

    const iframe = vista.container.querySelector('iframe');
    const srcInicial = iframe?.getAttribute('src');

    // Todavía queda vida de sobra: no se pide nada.
    await avanzar(VIDA / 2);
    expect(renovar).not.toHaveBeenCalled();

    // Dentro del margen de tres minutos.
    await avanzar(VIDA / 2 - 60);
    expect(renovar).toHaveBeenCalled();

    // El token nuevo viaja por el canal de siempre, con el origen de siempre.
    const relevo = enviados.find((e) => (e.mensaje as { type?: string }).type === 'cms:token');
    expect(relevo?.mensaje).toMatchObject({ token: 'nuevo', vidaEnSegundos: VIDA });
    expect(relevo?.origen).toBe(REMOTO);

    // **Y el iframe es el mismo nodo con el mismo `src`.** Recargar sería lo fácil y es justo lo
    // que el contrato prohíbe: quien edita perdería el `scroll` y el estado de su web.
    expect(vista.container.querySelector('iframe')).toBe(iframe);
    expect(iframe?.getAttribute('src')).toBe(srcInicial);
  });

  it('T-R-19: tras renovar, el reloj vuelve a empezar', async () => {
    // **Se cuenta exactamente cuántas veces se pide, no si el número creció.** La primera
    // versión de este caso comparaba el antes y el después y pasaba con el reloj sin
    // reiniciar: sin reinicio, el latido siguiente vuelve a ver un token a punto de caducar y
    // pide otro cada quince segundos — cincuenta y seis peticiones donde debería haber una.
    const renovar = vi.fn(async (): Promise<RelevoDeToken> => ({
      ok: true,
      token: 'nuevo',
      vidaEnSegundos: VIDA,
    }));
    montar(renovar);
    await iframeListo(REMOTO);

    await avanzar(VIDA - 60);
    expect(renovar.mock.calls.length).toBe(1);

    // Y con el reloj reiniciado, el siguiente relevo llega cuando toca: ni antes ni nunca.
    await avanzar(VIDA - 60);
    expect(renovar.mock.calls.length).toBe(2);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('T-R-19: el reloj sobrevive a que el efecto se rearme', async () => {
    // El fallo que este caso impide **no se ve leyendo el componente**: si la referencia de
    // `renovarToken` cambia de identidad —basta con que alguien la envuelva en una función al
    // vuelo en la pantalla de arriba—, el efecto se vuelve a montar. Con lo transcurrido en una
    // variable del efecto, ese remontaje ponía el contador a cero: el token envejecía sin que
    // nadie lo mirase y la vista previa **moría en silencio**, que es el fallo exacto que toda
    // esta pieza existe para evitar.
    const primera = vi.fn(async (): Promise<RelevoDeToken> => ({
      ok: true,
      token: 'nuevo',
      vidaEnSegundos: VIDA,
    }));
    const segunda = vi.fn(async (): Promise<RelevoDeToken> => ({
      ok: true,
      token: 'nuevo',
      vidaEnSegundos: VIDA,
    }));

    const { repintarConOtraReferencia } = montar(primera);
    await iframeListo(REMOTO);

    // A media vida, algo rearma el efecto.
    await avanzar(VIDA / 2);
    await act(async () => {
      repintarConOtraReferencia(segunda);
    });

    // Y el relevo llega igual cuando toca, contando desde que se emitió el token.
    await avanzar(VIDA / 2 - 60);

    expect(segunda).toHaveBeenCalled();
  });

  it('T-R-20: si la renovación falla, se dice y no se manda un token roto', async () => {
    const renovar = vi.fn(async (): Promise<RelevoDeToken> => ({ ok: false }));
    const { enviados } = montar(renovar);
    await iframeListo(REMOTO);

    await avanzar(VIDA - 60);

    // Se dice **en el momento**, no cuando el token se muera solo un rato después. La primera
    // versión de este caso pasaba aunque el fallo se ignorara: se mandaba un `cms:token` con el
    // token a `undefined`, y el aviso acababa saliendo por la comprobación de números rotos de
    // `estadoDelTokenRemoto`. Salía el aviso correcto por el camino equivocado.
    expect(screen.getByRole('status')).toHaveTextContent(/ha dejado de actualizarse/i);
    expect(screen.getByRole('button', { name: /volver a cargar/i })).toBeVisible();

    // Y no sale ningún relevo: mandar un token vacío al iframe rompería su siguiente petición
    // en vez de la nuestra.
    expect(enviados.filter((e) => (e.mensaje as { type?: string }).type === 'cms:token')).toEqual(
      []
    );
  });

  it('T-R-20: si la pestaña estuvo dormida y el token murió, también se dice', async () => {
    // El caso que no cubría ninguno de los otros y que es el más probable de todos: alguien
    // cierra la tapa del portátil veinte minutos. Al volver, la ventana del margen ya ha
    // pasado entera y no hay nada que renovar — el token está muerto.
    //
    // Sin este aviso, la vista previa se quedaría enseñando lo último que recibió con cara de
    // estar al día, que es exactamente lo que §4.2 llama la forma silenciosa de mentir. Y lo
    // enseñó una mutación: quitar esta rama dejaba los ocho casos en verde.
    const renovar = vi.fn(async (): Promise<RelevoDeToken> => ({
      ok: true,
      token: 'nuevo',
      vidaEnSegundos: VIDA,
    }));
    montar(renovar);
    await iframeListo(REMOTO);

    await avanzar(VIDA + 60);

    expect(screen.getByRole('status')).toHaveTextContent(/ha dejado de actualizarse/i);
    // Y no se intenta renovar un token que ya está muerto: el relevo sirve para llegar a
    // tiempo, no para resucitar.
    expect(renovar).not.toHaveBeenCalled();
  });

  it('T-R-20: si la renovación se cae por red, también se dice', async () => {
    // La regla de `cms/ui` (#160): un `await` que puede caerse va dentro de un `try`, o la
    // pantalla se queda igual para siempre sin decir nada.
    const renovar = vi.fn(async (): Promise<RelevoDeToken> => {
      throw new Error('la red');
    });
    const { enviados } = montar(renovar);
    await iframeListo(REMOTO);

    await avanzar(VIDA - 60);

    expect(screen.getByRole('status')).toHaveTextContent(/ha dejado de actualizarse/i);
    expect(enviados.filter((e) => (e.mensaje as { type?: string }).type === 'cms:token')).toEqual(
      []
    );
  });

  it('T-R-20: no reintenta en bucle tras fallar', async () => {
    // Insistir cada quince segundos no arregla un servidor que no puede emitir tokens, y
    // escondería el problema hasta que la vista previa muriera sola.
    const renovar = vi.fn(async (): Promise<RelevoDeToken> => ({ ok: false }));
    montar(renovar);
    await iframeListo(REMOTO);

    await avanzar(VIDA - 60);
    const trasElFallo = renovar.mock.calls.length;

    await avanzar(120);

    expect(renovar.mock.calls.length).toBe(trasElFallo);
  });

  it('sin renovación configurada no hay latido: la vista previa de este repositorio', async () => {
    // El token de `/preview` dura dos horas y no se renueva. Montar un temporizador que no
    // puede hacer nada sería gastar un `setInterval` en anunciar el final.
    espiarIframe();
    render(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />);
    await iframeListo();

    await avanzar(3 * 60 * 60);

    expect(screen.queryByRole('status')).toBeNull();
  });
});
