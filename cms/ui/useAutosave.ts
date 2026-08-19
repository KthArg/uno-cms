'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionFieldError } from '@/cms/actions/pipeline';

/**
 * El autosave de `SPEC.md` §8: "debounce 2 s tras el último tecleo + guardado al blur del
 * formulario; indicador «Guardado ✓ / Guardando…»; el borrador nunca se pierde (localStorage
 * como red de seguridad ante fallo de red, con reconciliación por `version`)".
 *
 * Está separado del componente porque las reglas de cuándo guardar son la parte con
 * comportamiento, y mezclarlas con el marcado hace que solo se puedan probar renderizando.
 *
 * ## Las tres decisiones que sostienen esto
 *
 * **1. El `version` que devuelve el servidor se adopta.** Sin eso, el segundo guardado
 * mandaría la versión vieja y recibiría un conflicto contra sí mismo. El editor vería
 * "alguien ha guardado antes que tú" siendo él mismo dos segundos antes.
 *
 * **2. Un conflicto no se reintenta.** La tentación es volver a mandar con la versión nueva y
 * seguir como si nada; eso **pisa el trabajo de la otra persona**, que es justo lo que el
 * bloqueo optimista existe para impedir. El autosave se detiene y la interfaz ofrece recargar.
 *
 * **3. `localStorage` es una red, no una caché.** Se escribe en cada cambio y se borra al
 * confirmar el guardado. Al abrir, si hay algo guardado localmente **se ofrece**, no se
 * aplica: aplicarlo convertiría una pestaña olvidada en una máquina de resucitar texto viejo.
 */

/** Lo que ve el editor. Son estados de producto, no de red. */
export type EstadoAutosave =
  | { readonly tipo: 'inactivo' }
  | { readonly tipo: 'pendiente' }
  | { readonly tipo: 'guardando' }
  | { readonly tipo: 'guardado' }
  | { readonly tipo: 'conflicto' }
  | {
      readonly tipo: 'error';
      readonly mensaje: string;
      readonly campos?: readonly ActionFieldError[];
    };

export interface ResultadoGuardado {
  readonly ok: boolean;
  readonly version?: number;
  readonly code?: string;
  readonly message?: string;
  readonly fields?: readonly ActionFieldError[];
}

