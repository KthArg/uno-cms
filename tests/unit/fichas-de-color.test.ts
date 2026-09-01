import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-212-3 y T-212-4: **las fichas de color del panel** (spec 10, issue #219).
 *
 * ## Qué hace este fichero que no haría mirar la pantalla
 *
 * Calcular. Un modo oscuro se ve bien y tiene contraste de 3:1 sin que nadie lo note; el listón
 * de accesibilidad de Lighthouse es ≥ 95 y va en CI, así que el fallo aparece días después y
 * lejos de su causa. Aquí cada pareja texto/fondo que el panel usa de verdad se comprueba con
 * la fórmula de WCAG, en los dos modos.
 *
 * ## Y por qué lee el CSS en vez de importar constantes
 *
 * Porque el CSS **es** la fuente de verdad. Una copia en TypeScript para que el test la lea
 * sería un segundo sitio que mantener, y el día que discreparan el test daría verde sobre los
 * valores que no se sirven.
 */

const CSS = readFileSync(join(REPO_ROOT, 'app', 'globals.css'), 'utf8');

/**
 * Las fichas declaradas en el bloque que abre `apertura`.
 *
 * **Devuelve vacío si no encuentra el bloque, en vez de lanzar**, y esa decisión salió de una
 * mutación. La primera versión buscaba el selector como cadena literal —saltos de línea y
 * sangría incluidos— y comprobaba con `expect` en el cuerpo del módulo: al quitar una ficha
 * para ver si el test la echaba de menos, el fichero **reventó al cargarse** («no tests») con
 * un mensaje que hablaba del parser.
 *
 * Un test que ante una regresión revienta en vez de fallar no es equivalente a uno que falla:
 * el rojo no dice qué se rompió, y el mensaje señala al sitio equivocado.
 */
function fichasDe(apertura: RegExp): Record<string, string> {
  const encontrado = apertura.exec(CSS);
  if (encontrado === null) return {};

  const abre = CSS.indexOf('{', encontrado.index + encontrado[0].length - 1);
  const cierra = CSS.indexOf('}', abre);
  const cuerpo = CSS.slice(abre + 1, cierra);

  return Object.fromEntries(
    [...cuerpo.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)].map((e) => [e[1]!, e[2]!])
  );
}

