import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-S-23: ningún fichero de entorno entra en git salvo la plantilla (spec 19).
 *
 * `.gitignore` tenía `.env` y `.env*.local`: un `.env.production` o un `.env.development` con
 * secretos de verdad se versionaba sin que nada avisara. Se pregunta a git y no se lee el
 * fichero, porque lo que importa es lo que git hace con él, reglas de negación incluidas.
 */
function ignorado(ruta: string): boolean {
  // `check-ignore` responde 0 si se ignora y 1 si no; no hace falta que el fichero exista.
  return spawnSync('git', ['check-ignore', '-q', ruta], { cwd: REPO_ROOT }).status === 0;
}

describe('T-S-23 — los .env se quedan fuera de git', () => {
  it.each(['.env', '.env.local', '.env.production', '.env.development', '.env.test'])(
    '%s se ignora',
    (ruta) => {
      expect(ignorado(ruta)).toBe(true);
    }
  );

  it('.env.example no: es la plantilla que se versiona', () => {
    expect(ignorado('.env.example')).toBe(false);
  });
});
