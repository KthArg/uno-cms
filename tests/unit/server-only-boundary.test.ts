import { readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROTECTED_TREES,
  REPO_ROOT,
  classify,
  listTypeScriptFiles,
} from '../support/module-boundary';

/**
 * SPEC §7.1, "Secretos en cliente": `cms/core`, `cms/db`, `cms/auth` y `cms/security` no
 * pueden acabar nunca en el bundle de cliente. La defensa tiene dos capas
 * (docs/specs/00-fundaciones.md §3.5); esta es la primera, la estática.
 *
 * Por qué hace falta si `server-only` ya rompe la build: `server-only` solo actúa sobre lo
 * que el bundler arrastra de verdad al cliente. Un módulo del núcleo que todavía no importa
 * nadie queda sin protección hasta el día en que alguien lo importe mal — y ese día el fallo
 * aparece lejos, en el PR de otro. Esta capa lo exige desde el primer commit.
 *
 * `cms/preview` queda deliberadamente fuera: es el único árbol isomorfo (ADR-106), porque
 * contiene el contrato de contenido del lado cliente que consume la landing.
 */

describe('clasificación de módulos', () => {
  // La regla se prueba con fuentes sintéticas y no solo recorriendo el árbol real: cuando se
  // escribió, esos directorios estaban vacíos y un test que solo recorriera el árbol habría
  // dado verde sin comprobar nada. El mismo problema que el umbral de cobertura.

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

  it('el escaneo encuentra módulos, o el test anterior no prueba nada', () => {
    // El test de arriba compara contra una lista vacía: sobre cero ficheros pasaría
    // siempre. Esto garantiza que hay algo que escanear.
    //
    // Se comprueba el total y no árbol por árbol a propósito: `cms/auth` y `cms/security`
    // se llenan en M2, y exigirles contenido ahora sería exigirle a M1 que haga el trabajo
    // de M2 para que un test pase.
    const total = PROTECTED_TREES.reduce(
      (count, tree) => count + listTypeScriptFiles(join(REPO_ROOT, tree)).length,
      0
    );

    expect(total).toBeGreaterThan(0);
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
    'docs',
  ] as const;

  it.each(REQUIRED_DIRS)('existe %s', (dir) => {
    expect(statSync(join(REPO_ROOT, dir)).isDirectory()).toBe(true);
  });
});
