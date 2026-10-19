import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-S-21: la cadena de suministro de CI (spec 19).
 *
 * `docs/SECURITY.md` justificaba no anclar por SHA diciendo que «las cuatro acciones son
 * oficiales de GitHub», y había cinco: `pnpm/action-setup` es de terceros, iba por etiqueta y
 * corría en todos los jobs justo después del checkout, con el token del workflow escrito en
 * `.git/config`.
 */

const DIR = join(REPO_ROOT, '.github', 'workflows');
const WORKFLOWS = readdirSync(DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ nombre: f, lineas: readFileSync(join(DIR, f), 'utf8').split('\n') }));

/** `uses: dueño/accion@ref`, con lo que haya detrás. */
const USES = /^\s*-?\s*uses:\s*([^@\s]+)@(\S+)/;

describe('T-S-21 — acciones de terceros por SHA, y el token fuera de .git/config', () => {
  it('hay workflows que mirar, o esto no comprueba nada', () => {
    const usos = WORKFLOWS.flatMap((w) => w.lineas.filter((l) => USES.test(l)));
    expect(usos.length).toBeGreaterThan(5);
  });

  it('toda acción que no es de actions/ va anclada por un SHA completo', () => {
    const sueltas = WORKFLOWS.flatMap(({ nombre, lineas }) =>
      lineas
        .map((l) => USES.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .filter(([, accion]) => !accion!.startsWith('actions/') && !accion!.startsWith('./'))
        .filter(([, , ref]) => !/^[0-9a-f]{40}$/.test(ref!))
        .map(([, accion, ref]) => `${nombre}: ${accion}@${ref}`)
    );

    expect(sueltas).toEqual([]);
  });

  it('todo checkout lleva persist-credentials: false', () => {
    const sinQuitar = WORKFLOWS.flatMap(({ nombre, lineas }) =>
      lineas.flatMap((linea, i) => {
        if (!/uses:\s*actions\/checkout@/.test(linea)) return [];
        // El bloque `with:` del paso: las líneas siguientes más indentadas que el `- uses`.
        const sangria = linea.search(/\S/);
        const bloque: string[] = [];
        for (const siguiente of lineas.slice(i + 1)) {
          if (siguiente.trim() !== '' && siguiente.search(/\S/) <= sangria) break;
          bloque.push(siguiente);
        }
        return bloque.some((l) => /persist-credentials:\s*false/.test(l))
          ? []
          : [`${nombre}:${i + 1}`];
      })
    );

    expect(sinQuitar).toEqual([]);
  });
});
