import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLO_DE_RED } from '@/cms/ui/fallo-de-red';
import { claveLocal, useAutosave, type ResultadoGuardado } from '@/cms/ui/useAutosave';

/**
 * T-C-1 a T-C-6: el autosave (SPEC §8).
 *
 * Se prueba el hook y no la pantalla porque lo que hay que demostrar son **reglas de cuándo
 * guardar**: que el debounce espera, que la versión se adopta, que un conflicto detiene el
 * guardado en vez de reintentar. Montar el formulario entero para comprobar eso metería ocho
 * componentes de campo entre el aserto y lo que afirma.
 */

/** Un `localStorage` de mentira, para no depender del real ni ensuciarlo entre tests. */
function almacenamientoFalso() {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
    removeItem: (clave: string) => {
      datos.delete(clave);
    },
  };
}

function montar(
  guardar: (valores: Record<string, unknown>, version: number) => Promise<ResultadoGuardado>,
  opciones: {
    versionInicial?: number;
    almacenamiento?: ReturnType<typeof almacenamientoFalso>;
  } = {}
) {
  const almacenamiento = opciones.almacenamiento ?? almacenamientoFalso();

  const resultado = renderHook(() =>
    useAutosave({
      key: 'hero',
      versionInicial: opciones.versionInicial ?? 0,
      guardar,
      esperaMs: 20,
      almacenamiento,
    })
  );

  return { ...resultado, almacenamiento };
}

