import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACTION_MARKER } from '@/cms/actions/pipeline';

/**
 * T-75-6: **toda action exportada pasa por el envoltorio**.
 *
 * Este test es la forma verificable de cumplir `SPEC.md` §7.1, "chequeo de rol en cada
 * action (server), no solo en UI". Sin él, esa mitigación depende de que nadie se despiste
 * al añadir la siguiente action — y la primera de M4 reabriría la fila de la tabla de
 * amenazas sin que nadie lo notara.
 *
 * Comprueba dos cosas distintas, y hacen falta las dos:
 *
 * 1. Que cada función exportada por `cms/actions/index.ts` lleve la marca del envoltorio.
 * 2. Que **ningún fichero de `cms/actions/` exporte una función suelta** sin pasar por él.
 *    Sin lo segundo, bastaría con no reexportarla desde el barril para esquivar el test, y
 *    la action seguiría siendo invocable desde el panel.
 */

const ACTIONS_DIR = fileURLToPath(new URL('../../cms/actions', import.meta.url));

/** Ficheros de `cms/actions/` que no contienen actions. */
const NOT_ACTIONS = new Set(['pipeline.ts', 'index.ts', 'README.md']);

describe('T-75-6 — toda action pasa por el envoltorio', () => {
  it('cada función exportada del barril lleva la marca', async () => {
    const actions = (await import('@/cms/actions')) as Record<string, unknown>;

    const sinMarca = Object.entries(actions)
      .filter(([, value]) => typeof value === 'function')
      // Las herramientas del envoltorio no son actions. La lista es explícita a propósito:
      // una exclusión por patrón ("todo lo que empiece por fail") dejaría pasar una action
      // suelta el día que alguien la llame `failoverContent`.
      .filter(
        ([name]) =>
          !['defineAction', 'ok', 'fail', 'failFields', 'fieldsFromZod', 'contentTag'].includes(
            name
          )
      )
      .filter(([, value]) => (value as Record<symbol, unknown>)[ACTION_MARKER] !== true)
      .map(([name]) => name);

    expect(sinMarca, 'estas exportaciones no pasan por defineAction').toEqual([]);
  });

  it('ningún fichero de cms/actions exporta una función fuera del envoltorio', async () => {
    // Reexportar es opcional: sin esta comprobación, bastaría con no incluirla en el barril
    // para esquivar el test anterior, y la action seguiría siendo invocable.
    const ficheros = readdirSync(ACTIONS_DIR).filter(
      (name) => name.endsWith('.ts') && !NOT_ACTIONS.has(name)
    );

    for (const fichero of ficheros) {
      const source = readFileSync(join(ACTIONS_DIR, fichero), 'utf8');
      // Comparación por prefijo y no una expresión regular: aquí no hace falta y el
      // analizador de seguridad marca (con razón) cualquier cuantificador anidado.
      const exportaFuncion = source
        .split('\n')
        .some(
          (line) => line.startsWith('export function ') || line.startsWith('export async function ')
        );

      expect(
        exportaFuncion,
        `${fichero} exporta una función directamente; toda action debe construirse con defineAction`
      ).toBe(false);
    }
  });

  it('el propio test detecta una action sin envolver', () => {
    // Verificación del test: sin este caso, un fallo en la comprobación de la marca daría
    // verde para siempre.
    const suelta = () => Promise.resolve({ ok: true as const, data: undefined });

    expect((suelta as unknown as Record<symbol, unknown>)[ACTION_MARKER]).not.toBe(true);
  });
});
