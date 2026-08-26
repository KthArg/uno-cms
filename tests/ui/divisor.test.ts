import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANCHO_INICIAL_DEL_FORMULARIO,
  MINIMO_DEL_FORMULARIO,
  MINIMO_DE_LA_VISTA_PREVIA,
  anchoDelFormulario,
  guardarAncho,
  leerAnchoGuardado,
} from '@/cms/ui/divisor';

/**
 * T-190-2 y T-190-4: **el reparto de la pantalla del editor** (issue #190).
 *
 * Los topes son lo único de esta pieza que puede dejar la pantalla inservible, y además de una
 * forma que **sobrevive a cerrar la pestaña**: el ancho se guarda, así que un arrastre que deje
 * el formulario a cero lo deja a cero también mañana.
 */

describe('T-190-2 — los topes', () => {
  const HUECO = 1400;

  it('un ancho normal se respeta', () => {
    expect(anchoDelFormulario(600, HUECO)).toBe(600);
  });

  it('un tirón hasta el borde izquierdo se queda en el mínimo del formulario', () => {
    // Soltar fuera de la ventana da números negativos. Sin tope, el formulario desaparece y no
    // hay forma de recuperarlo arrastrando, porque el divisor se ha ido con él.
    for (const tiron of [0, -50, -5000]) {
      expect(anchoDelFormulario(tiron, HUECO), String(tiron)).toBe(MINIMO_DEL_FORMULARIO);
    }
  });

  it('un tirón hasta el borde derecho deja sitio a la vista previa', () => {
    expect(anchoDelFormulario(99_999, HUECO)).toBe(HUECO - MINIMO_DE_LA_VISTA_PREVIA);
  });

  it('en un hueco pequeño manda el formulario, que es donde se escribe', () => {
    // Cuando no caben los dos mínimos, alguien se queda corto. Se elige que sea la vista previa:
    // un formulario ilegible impide trabajar, una vista previa estrecha solo se ve mal.
    const apretado = MINIMO_DEL_FORMULARIO + 100;

    expect(anchoDelFormulario(9999, apretado)).toBe(MINIMO_DEL_FORMULARIO);
  });

  it('sin saber cuánto hueco hay, se respeta lo pedido y su mínimo', () => {
    // El primer pintado ocurre antes de medir, y en jsdom todas las cajas miden cero. Recortar
    // contra un hueco de cero dejaría el formulario clavado en su mínimo antes de que nadie
    // hubiera visto la pantalla.
    for (const sinMedir of [0, -1, Number.NaN]) {
      expect(anchoDelFormulario(600, sinMedir), String(sinMedir)).toBe(600);
    }
  });

  it('un ancho que no es un número cae en el inicial, no en `NaN`', () => {
    // `Number('vacío')` es `NaN`, y un `NaN` en un `grid-template-columns` deja la pantalla sin
    // columnas. Es lo que llegaría de un `localStorage` manipulado o de otra versión.
    expect(anchoDelFormulario(Number.NaN, 1400)).toBe(ANCHO_INICIAL_DEL_FORMULARIO);
  });

  it('los dos mínimos dejan sitio de verdad', () => {
    // Un tope que no acota nada es peor que ninguno: da la sensación de estar protegido. Por
    // debajo de un móvil, la vista previa no contesta ninguna pregunta.
    expect(MINIMO_DE_LA_VISTA_PREVIA).toBeGreaterThanOrEqual(360);
    expect(MINIMO_DEL_FORMULARIO).toBeGreaterThanOrEqual(280);
  });
});

describe('T-190-4 — se recuerda en el navegador, y solo ahí', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('lo guardado se lee de vuelta', () => {
    guardarAncho(640);

    expect(leerAnchoGuardado()).toBe(640);
  });

  it('sin nada guardado devuelve null y no un cero', () => {
    expect(leerAnchoGuardado()).toBeNull();
  });

  it('un valor manipulado no se cuela', () => {
    // `localStorage` lo puede escribir cualquiera desde la consola, y lo que salga de aquí va a
    // un `grid-template-columns`.
    for (const basura of ['', 'ancho', '-40', '0', 'NaN']) {
      window.localStorage.setItem('unocms:ancho-del-formulario', basura);
      expect(leerAnchoGuardado(), basura).toBeNull();
    }
  });

  it('si el navegador no deja mirar, no revienta la pantalla', () => {
    // **`localStorage` lanza** en navegación privada de algunos navegadores y con el
    // almacenamiento bloqueado. Sin el `try`, el editor entero dejaría de pintarse y el síntoma
    // sería una pantalla en blanco sin relación aparente con un divisor.
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });

    expect(() => leerAnchoGuardado()).not.toThrow();
    expect(leerAnchoGuardado()).toBeNull();
    expect(() => {
      guardarAncho(500);
    }).not.toThrow();
  });
});
