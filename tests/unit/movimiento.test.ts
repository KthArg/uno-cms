import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';
import { ficherosDelPanel } from '../support/panel';

/**
 * Las guardas del movimiento (spec 13, issue #239).
 *
 * ## Por qué hace falta vigilar esto y no basta con haberlo escrito bien
 *
 * Porque una animación mal elegida **no se ve mal**: se ve igual y cuesta el doble. Animar un
 * `height` produce exactamente la misma imagen que animar un `transform`, con la diferencia de
 * que obliga al navegador a rehacer la maqueta en cada fotograma. En el portátil de quien lo
 * escribe no se nota; se nota en el móvil de quien usa el panel, y llega a CI como una caída del
 * rendimiento en Lighthouse que nadie sabe de dónde salió.
 *
 * La otra mitad es `prefers-reduced-motion`. Ese bloque existía desde el rediseño y **no lo
 * comprobaba nadie**, lo cual era barato mientras casi nada se movía. Con animaciones de verdad
 * pasa a ser lo que separa una interfaz agradable de una que marea a quien ha pedido por escrito
 * que no la maree. Aquí se comprueba que el bloque cubre lo que hay; que además funcione en un
 * navegador de verdad es T-237-2, en `tests/e2e/movimiento.spec.ts`.
 */

/**
 * **Con los finales de línea normalizados, y esto no es cosmético.**
 *
 * En el árbol de trabajo de Windows este fichero está en CRLF; en CI, en LF. La primera versión
 * de estas expresiones buscaba un salto de línea seguido de llave y en local no casaba con
 * **ningún** `@keyframes`: los tres bloques de fotogramas pasaban sin que nadie los mirara y el
 * test salía verde igual. Sin esta línea, media guarda sería decoración justo en la máquina donde
 * más se edita.
 */
