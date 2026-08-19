import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
