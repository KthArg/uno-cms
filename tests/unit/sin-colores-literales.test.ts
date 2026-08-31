import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';
import { ficherosDelPanel } from '../support/panel';

/**
 * T-212-1 y T-212-2: **el color no se escribe en los componentes** (spec 10 §3, issue #219).
 *
 * ## Qué protege esto exactamente
 *
 * Que exista un solo sitio donde el panel decide de qué color es cada cosa. Antes de #219 había
 * ~250 clases literales repartidas por veintitrés ficheros, y por eso no había modo oscuro: no
 * es que faltara escribirlo, es que habría habido que escribirlo doscientas cincuenta veces.
 *
 * Sin esta guarda, la vuelta atrás es de una línea y no la ve nadie: alguien con prisa escribe
 * `text-slate-600` porque es lo que sabe, funciona en claro, y deja un texto gris oscuro sobre
 * fondo oscuro que solo se ve entrando en esa pantalla con el modo puesto.
 *
 * ## Por qué también se prohíben las variantes `dark:`
 *
 * Porque son la otra forma de tener dos verdades. Con fichas, el valor de cada modo vive junto
 * al otro y hay un test que exige que ninguno se quede sin pareja; con `dark:` cada clase lleva
 * su propia excepción y no hay forma de comprobar que están todas.
 */

const PALETA =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const LITERAL = new RegExp(
  `\\b(?:bg|text|border|ring|outline|divide|from|via|to|placeholder|decoration|shadow|accent|caret|fill|stroke)-(?:${PALETA}-[0-9]{2,3}|white|black)\\b`,
  'g'
);

describe('T-212-1 — ningún componente del panel escribe un color', () => {
  for (const ruta of ficherosDelPanel()) {
    it(ruta, () => {
      const encontrados = [
        ...new Set(readFileSync(join(REPO_ROOT, ruta), 'utf8').match(LITERAL) ?? []),
      ];

      expect(
        encontrados,
        `usa colores de la paleta en vez de fichas: ${encontrados.join(', ')}. ` +
          'Las fichas están en app/globals.css y la razón en docs/specs/10-estetica-del-panel.md §3'
      ).toEqual([]);
    });
  }

  it('y la lista de ficheros no está vacía, o esto no comprobaría nada', () => {
    // El modo de fallo de una guarda que recorre ficheros: que deje de encontrarlos —un
    // directorio renombrado, un glob mal escrito— y se quede en verde para siempre sin mirar
    // nada. Ya pasó en este repositorio con otra guarda.
    expect(ficherosDelPanel().length).toBeGreaterThan(15);
  });
});

describe('T-212-2 — no hay variantes `dark:` en el panel', () => {
  it('ninguna, en ningún fichero', () => {
    const conVariante = ficherosDelPanel().filter((ruta) =>
      /\bdark:/.test(readFileSync(join(REPO_ROOT, ruta), 'utf8'))
    );

    expect(
      conVariante,
      'el modo oscuro sale de las fichas, no de variantes: si hiciera falta una `dark:`, ' +
        'es que falta una ficha'
    ).toEqual([]);
  });
});