const CSS = readFileSync(join(REPO_ROOT, 'app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

/**
 * Las propiedades que el navegador **no** puede animar en el compositor.
 *
 * Cada una obliga a recalcular la maqueta de la página en cada fotograma. La lista es corta a
 * propósito: son las que apetece animar, y todas tienen una alternativa con `transform`.
 */
const CUESTAN_MAQUETA = [
  'width',
  'height',
  'top',
  'left',
  'right',
  'bottom',
  'margin',
  'padding',
  'font-size',
  'line-height',
];

const TRANSICIONES = [...CSS.matchAll(/transition-property:\s*([^;]+);/g)];
const FOTOGRAMAS = [...CSS.matchAll(/@keyframes[^{]*\{([\s\S]*?)\n\}/g)];

describe('T-237-3 — no se anima nada que cueste maqueta', () => {
  // Las dos familias se cuentan **por separado**, porque ya falló contarlas juntas: las
  // transiciones casaban, los fotogramas no, y la suma daba «más de cero» exactamente igual.
  it('se están revisando transiciones de verdad', () => {
    expect(TRANSICIONES.length).toBeGreaterThanOrEqual(2);
  });

  it('se están revisando fotogramas de verdad', () => {
    expect(FOTOGRAMAS.length).toBe([...CSS.matchAll(/@keyframes/g)].length);
    expect(FOTOGRAMAS.length).toBeGreaterThanOrEqual(3);
  });

  const declaraciones = [...TRANSICIONES, ...FOTOGRAMAS].map(
    (coincidencia) => coincidencia[1] ?? ''
  );

  for (const propiedad of CUESTAN_MAQUETA) {
    it(`ninguna anima ${propiedad}`, () => {
      /*
       * `propiedad` recorre CUESTAN_MAQUETA, que es una lista literal de este mismo fichero: no
       * hay ningún dato de fuera que pueda llegar al constructor. Escribir las diez expresiones a
       * mano es justo lo que hace que la próxima propiedad se añada a la lista y se olvide en la
       * expresión, y entonces la guarda deja de mirarla sin que nada falle.
       */
      const culpables = declaraciones.filter((bloque) =>
        // Las barras van dobladas **a propósito**: esto es un template literal, y en JavaScript
        // `\s` dentro de uno se queda en la letra `s`. Con una sola barra la clase pasaría a ser
        // «s, coma, punto y coma o llave» y dejaría de reconocer la sangría de las declaraciones
        // del CSS — o sea que la guarda no encontraría nada y saldría verde igual. Ya pasó.
        // eslint-disable-next-line security/detect-non-literal-regexp
        new RegExp(`(?:^|[\\s,;{])${propiedad}\\s*[:,]`, 'm').test(bloque)
      );

      expect(
        culpables,
        `anima ${propiedad}, que obliga a rehacer la maqueta en cada fotograma. ` +
          'Se anima transform y opacity; el motivo está en docs/specs/13-movimiento.md §2'
      ).toEqual([]);
    });
  }
});

describe('T-237-1 — el movimiento sale de las fichas, no de cada componente', () => {
  /**
   * Las clases de Tailwind que fijan una duración o una curva por su cuenta.
   *
   * `transition` a secas entra aquí: es lo que había en veintisiete sitios antes de #239 y lo que
   * hacía que el conjunto no se sintiera de una pieza. Cada uno heredaba la duración por defecto
   * de Tailwind, que no es ninguna de las tres que ahora tiene el panel.
   */
  const SUELTAS =
    /\bclassName[^\n]*?(?<![-\w])(transition|duration-\d+|ease-(?:in|out|linear))(?![-\w])/;

  for (const ruta of ficherosDelPanel()) {
    it(ruta, () => {
      const lineas = readFileSync(join(REPO_ROOT, ruta), 'utf8')
        .split('\n')
        .map((linea, indice) => [indice + 1, linea] as const)
        .filter(([, linea]) => SUELTAS.test(linea))
        .map(([numero]) => numero);

      expect(
        lineas,
        'fija su propia duración o curva en vez de usar `pulsable` o `transicion` de ' +
          'cms/ui/estilos.ts. Tres duraciones y una curva, para todo el panel (ADR-820)'
      ).toEqual([]);
    });
  }
});

describe('T-237-1 — las fichas de movimiento existen y se usan', () => {
  for (const ficha of ['--duracion-instante', '--duracion-corta', '--duracion-media', '--curva']) {
    it(`${ficha} está definida y alguien la usa`, () => {
      expect(CSS).toContain(`${ficha}:`);
      expect(CSS).toContain(`var(${ficha})`);
    });
  }

  it('ninguna utilidad de movimiento escribe una duración a mano', () => {
    const aMano = [...CSS.matchAll(/@utility\s+(\S+)\s*\{([\s\S]*?)\n\}/g)]
      .filter(([, , cuerpo]) => /(?:animation|transition-duration):[^;]*\d+m?s/.test(cuerpo ?? ''))
      .map(([, nombre]) => nombre);

    expect(
      aMano,
      `escriben la duración en vez de usar var(--duracion-*): ${aMano.join(', ')}`
    ).toEqual([]);
  });
});

describe('T-237-2 — quien pide menos movimiento no lo recibe', () => {
  const bloque = CSS.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1];

  it('el bloque existe', () => {
    expect(bloque).toBeDefined();
  });

  for (const corte of ['animation-duration', 'transition-duration', 'animation-iteration-count']) {
    it(`corta ${corte} con !important`, () => {
      // Sin `!important` no gana: las utilidades declaran su duración con la misma especificidad,
      // y decidiría el orden de aparición en la hoja — una forma silenciosa de no cumplir.
      // `corte` viene de la lista literal de tres nombres de la línea de arriba, no de un dato
      // externo; el constructor hace falta para interpolarlo.
      // eslint-disable-next-line security/detect-non-literal-regexp
      expect(bloque).toMatch(new RegExp(`${corte}:[^;]*!important`));
    });
  }

  it('alcanza a los pseudoelementos', () => {
    // El velo del panel y el grano del fondo se pintan en `::before`. Un selector que solo
    // cubriera elementos dejaría fuera justo lo que ocupa la pantalla entera.
    expect(bloque).toContain('*::before');
    expect(bloque).toContain('*::after');
  });
});
