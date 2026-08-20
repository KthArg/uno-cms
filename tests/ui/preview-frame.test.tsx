import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THROTTLE_MS } from '@/cms/preview/protocolo';
import { PreviewFrame } from '@/cms/ui/PreviewFrame';

/**
 * T-J-2 y T-J-6: el lado del panel (SPEC §6.1 paso 3).
 *
 * jsdom no carga el `src` de un iframe, así que `contentWindow` existe pero está vacío. Basta:
 * lo que se comprueba aquí es **qué se manda y cuándo**, no qué hace el otro lado — eso es el
 * e2e y los tests del proveedor.
 */

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

/** Simula el `cms:ready` que manda el iframe al montar. */
async function iframeListo() {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'cms:ready' }, origin: window.location.origin })
    );
  });
}

describe('el panel manda los cambios al iframe', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('T-J-2: el origen va explícito, nunca `*`', async () => {
    const enviados = espiarIframe();

    const { rerender } = render(
      <PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />
    );
    await iframeListo();
    rerender(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'dos' }} />);

    // Con `*`, el navegador entrega el mensaje a quien sea que haya en ese iframe. Hoy hay una
    // ruta nuestra; el día que un redirect lleve a otro sitio, el contenido sin publicar de
    // quien edita se manda a un tercero **sin que nada falle**.
    expect(enviados.length).toBeGreaterThan(0);
    for (const { origen } of enviados) {
      expect(origen).toBe(window.location.origin);
      expect(origen).not.toBe('*');
    }
  });

  it('no manda nada antes de que el iframe diga que está listo', () => {
    const enviados = espiarIframe();

    render(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />);

    // Lo que se mande antes de que haya nadie escuchando se pierde, y quien edita ve su primera
    // letra desaparecer.
    expect(enviados).toEqual([]);
  });

  it('en cuanto está listo manda lo que hubiera guardado', async () => {
    const enviados = espiarIframe();

    render(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />);
    await iframeListo();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.mensaje).toMatchObject({
      type: 'cms:update',
      key: 'hero',
      data: { title: 'uno' },
    });
  });

  it('T-J-6: escribir rápido no manda un mensaje por tecla', async () => {
    const enviados = espiarIframe();

    const { rerender } = render(
      <PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'u' }} />
    );
    await iframeListo();
    const trasElPrimero = enviados.length;

    // Cinco "teclas" dentro de la misma ventana de throttle.
    for (const texto of ['un', 'una', 'una ', 'una c', 'una co']) {
      rerender(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: texto }} />);
    }

    // Todavía no ha pasado la ventana: no se ha mandado ninguno de los cinco.
    expect(enviados).toHaveLength(trasElPrimero);

    await act(async () => {
      vi.advanceTimersByTime(THROTTLE_MS);
    });

    // Y al final se manda **uno**, con el último valor. Lo que importa es el estado final, no
    // el camino hasta él.
    expect(enviados).toHaveLength(trasElPrimero + 1);
    expect(enviados.at(-1)?.mensaje).toMatchObject({ data: { title: 'una co' } });
  });

  it('el número de orden sube en cada envío', async () => {
    const enviados = espiarIframe();

    const { rerender } = render(
      <PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: 'uno' }} />
    );
    await iframeListo();

    for (const texto of ['dos', 'tres']) {
      rerender(<PreviewFrame src="/preview?token=x" entryKey="hero" valores={{ title: texto }} />);
      await act(async () => {
        vi.advanceTimersByTime(THROTTLE_MS);
      });
    }

    // Es lo que permite al receptor descartar los que se cruzan. Sin números crecientes, esa
    // defensa no tiene con qué comparar.
    const secuencias = enviados.map((envio) => (envio.mensaje as { seq: number }).seq);
    expect(secuencias).toEqual([...secuencias].sort((a, b) => a - b));
    expect(new Set(secuencias).size).toBe(secuencias.length);
  });
});
