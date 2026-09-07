import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';
import { ficherosDelPanel } from '../support/panel';

/**
 * Las guardas del movimiento (spec 15, issue #239).
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

/**
 * Si un bloque de CSS anima esa propiedad.
 *
 * ## El agujero que tenía, encontrado por mutación
 *
 * La primera versión exigía que la propiedad fuera seguida de `:` o `,`, y eso deja fuera **la
 * última de una lista**, que va seguida de `;`. O sea que
 * `transition-property: color, transform, height;` pasaba en verde — y añadir al final es
 * exactamente cómo se añade una propiedad a una lista.
 *
 * Ahora el final se reconoce con `:`, `,`, `;`, `}` o el fin del texto, y los casos de abajo lo
 * comprueban en las tres posiciones. Una guarda que solo mira el medio de la lista es peor que
 * ninguna: da por revisado justo el sitio donde se escribe lo nuevo.
 *
 * ## Las barras dobladas
 *
 * Van **a propósito**: esto es un template literal, y en JavaScript `\s` dentro de uno se queda en
 * la letra `s`. Con una sola barra la clase pasaría a ser «s, coma, punto y coma o llave» y
 * dejaría de reconocer la sangría de las declaraciones del CSS — la guarda no encontraría nada y
 * saldría verde igual. Ya pasó una vez.
 *
 * `propiedad` sale de `CUESTAN_MAQUETA`, una lista literal de este mismo fichero: no hay ningún
 * dato de fuera que llegue al constructor. Escribir las diez expresiones a mano es justo lo que
 * hace que la próxima propiedad se añada a la lista y se olvide en la expresión.
 */
function anima(bloque: string, propiedad: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(`(?:^|[\\s,;{])${propiedad}\\s*(?=[:,;}]|$)`, 'm').test(bloque);
}

describe('la guarda de maqueta reconoce la propiedad en cualquier posición', () => {
  // Verificación del propio detector, y no sobra: su versión anterior solo veía la primera y las
  // centrales, así que la suite decía «ninguna anima height» sin haber mirado el sitio donde se
  // escribe una propiedad nueva.
  it.each([
    ['al principio de la lista', 'height, color, transform'],
    ['en el medio', 'color, height, transform'],
    ['al final, que es la que se escapaba', 'color, transform, height'],
    ['sola y terminada en punto y coma', 'height;'],
    ['dentro de un bloque de fotogramas', '  from { height: 0; }'],
  ])('lo caza %s', (_caso, bloque) => {
    expect(anima(bloque, 'height')).toBe(true);
  });

  it('y no confunde `line-height` con `height`', () => {
    // El límite de la izquierda es lo que lo impide: en `line-height`, delante de `height` hay un
    // guion, que no cuenta como principio para esta expresión.
    expect(anima('color, line-height', 'height')).toBe(false);
  });

  it('ni marca lo que sí se puede animar', () => {
    expect(anima('color, background-color, opacity, transform', 'height')).toBe(false);
  });
});

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
      const culpables = declaraciones.filter((bloque) => anima(bloque, propiedad));

      expect(
        culpables,
        `anima ${propiedad}, que obliga a rehacer la maqueta en cada fotograma. ` +
          'Se anima transform y opacity; el motivo está en docs/specs/15-movimiento.md §2'
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