const CLARO = fichasDe(/@theme\s*\{/);
const OSCURO_DEL_SISTEMA = fichasDe(
  /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*\[data-tema=['"]sistema['"]\]\s*\{/
);
const OSCURO_ELEGIDO = fichasDe(/\[data-tema=['"]oscuro['"]\]\s*\{/);

/**
 * Las opacidades del bloque que abre `apertura`, como fracción.
 *
 * Se leen del CSS por lo mismo que los colores: es la fuente de verdad. Y **tienen que estar en
 * el CSS como fichas** —no dentro de `@utility cristal`— precisamente para que este fichero
 * pueda leerlas; está decidido en ADR-800 y contado en `app/globals.css`.
 */
function opacidadesDe(apertura: RegExp): Record<string, number> {
  const encontrado = apertura.exec(CSS);
  if (encontrado === null) return {};

  const abre = CSS.indexOf('{', encontrado.index + encontrado[0].length - 1);
  const cierra = CSS.indexOf('}', abre);
  const cuerpo = CSS.slice(abre + 1, cierra);

  return Object.fromEntries(
    [...cuerpo.matchAll(/--opacidad-([a-z-]+):\s*([0-9.]+)%\s*;/g)].map((e) => [
      e[1]!,
      Number(e[2]!) / 100,
    ])
  );
}

const OPACIDAD_CLARO = opacidadesDe(/@theme\s*\{/);
const OPACIDAD_OSCURO = opacidadesDe(
  /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*\[data-tema=['"]sistema['"]\]\s*\{/
);

/**
 * Lo que se ve cuando `capa` se pinta con opacidad `alfa` sobre `debajo`.
 *
 * Es la fórmula de composición de siempre —`alfa · capa + (1 − alfa) · debajo`, canal a canal—
 * y es la mitad de T-215-1: sin ella, la comprobación de contraste mide el color nominal de una
 * ficha que nadie llega a ver, porque el cristal es translúcido.
 */
function componer(capa: string, alfa: number, debajo: string): string {
  const mezcla = (i: number): string => {
    const arriba = Number.parseInt(capa.slice(i, i + 2), 16);
    const fondo = Number.parseInt(debajo.slice(i, i + 2), 16);

    return Math.round(alfa * arriba + (1 - alfa) * fondo)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${[1, 3, 5].map(mezcla).join('')}`;
}

/** Luminancia relativa, tal y como la define WCAG 2.1. */
function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contraste(uno: string, otro: string): number {
  const [a, b] = [luminancia(uno), luminancia(otro)].sort((x, y) => y - x);

  return (a! + 0.05) / (b! + 0.05);
}

/**
 * Las parejas que el panel pinta de verdad, texto sobre fondo.
 *
 * Es una lista escrita a mano, y esa es la parte que hay que mantener: una ficha nueva que se
 * use sobre un fondo nuevo no aparece aquí sola. Se acepta porque la alternativa —cruzar todas
 * las fichas contra todas— comprobaría combinaciones que nadie pinta y obligaría a que cualquier
 * par de colores contrastara, que es como se acaba con una paleta de blanco y negro.
 */
const PAREJAS: readonly (readonly [string, string])[] = [
  ['tinta', 'papel'],
  ['tinta', 'superficie'],
  ['tinta', 'superficie-suave'],
  ['tinta-suave', 'papel'],
  ['tinta-suave', 'superficie'],
  ['tinta-tenue', 'papel'],
  ['tinta-tenue', 'superficie'],
  ['sobre-accion', 'accion'],
  ['sobre-accion', 'accion-hover'],
  ['acento', 'papel'],
  ['acento', 'superficie'],
  ['sobre-acento', 'acento'],
  ['alarma', 'papel'],
  ['alarma', 'superficie'],
  ['alarma', 'alarma-fondo'],
  ['sobre-alarma', 'alarma-accion'],
  ['sobre-alarma', 'alarma-accion-hover'],
  ['publicado-tinta', 'publicado-fondo'],
  ['pendiente-tinta', 'pendiente-fondo'],
  ['sobre-pendiente', 'pendiente-accion'],
  ['sobre-pendiente', 'pendiente-accion-hover'],
];

describe('T-212-3 — ninguna ficha se queda sin su pareja', () => {
  it('el modo oscuro define exactamente las mismas fichas que el claro', () => {
    // Una ficha sin valor en oscuro no rompe nada visible: hereda la del claro, así que sale
    // un texto oscuro sobre fondo oscuro **solo en esa esquina**. Es el fallo que nadie
    // encuentra mirando, porque hay que abrir justo esa pantalla en justo ese modo.
    expect(Object.keys(OSCURO_DEL_SISTEMA).sort()).toEqual(Object.keys(CLARO).sort());
  });

  it('los dos bloques oscuros son idénticos', () => {
    // Están duplicados porque CSS no deja compartir un bloque entre un `@media` y un selector
    // de atributo. Lo que impide que se separen es este caso, no la disciplina: sin él, quien
    // ajuste un color en uno y no en el otro deja el panel con dos oscuros distintos según se
    // haya tocado el interruptor o no.
    expect(OSCURO_ELEGIDO).toEqual(OSCURO_DEL_SISTEMA);
  });

  it('y los tres bloques existen y tienen fichas de verdad', () => {
    // Sin esto, un `globals.css` que perdiera un bloque entero dejaría los dos casos anteriores
    // en verde comparando `{}` con `{}`. Es el modo de fallo que convierte una guarda en
    // decoración: nunca se pone roja porque ya no mira nada.
    for (const [nombre, fichas] of [
      ['claro', CLARO],
      ['oscuro del sistema', OSCURO_DEL_SISTEMA],
      ['oscuro elegido', OSCURO_ELEGIDO],
    ] as const) {
      expect(Object.keys(fichas).length, `el bloque «${nombre}» no tiene fichas`).toBeGreaterThan(
        20
      );
    }
  });
});

describe('T-212-4 — el contraste cumple AA en los dos modos', () => {
  for (const modo of ['claro', 'oscuro'] as const) {
    const fichas = modo === 'claro' ? CLARO : OSCURO_DEL_SISTEMA;

    for (const [texto, fondo] of PAREJAS) {
      it(`${modo}: «${texto}» sobre «${fondo}»`, () => {
        const uno = fichas[texto];
        const otro = fichas[fondo];

        expect(uno, `falta la ficha ${texto} en ${modo}`).toBeDefined();
        expect(otro, `falta la ficha ${fondo} en ${modo}`).toBeDefined();

        const ratio = contraste(uno!, otro!);

        // 4,5:1 es el mínimo de WCAG AA para texto normal. No se rebaja a 3:1 «porque es texto
        // grande»: en este panel casi nada lo es, y la excepción se acabaría aplicando a todo.
        expect(
          Number(ratio.toFixed(2)),
          `${texto} (${uno}) sobre ${fondo} (${otro}) da ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * Las fichas de texto que **pueden ir sobre cristal**.
 *
 * No es la lista de todas: es la de las que el panel pinta encima de una lámina translúcida. El
 * resto —los pares de estado, los «sobre-algo»— van sobre superficies opacas por la tabla de la
 * spec 11 §3, y comprobarlas aquí obligaría a que todo contrastara contra todo.
 */
const TEXTO_SOBRE_CRISTAL = ['tinta', 'tinta-suave', 'tinta-tenue', 'acento', 'alarma'];

describe('T-215-1 — el contraste sobre cristal se mide en el color que se ve', () => {
  for (const [modo, fichas, opacidades] of [
    ['claro', CLARO, OPACIDAD_CLARO],
    ['oscuro', OSCURO_DEL_SISTEMA, OPACIDAD_OSCURO],
  ] as const) {
    /**
     * Los dos extremos del fondo que puede haber detrás de un cristal (ADR-800).
     *
     * Que sean **dos y conocidos** es toda la decisión de diseño: detrás del cristal solo hay el
     * fondo de la página, nunca contenido arbitrario y nunca una imagen. Sin esa regla, el fondo
     * efectivo no se puede acotar y esta comprobación no existiría.
     */
    const extremos = [
      ['el papel a secas', fichas['papel']],
      ['el punto más claro del halo', fichas['fondo-claro']],
    ] as const;

    for (const texto of TEXTO_SOBRE_CRISTAL) {
      for (const [donde, fondo] of extremos) {
        it(`${modo}: «${texto}» sobre cristal, con ${donde} detrás`, () => {
          const tinte = fichas['cristal'];
          const alfa = opacidades['cristal'];

          expect(tinte, `falta la ficha cristal en ${modo}`).toBeDefined();
          expect(fondo, `falta el extremo del fondo en ${modo}`).toBeDefined();
          expect(alfa, `falta --opacidad-cristal en ${modo}`).toBeDefined();
          expect(fichas[texto], `falta la ficha ${texto} en ${modo}`).toBeDefined();

          const visto = componer(tinte!, alfa!, fondo!);
          const ratio = contraste(fichas[texto]!, visto);

          expect(
            Number(ratio.toFixed(2)),
            `${texto} (${fichas[texto]!}) sobre el cristal compuesto (${visto}) da ` +
              `${ratio.toFixed(2)}:1. Sube el contraste de la ficha, baja --opacidad-cristal ` +
              'o baja el halo: los tres mueven este número.'
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

describe('T-215-1 — y el extremo declarado es el extremo de verdad', () => {
  for (const [modo, fichas, opacidades] of [
    ['claro', CLARO, OPACIDAD_CLARO],
    ['oscuro', OSCURO_DEL_SISTEMA, OPACIDAD_OSCURO],
  ] as const) {
    it(`${modo}: «fondo-claro» es lo que sale de componer las dos manchas del halo`, () => {
      // **Este es el caso que sostiene a los de arriba.** `--color-fondo-claro` se escribe a
      // mano, y si el halo cambia y esa ficha no, la comprobación de contraste sigue en verde
      // midiendo un extremo que ya no existe en ninguna pantalla — que es exactamente el modo
      // de fallo que ADR-800 dice evitar, reaparecido un nivel más abajo.
      const tras1 = componer(fichas['halo-calido']!, opacidades['halo-calido']!, fichas['papel']!);
      const esperado = componer(fichas['halo-frio']!, opacidades['halo-frio']!, tras1);

      // Canal a canal y con un punto de margen: componer en dos pasos redondea dos veces, y
      // exigir igualdad exacta convertiría este caso en frágil por una unidad de 255.
      const canales = (hex: string): number[] =>
        [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

      const declarado = canales(fichas['fondo-claro']!);
      const calculado = canales(esperado);

      for (const [i, valor] of calculado.entries()) {
        expect(
          Math.abs(valor - declarado[i]!),
          `--color-fondo-claro en ${modo} dice ${fichas['fondo-claro']!} y las manchas del ` +
            `halo dan ${esperado}. Recalcúlalo o baja el halo.`
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('T-215-1 — las opacidades también tienen pareja en los dos modos', () => {
  it('el oscuro declara exactamente las mismas que el claro', () => {
    // Mismo motivo que con los colores, y con una consecuencia peor: una opacidad sin pareja
    // hereda la del otro modo, y el 62 % de blanco que es una lámina en claro deja el cristal
    // oscuro **casi opaco**. Se vería, pero no sabría nadie por qué.
    expect(Object.keys(OPACIDAD_OSCURO).sort()).toEqual(Object.keys(OPACIDAD_CLARO).sort());
  });

  it('y son unas cuantas, no cero', () => {
    // Si el formato del CSS cambiara —una opacidad escrita como `0.08` en vez de `8%`— el
    // lector devolvería `{}` y los casos de cristal pasarían todos sin comparar nada.
    expect(Object.keys(OPACIDAD_CLARO).length).toBeGreaterThanOrEqual(4);
  });
});

describe('la fórmula de contraste no es de adorno', () => {
  it('reconoce los extremos conocidos', () => {
    // Sin esto, un error en la fórmula haría que todos los casos de arriba pasaran con
    // cualquier paleta.
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('y pesa cada canal como manda WCAG, no por igual', () => {
    // **Este caso salió de una mutación que sobrevivió.** La primera versión comprobaba
    // `#777777` sobre blanco, y los tres valores de referencia eran grises: en un gris los tres
    // canales valen lo mismo, así que sustituir los pesos 0,2126 / 0,7152 / 0,0722 por una
    // media aritmética **no cambiaba ni un resultado**. La fórmula quedaba sin comprobar
    // justamente en lo que la hace fórmula.
    //
    // Y no es teórico: la paleta tiene un acento oliva, un ámbar y un rojo. Con los pesos mal,
    // el verde puntúa muchísimo más bajo y el azul mucho más alto de lo que son.
    expect(contraste('#00ff00', '#ffffff')).toBeCloseTo(1.37, 1);
    expect(contraste('#0000ff', '#ffffff')).toBeCloseTo(8.59, 1);
    expect(contraste('#ff0000', '#ffffff')).toBeCloseTo(4.0, 1);
  });
});

describe('la composición tampoco', () => {
  it('los extremos: sin opacidad es el fondo, con toda es la capa', () => {
    // Sin esto, un error que devolviera siempre el fondo dejaría los casos de cristal midiendo
    // el contraste contra el papel —que es alto— y pasando todos.
    expect(componer('#ffffff', 0, '#000000')).toBe('#000000');
    expect(componer('#ffffff', 1, '#000000')).toBe('#ffffff');
  });

  it('y mezcla canal a canal, no en bloque', () => {
    // Medio blanco sobre negro es gris medio; y un caso con los tres canales distintos, para
    // que una implementación que mezclara solo el rojo y copiara el resto no sobreviviera.
    expect(componer('#ffffff', 0.5, '#000000')).toBe('#808080');
    expect(componer('#ff0000', 0.5, '#0000ff')).toBe('#800080');
  });
});
