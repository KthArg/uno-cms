import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Utilidades compartidas por los tests de la frontera servidor/cliente (SPEC §7.1):
 * `server-only-boundary.test.ts` y `isomorphic-exemption.test.ts`.
 *
 * Viven aquí y no en uno de los dos ficheros de test porque importar desde un `.test.ts`
 * volvería a ejecutar sus casos como efecto secundario.
 */

// `fileURLToPath` y no `new URL(...).pathname`: este último devuelve `/C:/...` en Windows y
// deja los caracteres percent-encoded, así que una ruta con espacios o tildes rompería el
// escaneo.
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Árboles que no pueden llegar al cliente (SPEC §7.1). */
export const PROTECTED_TREES = ['cms/core', 'cms/db', 'cms/auth', 'cms/security'] as const;

export type Verdict = 'protegido' | 'isomorfo' | 'desprotegido';

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

export function listTypeScriptFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listTypeScriptFiles(full);
    // Se excluyen los ficheros de test, incluidos los de tipos (`.test-d.ts`): M1 los pone
    // para la inferencia de cms.config.ts y no deben acabar exigiendo `server-only`.
    const esTest = /\.(test|test-d|spec)\.tsx?$/.test(entry);
    return /\.tsx?$/.test(entry) && !esTest ? [full] : [];
  });
}

/** Todos los módulos de los árboles protegidos. */
export function listProtectedModules(): string[] {
  return PROTECTED_TREES.flatMap((tree) => listTypeScriptFiles(join(REPO_ROOT, tree)));
}
