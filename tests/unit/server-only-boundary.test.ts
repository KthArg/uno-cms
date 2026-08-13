import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SPEC §7.1, "Secretos en cliente": `cms/core`, `cms/db`, `cms/auth` y `cms/security` no
 * pueden acabar nunca en el bundle de cliente. La defensa tiene dos capas
 * (docs/specs/00-fundaciones.md §3.5); esta es la primera, la estática.
 *
 * Por qué hace falta si `server-only` ya rompe la build: `server-only` solo actúa sobre lo
 * que el bundler arrastra de verdad al cliente. Un módulo del núcleo que todavía no importa
 * nadie queda sin protección hasta el día en que alguien lo importe mal — y ese día el
 * fallo aparece lejos, en el PR de otro. Esta capa lo exige desde el primer commit.
 *
 * `cms/preview` queda deliberadamente fuera: es el único árbol isomorfo (ADR-106), porque
 * contiene el contrato de contenido del lado cliente que consume la landing.
 */

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Árboles que no pueden llegar al cliente (SPEC §7.1). */
const PROTECTED_TREES = ['cms/core', 'cms/db', 'cms/auth', 'cms/security'] as const;

type Verdict = 'protegido' | 'isomorfo' | 'desprotegido';

/**
 * Clasifica un módulo por su cabecera. Se mira solo el principio del fichero a propósito:
 * un `import 'server-only'` enterrado tras cien líneas es fácil de perder en un refactor.
 */
export function classify(source: string): Verdict {
  const head = source
    .split('\n')
    .slice(0, 20)
    .map((line) => line.trim());

  if (head.some((line) => /^\/\/\s*isomorphic:\s*\S/.test(line))) return 'isomorfo';
  if (head.some((line) => /^import\s+['"]server-only['"]\s*;?$/.test(line))) return 'protegido';
  return 'desprotegido';
}

function listTypeScriptFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listTypeScriptFiles(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('clasificación de módulos', () => {
  // La regla se prueba con fuentes sintéticas y no solo recorriendo el árbol real: hoy
  // esos directorios están vacíos, así que un test que solo recorriera el árbol daría
  // verde sin haber comprobado nada. El mismo problema que el umbral de cobertura.

  it('reconoce el import de server-only al principio del fichero', () => {
    expect(classify("import 'server-only';\n\nexport const x = 1;\n")).toBe('protegido');
    expect(classify('import "server-only"\nexport const x = 1;\n')).toBe('protegido');
  });

  it('acepta una exención isomorfa solo si viene con motivo', () => {
    expect(classify('// isomorphic: tipos compartidos con el cliente\nexport type A = 1;\n')).toBe(
      'isomorfo'
    );
    // Sin motivo detrás de los dos puntos no vale: la exención tiene que justificarse.
    expect(classify('// isomorphic:\nexport type A = 1;\n')).toBe('desprotegido');
  });

  it('marca como desprotegido lo que no declara nada', () => {
    expect(classify('export const secreto = process.env.AUTH_SECRET;\n')).toBe('desprotegido');
  });

  it('no se deja engañar por un server-only enterrado o mencionado de pasada', () => {
    const enterrado = `${'const relleno = 1;\n'.repeat(25)}import 'server-only';\n`;
    expect(classify(enterrado)).toBe('desprotegido');
    expect(classify("// recuerda añadir import 'server-only' aquí\nexport const x = 1;\n")).toBe(
      'desprotegido'
    );
  });
});

describe('SPEC §7.1 — frontera server-only sobre el árbol real', () => {
  it.each(PROTECTED_TREES)('todo módulo de %s declara su lado', (tree) => {
    const desprotegidos = listTypeScriptFiles(join(REPO_ROOT, tree))
      .filter((file) => classify(readFileSync(file, 'utf8')) === 'desprotegido')
      .map((file) => relative(REPO_ROOT, file).split(sep).join(posix.sep));

    expect(desprotegidos).toEqual([]);
  });
});

describe('SPEC §3 — estructura del repositorio', () => {
  // T-03-3. La lista es literal y no se deriva de leer el disco: un test que compruebe
  // "existe lo que existe" no puede fallar nunca.
  const REQUIRED_DIRS = [
    'app/(site)',
    'app/preview',
    'app/admin',
    'app/setup',
    'app/api',
    'cms/core',
    'cms/db',
    'cms/db/migrations',
    'cms/auth',
    'cms/security',
    'cms/actions',
    'cms/ui',
    'cms/ui/fields',
    'cms/preview',
    'components/site',
    'docs',
  ] as const;

  it.each(REQUIRED_DIRS)('existe %s', (dir) => {
    expect(statSync(join(REPO_ROOT, dir)).isDirectory()).toBe(true);
  });
});