export interface OpcionesAutosave {
  readonly key: string;
  readonly versionInicial: number;
  readonly guardar: (
    valores: Record<string, unknown>,
    version: number
  ) => Promise<ResultadoGuardado>;
  /** SPEC §8: 2 s tras el último tecleo. Parametrizable para poder probarlo sin esperar. */
  readonly esperaMs?: number;
  readonly almacenamiento?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

/** Lo que se guarda en local. La versión va dentro: sin ella no se puede reconciliar. */
export interface BorradorLocal {
  readonly valores: Record<string, unknown>;
  readonly version: number;
  readonly guardadoEn: number;
}

export function claveLocal(key: string): string {
  return `unocms:borrador:${key}`;
}

function leerLocal(
  almacenamiento: OpcionesAutosave['almacenamiento'],
  key: string
): BorradorLocal | null {
  if (almacenamiento === null || almacenamiento === undefined) return null;

  try {
    const crudo = almacenamiento.getItem(claveLocal(key));
    if (crudo === null) return null;

    const dato = JSON.parse(crudo) as Partial<BorradorLocal>;
    if (typeof dato.version !== 'number' || typeof dato.valores !== 'object') return null;

    return {
      valores: dato.valores as Record<string, unknown>,
      version: dato.version,
      guardadoEn: typeof dato.guardadoEn === 'number' ? dato.guardadoEn : 0,
    };
  } catch {
    // `localStorage` puede estar lleno, deshabilitado o traer basura de otra versión del
    // panel. Nada de eso puede impedir abrir el editor: es una red de seguridad, y una red
    // que tira la pantalla abajo no es una red.
    return null;
  }
}

export interface Autosave {
  readonly estado: EstadoAutosave;
  readonly version: number;
  /** Un borrador local que **no** se ha aplicado, esperando decisión. */
  readonly recuperable: BorradorLocal | null;
  readonly alCambiar: (valores: Record<string, unknown>) => void;
  /** Guardado inmediato, sin esperar al debounce (SPEC §8: al perder el foco). */
  readonly guardarYa: () => void;
  readonly aplicarRecuperable: () => void;
  readonly descartarRecuperable: () => void;
}

export function useAutosave(opciones: OpcionesAutosave): Autosave {
  const {
    key,
    versionInicial,
    guardar,
    esperaMs = 2000,
    almacenamiento = typeof window === 'undefined' ? null : window.localStorage,
  } = opciones;

  const [estado, setEstado] = useState<EstadoAutosave>({ tipo: 'inactivo' });
  const [version, setVersion] = useState(versionInicial);
  const [recuperable, setRecuperable] = useState<BorradorLocal | null>(null);

  const pendiente = useRef<Record<string, unknown> | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardando = useRef(false);
  const detenido = useRef(false);
  const versionRef = useRef(versionInicial);

  // Al abrir: mirar si hay algo local **más nuevo que lo que trae el servidor**.
  useEffect(() => {
    const local = leerLocal(almacenamiento, key);
    if (local === null) return;

    // Con la misma versión o una anterior, lo local no aporta nada: el servidor ya tiene eso
    // o algo más nuevo. Ofrecerlo sería invitar al editor a resucitar texto viejo.
    if (local.version < versionInicial) {
      almacenamiento?.removeItem(claveLocal(key));
      return;
    }

    setRecuperable(local);
  }, [almacenamiento, key, versionInicial]);

  const escribirLocal = useCallback(
    (valores: Record<string, unknown>) => {
      try {
        almacenamiento?.setItem(
          claveLocal(key),
          JSON.stringify({ valores, version: versionRef.current, guardadoEn: Date.now() })
        );
      } catch {
        // Sin espacio o sin permiso. La red de seguridad se pierde; el guardado normal no.
      }
    },
    [almacenamiento, key]
  );

  const enviar = useCallback(async () => {
    if (detenido.current || guardando.current) return;

    const valores = pendiente.current;
    if (valores === null) return;

    pendiente.current = null;
    guardando.current = true;
    setEstado({ tipo: 'guardando' });

    const resultado = await guardar(valores, versionRef.current);
    guardando.current = false;

    if (resultado.ok && resultado.version !== undefined) {
      versionRef.current = resultado.version;
      setVersion(resultado.version);
      setEstado({ tipo: 'guardado' });
      // Se borra **después** de confirmar. Borrarlo antes dejaría al editor sin red justo
      // durante el viaje de red, que es cuando hace falta.
      almacenamiento?.removeItem(claveLocal(key));

      // Si llegaron más cambios mientras se guardaba, se encadena.
      if (pendiente.current !== null) void enviar();
      return;
    }

    if (resultado.code === 'VERSION_CONFLICT') {
      // **No se reintenta.** Reintentar con la versión nueva pisaría el trabajo de la otra
      // persona, que es justo lo que el bloqueo optimista impide.
      detenido.current = true;
      setEstado({ tipo: 'conflicto' });
      return;
    }

    setEstado({
      tipo: 'error',
      mensaje: resultado.message ?? 'No se ha podido guardar.',
      ...(resultado.fields === undefined ? {} : { campos: resultado.fields }),
    });
  }, [almacenamiento, guardar, key]);

  const alCambiar = useCallback(
    (valores: Record<string, unknown>) => {
      if (detenido.current) return;

      pendiente.current = valores;
      escribirLocal(valores);
      setEstado({ tipo: 'pendiente' });

      if (temporizador.current !== null) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        void enviar();
      }, esperaMs);
    },
    [enviar, escribirLocal, esperaMs]
  );

  const guardarYa = useCallback(() => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
    void enviar();
  }, [enviar]);

  const aplicarRecuperable = useCallback(() => {
    setRecuperable(null);
  }, []);

  const descartarRecuperable = useCallback(() => {
    almacenamiento?.removeItem(claveLocal(key));
    setRecuperable(null);
  }, [almacenamiento, key]);

  useEffect(
    () => () => {
      if (temporizador.current !== null) clearTimeout(temporizador.current);
    },
    []
  );

  return {
    estado,
    version,
    recuperable,
    alCambiar,
    guardarYa,
    aplicarRecuperable,
    descartarRecuperable,
  };
}