describe('autosave', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-C-1: espera al debounce y pasa por «Guardando…»', async () => {
    const guardar = vi.fn(async () => ({ ok: true, version: 1 }) as ResultadoGuardado);
    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'Hola' });
    });

    // Justo después del cambio todavía no se ha guardado: ese es el punto del debounce.
    expect(guardar).not.toHaveBeenCalled();
    expect(result.current.estado.tipo).toBe('pendiente');

    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('guardado');
    });
    expect(guardar).toHaveBeenCalledWith({ title: 'Hola' }, 0);
  });

  it('T-C-1: cada tecla reinicia la espera, no la acumula', async () => {
    // **La primera versión de este test no probaba el debounce.** Lanzaba cuatro cambios
    // seguidos y comprobaba que solo hubo un guardado; pero eso pasa igual sin debounce,
    // porque el guard de "ya estoy guardando" absorbe los demás. Lo descubrí al mutar el
    // `clearTimeout` y ver que el test seguía verde.
    //
    // Lo que sí lo distingue: escribir con pausas **menores** que la espera y comprobar que
    // no se ha guardado nada todavía. Sin reiniciar el temporizador, el primer cambio ya
    // habría disparado su guardado.
    const guardar = vi.fn(async () => ({ ok: true, version: 1 }) as ResultadoGuardado);
    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'H' });
    });
    await new Promise((resolve) => setTimeout(resolve, 12));

    act(() => {
      result.current.alCambiar({ title: 'Ho' });
    });
    await new Promise((resolve) => setTimeout(resolve, 12));

    act(() => {
      result.current.alCambiar({ title: 'Hola' });
    });

    // Han pasado 24 ms —más que la espera de 20— y no se ha guardado nada: cada tecla movió
    // el momento del guardado hacia adelante.
    expect(guardar).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('guardado');
    });
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardar).toHaveBeenCalledWith({ title: 'Hola' }, 0);
  });

  it('T-C-2: la versión nueva se adopta y el siguiente guardado no da conflicto', async () => {
    const guardar = vi.fn(async (_valores: Record<string, unknown>, version: number) => {
      // El servidor de verdad rechaza una versión que no es la actual.
      if (version !== esperada) return { ok: false, code: 'VERSION_CONFLICT' } as ResultadoGuardado;
      esperada += 1;
      return { ok: true, version: esperada } as ResultadoGuardado;
    });
    let esperada = 0;

    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'Uno' });
    });
    await waitFor(() => {
      expect(result.current.version).toBe(1);
    });

    act(() => {
      result.current.alCambiar({ title: 'Dos' });
    });
    await waitFor(() => {
      expect(result.current.version).toBe(2);
    });

    // Sin adoptar la versión, el segundo guardado mandaría la vieja y el editor vería
    // "alguien ha guardado antes que tú" siendo él mismo dos segundos antes.
    expect(result.current.estado.tipo).toBe('guardado');
  });

  it('T-C-3: un conflicto detiene el autosave y NO reintenta', async () => {
    const guardar = vi.fn(
      async () => ({ ok: false, code: 'VERSION_CONFLICT' }) as ResultadoGuardado
    );
    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'Lo mío' });
    });
    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('conflicto');
    });

    // Seguir escribiendo ya no guarda. Reintentar con la versión nueva pisaría el trabajo de
    // la otra persona, que es exactamente lo que el bloqueo optimista impide.
    act(() => {
      result.current.alCambiar({ title: 'Más mío todavía' });
    });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(guardar).toHaveBeenCalledTimes(1);
    expect(result.current.estado.tipo).toBe('conflicto');
  });

  it('T-C-4: guardarYa no espera al debounce', async () => {
    const guardar = vi.fn(async () => ({ ok: true, version: 1 }) as ResultadoGuardado);
    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'Hola' });
      result.current.guardarYa();
    });

    await waitFor(() => {
      expect(guardar).toHaveBeenCalledTimes(1);
    });
  });

  it('guardarYa devuelve la versión ya actualizada, no la de antes', async () => {
    // El defecto que esto fija: `guardarYa` no devolvía nada y quien publicaba justo después
    // leía la versión del estado de React —la de antes del guardado—. El servidor respondía
    // `VERSION_CONFLICT` y el editor leía "otra persona guardó cambios mientras editabas"
    // siendo él mismo medio segundo antes.
    //
    // Solo pasaba si había algo pendiente al pulsar Publicar, o sea en el caso normal de
    // escribir y publicar. Lo destapó ejecutar la suite e2e dos veces seguidas.
    const guardar = vi.fn(async () => ({ ok: true, version: 7 }) as ResultadoGuardado);
    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'Algo' });
    });

    let devuelta = -1;
    await act(async () => {
      devuelta = await result.current.guardarYa();
    });

    expect(devuelta).toBe(7);
  });

  it('guardarYa con un guardado ya en vuelo espera, no devuelve la versión vieja', async () => {
    // La otra rama del mismo defecto, y la que fallaba una de cada dos veces. Al pulsar
    // Publicar dos segundos después de teclear, el temporizador ya había disparado el guardado:
    // `guardarYa` se encontraba uno en vuelo, se rendía y devolvía la versión de antes. El
    // servidor respondía `VERSION_CONFLICT` en un caso normalísimo — escribir y publicar.
    let resolver: ((valor: ResultadoGuardado) => void) | null = null;
    const guardar = vi.fn(
      () =>
        new Promise<ResultadoGuardado>((resolve) => {
          resolver = resolve;
        })
    );

    const { result } = montar(guardar, { versionInicial: 4 });

    act(() => {
      result.current.alCambiar({ title: 'Algo' });
    });
    // Se deja que el temporizador dispare el guardado.
    await waitFor(() => {
      expect(guardar).toHaveBeenCalledTimes(1);
    });

    // Y ahora se pulsa Publicar, con el guardado a medio camino.
    let devuelta = -1;
    const publicando = act(async () => {
      devuelta = await result.current.guardarYa();
    });

    act(() => {
      resolver?.({ ok: true, version: 5 });
    });
    await publicando;

    // La versión nueva, no la de antes.
    expect(devuelta).toBe(5);
  });

  it('guardarYa sin nada pendiente devuelve la versión actual', async () => {
    // Publicar sin haber tocado nada tiene que seguir funcionando, y con la versión buena.
    const guardar = vi.fn();
    const { result } = montar(guardar, { versionInicial: 3 });

    let devuelta = -1;
    await act(async () => {
      devuelta = await result.current.guardarYa();
    });

    expect(devuelta).toBe(3);
    expect(guardar).not.toHaveBeenCalled();
  });

  it('T-C-6: el borrador local se escribe al cambiar y se borra al confirmar', async () => {
    const guardar = vi.fn(async () => ({ ok: true, version: 1 }) as ResultadoGuardado);
    const almacenamiento = almacenamientoFalso();
    const { result } = montar(guardar, { almacenamiento });

    act(() => {
      result.current.alCambiar({ title: 'Hola' });
    });

    // Mientras viaja por la red, la red de seguridad está puesta.
    expect(almacenamiento.getItem(claveLocal('hero'))).not.toBeNull();

    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('guardado');
    });

    // Y se quita al confirmar. Si no, reaparecería en cada apertura para siempre.
    expect(almacenamiento.getItem(claveLocal('hero'))).toBeNull();
  });

  it('T-C-6: si el guardado falla, el borrador local se queda', async () => {
    const guardar = vi.fn(
      async () => ({ ok: false, code: 'INTERNAL', message: 'sin red' }) as ResultadoGuardado
    );
    const almacenamiento = almacenamientoFalso();
    const { result } = montar(guardar, { almacenamiento });

    act(() => {
      result.current.alCambiar({ title: 'Lo que escribí' });
    });
    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('error');
    });

    // Es justo el caso para el que existe: se cortó la conexión y el trabajo sigue estando.
    expect(almacenamiento.getItem(claveLocal('hero'))).not.toBeNull();
  });

  it('T-C-5: un borrador local más nuevo se ofrece, no se aplica', () => {
    const almacenamiento = almacenamientoFalso();
    almacenamiento.setItem(
      claveLocal('hero'),
      JSON.stringify({ valores: { title: 'De la otra pestaña' }, version: 3, guardadoEn: 1 })
    );

    const { result } = montar(vi.fn(), { versionInicial: 3, almacenamiento });

    // Se ofrece…
    expect(result.current.recuperable?.valores).toMatchObject({ title: 'De la otra pestaña' });
    // …y no se ha tocado nada por su cuenta. Aplicarlo convertiría una pestaña olvidada en
    // una máquina de resucitar texto viejo.
    expect(result.current.estado.tipo).toBe('inactivo');
  });

  it('T-C-5: un borrador local más viejo que el servidor se descarta sin preguntar', () => {
    const almacenamiento = almacenamientoFalso();
    almacenamiento.setItem(
      claveLocal('hero'),
      JSON.stringify({ valores: { title: 'De hace tres versiones' }, version: 1, guardadoEn: 1 })
    );

    const { result } = montar(vi.fn(), { versionInicial: 5, almacenamiento });

    // El servidor ya tiene eso o algo más nuevo: ofrecerlo sería invitar a pisar lo bueno con
    // lo viejo, y encima haciéndole creer al editor que recupera trabajo.
    expect(result.current.recuperable).toBeNull();
    expect(almacenamiento.getItem(claveLocal('hero'))).toBeNull();
  });

  it('descartar el borrador local lo borra de verdad', () => {
    const almacenamiento = almacenamientoFalso();
    almacenamiento.setItem(
      claveLocal('hero'),
      JSON.stringify({ valores: { title: 'x' }, version: 2, guardadoEn: 1 })
    );

    const { result } = montar(vi.fn(), { versionInicial: 2, almacenamiento });

    act(() => {
      result.current.descartarRecuperable();
    });

    expect(result.current.recuperable).toBeNull();
    expect(almacenamiento.getItem(claveLocal('hero'))).toBeNull();
  });

  it('un localStorage con basura no impide abrir el editor', () => {
    const almacenamiento = almacenamientoFalso();
    almacenamiento.setItem(claveLocal('hero'), 'esto no es JSON');

    // Es una red de seguridad, y una red que tira la pantalla abajo no es una red.
    const { result } = montar(vi.fn(), { almacenamiento });

    expect(result.current.recuperable).toBeNull();
    expect(result.current.estado.tipo).toBe('inactivo');
  });

  it('dos cambios durante un guardado en curso no se pierden', async () => {
    let resolver: ((valor: ResultadoGuardado) => void) | null = null;
    const guardar = vi.fn(
      () =>
        new Promise<ResultadoGuardado>((resolve) => {
          resolver = resolve;
        })
    );

    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'Primero' });
    });
    await waitFor(() => {
      expect(guardar).toHaveBeenCalledTimes(1);
    });

    // Mientras el primero está en el aire, llega otro cambio **y su temporizador salta**.
    // Esa es la parte que importa y que la primera versión de este test no forzaba: al saltar
    // durante un guardado en curso, el envío se descarta y el cambio se queda esperando a que
    // alguien lo recoja. Si nadie lo encadena al terminar, el último tecleo del editor se
    // pierde y él no se entera.
    act(() => {
      result.current.alCambiar({ title: 'Segundo' });
    });
    await new Promise((resolve) => setTimeout(resolve, 40));

    // Sigue habiendo un solo envío: el temporizador saltó y se encontró la puerta cerrada.
    expect(guardar).toHaveBeenCalledTimes(1);

    act(() => {
      resolver?.({ ok: true, version: 1 });
    });

    // El segundo se manda en cuanto el primero termina. Sin encadenar, el último tecleo del
    // editor se quedaría sin guardar y él no se enteraría.
    await waitFor(() => {
      expect(guardar).toHaveBeenCalledTimes(2);
    });
    expect(guardar).toHaveBeenLastCalledWith({ title: 'Segundo' }, 1);
  });
});

