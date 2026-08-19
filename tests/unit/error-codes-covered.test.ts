import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Punto 3 de la Definition of Done de M3: **todos los códigos de error del contrato están
 * ejercitados por al menos un test**.
 *
 * Este test lee ficheros, y como los otros de su clase conviene decir por qué en vez de
 * disimularlo: lo que comprueba no es comportamiento, es que no haya códigos declarados que
 * ningún caso llegue a producir. Un código sin test es una rama que nadie ha visto ejecutarse
 * — y en un contrato de errores eso significa que el panel podría recibirlo sin que nadie
 * haya comprobado nunca qué hace con él.
 *
 * Lo que **no** demuestra: que el código se devuelva en la situación correcta. Eso lo
 * demuestran los tests de cada action, uno por uno. Esto solo impide que se declare un código
 * y se olvide.
 */

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

function leerTodosLosTests(dir: string): string {
  let contenido = '';
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) contenido += leerTodosLosTests(ruta);
    else if (entrada.name.endsWith('.test.ts')) contenido += readFileSync(ruta, 'utf8');
  }
  return contenido;
}

describe('el contrato de errores está entero ejercitado', () => {
  it('cada ActionErrorCode aparece en al menos un test', () => {
    const fuente = readFileSync(join(RAIZ, 'cms/actions/pipeline.ts'), 'utf8');

    // Los códigos se leen del propio tipo, no de una lista repetida aquí: una lista a mano se
    // quedaría corta el día que alguien añada un código, que es justo el día que importa.
    const declaracion = fuente.slice(
      fuente.indexOf('export type ActionErrorCode'),
      fuente.indexOf(';', fuente.indexOf('export type ActionErrorCode'))
    );
    const codigos = [...declaracion.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);

    expect(codigos.length).toBeGreaterThan(5);

    const tests = leerTodosLosTests(join(RAIZ, 'tests'));
    const sinEjercitar = codigos.filter((codigo) => !tests.includes(`'${codigo}'`));

    expect(sinEjercitar, 'estos códigos de error no los produce ningún test').toEqual([]);
  });
});
