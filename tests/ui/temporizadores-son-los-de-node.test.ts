import nodeTimers from 'node:timers';
import { describe, expect, it } from 'vitest';

/**
 * Guarda: **los temporizadores del proyecto `ui` son los de Node, no los de jsdom.**
 *
 * Existe por el issue #276. Cuando `jsdom` subió cinco mayores de golpe (#174) el mismo día que
 * apareció el flake del autosave (#274), no había forma de saber si la subida había cambiado el
 * comportamiento de los temporizadores en toda la suite — y el único test que lo habría notado
 * acababa de pasarse a reloj falso (#275).
 *
 * La respuesta es que **no puede cambiarlo**, y el motivo está en Vitest, no en jsdom. Su
 * `populateGlobal` copia al global las propiedades de la ventana, pero filtra con
 * `if (k in global) return KEYS.includes(k)`: `setTimeout` ya existe en el global de Node y **no**
 * está en la lista `KEYS` de Vitest, así que se descarta y el global conserva el de Node.
 * `requestAnimationFrame` y `document` sí están en esa lista, y por eso de esos sí llega la
 * versión de jsdom. Las dos condiciones —que Node lo tenga, que Vitest no lo liste— no dependen
 * de la versión de jsdom.
 *
 * Lo que compra esta guarda: si un día una subida —de Vitest, o de Node— mueve esa frontera, se
 * entera aquí un test de milisegundos, y no un flake a las semanas en un caso que parecía hablar
 * de otra cosa.
 */
describe('los temporizadores del entorno `ui`', () => {
  it('son exactamente los de Node, también los que se ven por `window`', () => {
    expect(globalThis.setTimeout).toBe(nodeTimers.setTimeout);
    expect(globalThis.clearTimeout).toBe(nodeTimers.clearTimeout);
    // Vitest apunta `window` al propio global, así que el código de componentes que llame a
    // `window.setTimeout` acaba en el mismo sitio.
    expect(window.setTimeout).toBe(globalThis.setTimeout);
  });

  it('y jsdom trae los suyos, distintos — o sea que lo de arriba afirma algo', () => {
    // Sin esto, el aserto anterior podría ser cierto porque jsdom no tenga temporizadores
    // propios, y entonces no mediría nada. Un iframe da una ventana **de este mismo jsdom** que
    // Vitest no ha tocado: ahí se ve que sí los tiene y que no son los de Node — los suyos pasan
    // por las conversiones WebIDL. O sea que lo de arriba es una decisión de Vitest, no una
    // carencia de jsdom.
    const marco = document.createElement('iframe');
    document.body.appendChild(marco);
    const propioDeJsdom = marco.contentWindow!.setTimeout;

    expect(propioDeJsdom as unknown).not.toBe(nodeTimers.setTimeout as unknown);
    expect(Function.prototype.toString.call(propioDeJsdom)).toContain('webIDLConversions');

    marco.remove();
  });
});