describe('cuando la red se cae', () => {
  /**
   * El caso que no cubría nada, y el peor de todos.
   *
   * Si `guardar` **lanza** en vez de devolver `{ ok: false }` —red caída, un 500, un despliegue
   * a mitad— el `await` propagaba y el estado se quedaba en `guardando` **para siempre**.
   *
   * Eso es la peor mentira posible en este componente: el indicador existe justo para decir si
   * lo escrito está a salvo, y decía "Guardando…" sobre algo que nunca se guardó.
   */
  const seCae = () => vi.fn().mockRejectedValue(new Error('Failed to fetch'));

  it('lo dice, en vez de quedarse en «Guardando…» para siempre', async () => {
    const { result } = montar(seCae());

    act(() => {
      result.current.alCambiar({ title: 'Hola' });
    });

    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('error');
    });
    expect(result.current.estado.tipo === 'error' && result.current.estado.mensaje).toBe(
      FALLO_DE_RED
    );
  });

  it('conserva el borrador local, que es la red para esto', async () => {
    const almacenamiento = almacenamientoFalso();
    const { result } = montar(seCae(), { almacenamiento });

    act(() => {
      result.current.alCambiar({ title: 'Lo que estaba escribiendo' });
    });

    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('error');
    });

    // El borrador solo se borra al **confirmar** un guardado. Esta es exactamente la situación
    // para la que existe: perderlo aquí sería quitar el paracaídas al saltar.
    expect(almacenamiento.getItem(claveLocal('hero'))).toContain('Lo que estaba escribiendo');
  });

  it('lo pendiente vuelve a la cola y el siguiente intento lo manda', async () => {
    const guardar = vi
      .fn<(v: Record<string, unknown>, n: number) => Promise<ResultadoGuardado>>()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue({ ok: true, version: 1 });

    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'Hola' });
    });
    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('error');
    });

    // Al pulsar publicar —o al volver a teclear— se reintenta lo que no llegó a guardarse. Sin
    // devolverlo a la cola, ese texto se quedaba fuera hasta la siguiente tecla.
    await act(async () => {
      await result.current.guardarYa();
    });

    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar.mock.calls[1]?.[0]).toEqual({ title: 'Hola' });
    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('guardado');
    });
  });

  it('no pisa lo nuevo con lo viejo', async () => {
    const guardar = vi
      .fn<(v: Record<string, unknown>, n: number) => Promise<ResultadoGuardado>>()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue({ ok: true, version: 1 });

    const { result } = montar(guardar);

    act(() => {
      result.current.alCambiar({ title: 'viejo' });
    });
    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('error');
    });

    // Mientras tanto se sigue escribiendo. Devolver lo viejo a la cola **por encima** de esto
    // sería cambiar un fallo de red por una pérdida de trabajo.
    act(() => {
      result.current.alCambiar({ title: 'nuevo' });
    });

    await waitFor(() => {
      expect(result.current.estado.tipo).toBe('guardado');
    });
    expect(guardar.mock.calls[1]?.[0]).toEqual({ title: 'nuevo' });
  });
});
