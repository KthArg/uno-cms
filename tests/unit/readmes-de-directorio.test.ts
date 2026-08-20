import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * Cada directorio de código explica qué hay dentro, y **no promete un futuro que ya llegó**.
 *
 * ## De dónde sale este test
 *
 * Al cerrar el MVP, los quince README de directorio seguían diciendo "se llena en **M3**", "se
 * llena en **M5**"… Todos estaban llenos. Quien abriera `cms/core/` habría leído que ese
 * directorio estaba vacío mientras miraba nueve ficheros.
 *
 * Nadie lo había notado en seis hitos, porque un README desfasado no rompe nada: solo miente a
 * quien llega después, que es exactamente la clase de fallo que este proyecto persigue en el
 * código y no estaba persiguiendo en la documentación.
 *
 * ## Lo que comprueba y lo que no
 *
 * Que **exista** y que **no anuncie trabajo futuro por hito**. No puede comprobar que lo que
 * dice sea verdad — eso es prosa sobre código y no hay forma de verificarla automáticamente.
 *
 * Lo cual no lo hace inútil: la forma en que estos ficheros se pudren no es volviéndose falsos
 * de golpe, es quedándose anclados en el momento en que se escribieron.
 */

/** Los árboles donde cada directorio con código debe explicarse. */
const ARBOLES = ['cms', 'components'];

/** Frases que anuncian trabajo que ya no está por venir. */
const PROMESAS = [/[Ss]e llena(n)? en \*\*M\d/, /[Ee]stado: esqueleto/, /[Ee]stado: parcial/];

function directoriosConCodigo(raiz: string): string[] {
  const salida: string[] = [];

  function recorrer(dir: string): void {
    const entradas = readdirSync(dir, { withFileTypes: true });

    // Un directorio "con código" es el que tiene al menos un `.ts`/`.tsx` propio. Los que solo
    // agrupan otros no necesitan explicarse: lo hacen sus hijos.
    if (entradas.some((e) => e.isFile() && /\.tsx?$/.test(e.name))) salida.push(dir);

    for (const entrada of entradas) {
      if (entrada.isDirectory()) recorrer(join(dir, entrada.name));
    }
  }

  recorrer(raiz);
  return salida;
}

const DIRECTORIOS = ARBOLES.flatMap((arbol) => directoriosConCodigo(join(REPO_ROOT, arbol)));

describe('los README de directorio', () => {
  it('se están enumerando directorios de verdad', () => {
    // Verificación del propio test: si la estructura cambiara y esto devolviera una lista vacía,
    // todo lo de abajo pasaría sin comprobar nada.
    expect(DIRECTORIOS.length).toBeGreaterThanOrEqual(6);
  });

  it('cada directorio con código tiene el suyo', () => {
    const sinReadme = DIRECTORIOS.filter((dir) => !existsSync(join(dir, 'README.md'))).map((dir) =>
      relative(REPO_ROOT, dir).replace(/\\/g, '/')
    );

    expect(sinReadme, 'Estos directorios no explican qué hay dentro.').toEqual([]);
  });

  it('ninguno promete un hito que ya pasó', () => {
    const desfasados = DIRECTORIOS.filter((dir) => {
      const readme = join(dir, 'README.md');
      if (!existsSync(readme)) return false;

      const texto = readFileSync(readme, 'utf8');
      return PROMESAS.some((promesa) => promesa.test(texto));
    }).map((dir) => relative(REPO_ROOT, dir).replace(/\\/g, '/'));

    expect(
      desfasados,
      'Estos README anuncian trabajo futuro. Los seis hitos están cerrados: describe lo que hay.'
    ).toEqual([]);
  });
});
