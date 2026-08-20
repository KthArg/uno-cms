'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionFieldError } from '@/cms/actions/pipeline';
import { FALLO_DE_RED } from './fallo-de-red';

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
  /**
   * Guardado inmediato, sin esperar al debounce (SPEC §8: al perder el foco).
   *
   * Devuelve la versión **ya actualizada**, y esa es la parte que importa. La primera versión
   * no devolvía nada y el editor publicaba justo después leyendo `version` del estado de
   * React, que todavía era el de antes del guardado: el servidor respondía
   * `VERSION_CONFLICT` y el editor leía "otra persona guardó cambios mientras editabas"
   * siendo él mismo medio segundo antes.
   *
   * Solo se veía si había algo pendiente que guardar al pulsar Publicar — o sea, en el caso
   * normal de escribir y publicar. Lo destapó ejecutar la suite e2e dos veces seguidas.
   */
  readonly guardarYa: () => Promise<number>;
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
  /**
   * El guardado en marcha, si lo hay.
   *
   * Se guarda **la operación entera** y no un booleano: quien llega mientras otro guarda tiene
   * que esperarlo y quedarse con su resultado, no rendirse y devolver la versión de antes.
   */
  const operacion = useRef<Promise<number> | null>(null);
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

  /**
   * Ejecuta **un** guardado y devuelve la versión resultante.
   *
   * Separado de `enviar` para que la promesa que se guarda en `operacion` incluya la
   * actualización de `versionRef`. La primera versión guardaba una promesa que resolvía
   * *antes* de esa actualización, así que quien la esperaba seguía leyendo la versión de
   * antes — el mismo fallo que se creía arreglado, una capa más adentro.
   */
  /**
   * Si el último intento se cayó por red.
   *
   * Existe por un fallo que introduje al arreglar el otro: al devolver lo pendiente a la cola,
   * `enviar` veía que había algo que mandar y **se volvía a llamar inmediatamente**, fallaba
   * otra vez, devolvía a la cola otra vez… hasta tumbar el proceso. Lo enseñó el test, no la
   * lectura.
   *
   * Con esto, tras un fallo de red **no se reintenta solo**: se reintenta cuando alguien vuelve
   * a teclear o pulsa publicar. Insistir contra una red caída no la arregla, y encima esconde
   * el aviso detrás de un bucle.
   */
  const falloDeRed = useRef(false);

  const ejecutar = useCallback(async (): Promise<number> => {
    const valores = pendiente.current;
    if (valores === null) return versionRef.current;

    pendiente.current = null;
    setEstado({ tipo: 'guardando' });

    let resultado;
    try {
      resultado = await guardar(valores, versionRef.current);
    } catch {
      falloDeRed.current = true;

      // La llamada no llegó a responder: red caída, un 500, un despliegue a mitad.
      //
      // **Sin esto, el indicador se quedaba en "Guardando…" para siempre**, que es la peor
      // mentira posible en este componente: existe justo para decir si lo escrito está a salvo.
      setEstado({ tipo: 'error', mensaje: FALLO_DE_RED });

      // Y lo pendiente vuelve a la cola, para que el siguiente intento —otro tecleo, o pulsar
      // publicar— lo mande. Solo si no ha llegado nada más nuevo entretanto: pisar lo nuevo con
      // lo viejo sería cambiar un fallo de red por una pérdida de trabajo.
      pendiente.current ??= valores;

      // El borrador local **no** se toca. Solo se borra al confirmar un guardado, y esta es
      // exactamente la situación para la que existe esa red.
      return versionRef.current;
    }

    falloDeRed.current = false;

    if (resultado.ok && resultado.version !== undefined) {
      versionRef.current = resultado.version;
      setVersion(resultado.version);
      setEstado({ tipo: 'guardado' });
      // Se borra **después** de confirmar. Borrarlo antes dejaría al editor sin red justo
      // durante el viaje de red, que es cuando hace falta.
      almacenamiento?.removeItem(claveLocal(key));
      return resultado.version;
    }

    if (resultado.code === 'VERSION_CONFLICT') {
      // **No se reintenta.** Reintentar con la versión nueva pisaría el trabajo de la otra
      // persona, que es justo lo que el bloqueo optimista impide.
      detenido.current = true;
      setEstado({ tipo: 'conflicto' });
      return versionRef.current;
    }

    setEstado({
      tipo: 'error',
      mensaje: resultado.message ?? 'No se ha podido guardar.',
      ...(resultado.fields === undefined ? {} : { campos: resultado.fields }),
    });

    return versionRef.current;
  }, [almacenamiento, guardar, key]);

  /**
   * Guarda lo pendiente y devuelve la versión **ya actualizada**.
   *
   * Si hay otro guardado en marcha, **se espera a que termine** en vez de rendirse. Ese detalle
   * es el que hacía fallar publicar-tras-escribir una de cada dos veces: al pulsar el botón, el
   * `blur` del formulario ya había lanzado su propio guardado, y quien llegaba después recibía
   * la versión de antes y publicaba con ella. El servidor respondía `VERSION_CONFLICT` en la
   * acción más normal que existe.
   *
   * Y al terminar se vuelve a mirar: puede haber quedado algo que mandar detrás.
   */
  const enviar = useCallback(async (): Promise<number> => {
    if (detenido.current) return versionRef.current;

    if (operacion.current !== null) {
      try {
        await operacion.current;
      } catch {
        // Se espera a una operación **ajena**: quien la lanzó ya contó el fallo y dejó el
        // estado como toca. Lo único que hace falta aquí es dejar de esperar en vez de
        // arrastrar el rechazo hasta quien llamó, que no tiene nada que ver.
      }

      return pendiente.current === null || falloDeRed.current ? versionRef.current : enviar();
    }

    if (pendiente.current === null) return versionRef.current;

    const promesa = ejecutar();
    operacion.current = promesa;

    try {
      const version = await promesa;
      // Si llegaron más cambios mientras se guardaba, se encadena.
      return pendiente.current === null || falloDeRed.current ? version : enviar();
    } finally {
      operacion.current = null;
    }
  }, [ejecutar]);

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

  const guardarYa = useCallback(async () => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
    return enviar();
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
