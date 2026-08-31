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
