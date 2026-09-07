import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-N-5: **cada test que cita el modelo de amenazas existe de verdad** (issue #120).
 *
 * ## El caso que sostiene a los demás
 *
 * `docs/SECURITY.md` cierra la tabla de `SPEC.md` §7.1 diciendo, para cada amenaza, qué test la
 * sostiene. Eso es lo que convierte el documento en algo comprobable en vez de una lista de
 * afirmaciones.
 *
 * Pero **un documento no se ejecuta**. Renombra un test, bórralo, o escríbelo mal al citarlo, y
 * la tabla sigue igual de convincente. Este test lee las citas y comprueba que cada una
 * corresponde a algo que existe en la suite.
 *
 * Lo que **no** comprueba, y conviene decirlo: que el test citado pruebe lo que la fila dice.
 * Eso no lo puede saber una máquina. Lo que impide es la clase de podredumbre que sí se puede
 * detectar — la cita que apunta a un test que ya no está.
 */

/** Los identificadores del proyecto: `T-59-4`, `T-D-2`, `T-N-1`… */
const CITA = /T-(?:\d+|[A-Z])-\d+/g;

function ficherosDeTest(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) return ficherosDeTest(ruta);
    return ['.ts', '.tsx'].includes(extname(entrada.name)) ? [ruta] : [];
  });
}

function leer(ruta: string): string {
  return readFileSync(ruta, 'utf8');
}

const SECURITY = leer(join(REPO_ROOT, 'docs', 'SECURITY.md'));

/** Todo lo que la suite contiene, en un solo texto: los identificadores se buscan aquí. */
const SUITE = ficherosDeTest(join(REPO_ROOT, 'tests'))
  .map((fichero) => leer(fichero))
  .join('\n');

describe('T-N-5 — el modelo de amenazas cita tests que existen', () => {
  it('cada identificador citado aparece en la suite', () => {
    const citados = [...new Set(SECURITY.match(CITA) ?? [])];

    const fantasmas = citados.filter((id) => !SUITE.includes(id));

    expect(
      fantasmas,
      'Estos identificadores están en docs/SECURITY.md y no existen en tests/.'
    ).toEqual([]);
  });

  it('y el documento cita bastantes, o esto no está comprobando nada', () => {
    // Verificación del propio test: si alguien reescribiera el documento sin citas, lo de
    // arriba pasaría en vacío y la tabla volvería a ser una lista de afirmaciones.
    const citados = new Set(SECURITY.match(CITA) ?? []);

    expect(citados.size).toBeGreaterThanOrEqual(10);
  });

  it('todas las amenazas de SPEC §7.1 están en el documento', () => {
    // La tabla de la spec tiene doce filas desde #233. Si alguien añade una amenaza a `SPEC.md` y no la
    // trae aquí, el modelo de amenazas quedaría incompleto **pareciendo completo**, que es
    // exactamente lo que este hito viene a impedir.
    const amenazas = [
      'Fuerza bruta en login',
      'XSS vía contenido',
      'CSRF',
      'Clickjacking',
      'Inyección SQL',
      'Escalada de privilegios',
      'Robo de sesión',
      'Abuso de uploads',
      'Enumeración',
      'Acceso por proveedor externo',
      'Secretos en cliente',
      'Dependencias',
    ];

    const ausentes = amenazas.filter((amenaza) => !SECURITY.includes(amenaza));

    expect(ausentes, 'Estas amenazas de SPEC §7.1 no están en docs/SECURITY.md.').toEqual([]);
  });
});
