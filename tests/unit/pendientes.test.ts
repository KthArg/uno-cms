import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **Nada aplazado se queda sin issue.**
 *
 * El problema que resuelve este test no es que se aplacen cosas —eso es sano y constante— sino
 * que lo aplazado se disuelva. Una limitación explicada dentro de una función es invisible
 * desde fuera; una decisión tomada en la revisión de un PR deja de existir en cuanto ese PR se
 * mergea. A los dos meses nadie recuerda que había algo que volver a mirar.
 *
 * Así que toda nota de algo aplazado tiene que citar un issue **en la misma línea**:
 *
 * ```ts
 * // PENDIENTE(#117): sin medir. La estructura de §8 se cumple, pero un presupuesto sin
 * // medición es una hipótesis.
 * ```
 *
 * Si no hay issue, es que la decisión no está tomada, y lo que falta no es un comentario: es
 * abrir el issue. El registro completo vive en `docs/PENDIENTES.md`.
 *
 * ## Lo que este test no hace, y es a propósito
 *
 * No comprueba que el issue **exista** ni que siga abierto: eso exigiría red desde la suite de
 * tests, que la volvería lenta y dependiente de GitHub. Lo que garantiza es que la nota
 * apunta a alguna parte, que es la diferencia entre una deuda registrada y una perdida.
 */

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

/** Dónde se busca. Se excluye `docs/`, que es prosa y tiene su propio registro. */
const DIRECTORIOS = ['cms', 'app', 'tests', 'components'];

/** Los ficheros sueltos de la raíz que también cuentan. */
const SUELTOS = ['middleware.ts', 'cms.config.ts', 'vitest.config.ts', 'playwright.config.ts'];

/**
 * Este mismo fichero queda fuera del barrido.
 *
 * Aquí los marcadores no son notas aplazadas: son su **definición**, y aparecen en la lista de
 * constantes y en los ejemplos de los tests. Sin excluirlo, el test se denuncia a sí mismo.
 *
 * El precio es que alguien podría esconder aquí una nota sin issue. Es un precio real y muy
 * pequeño: este fichero existe para vigilar deuda, y quien lo abra a esconder trabajo aplazado
 * está haciendo algo más raro que saltarse un test.
 */
const SE_EXCLUYE = 'tests/unit/pendientes.test.ts';

/**
 * Los marcadores que exigen issue.
 *
 * `PENDIENTE` es el nuestro; `TODO` y `FIXME` están porque son los que salen solos al escribir
 * deprisa, y son justo los que hay que interceptar.
 */
const MARCADORES = ['PENDIENTE', 'TODO', 'FIXME'];

interface Nota {
  readonly fichero: string;
  readonly linea: number;
  readonly texto: string;
  readonly marcador: string;
}

function ficheros(dir: string): string[] {
  let entradas: Dirent[];
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Un directorio que todavía no existe —`components/` hasta M5— no es un fallo.
    return [];
  }

  const salida: string[] = [];
  for (const entrada of entradas) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...ficheros(ruta));
    else if (['.ts', '.tsx'].includes(extname(entrada.name))) salida.push(ruta);
  }
  return salida;
}

/** Busca notas aplazadas y dice cuáles no citan un issue. */
export function notasSinIssue(fuente: string, fichero = ''): Nota[] {
  const sinIssue: Nota[] = [];

  fuente.split('\n').forEach((linea, indice) => {
    for (const marcador of MARCADORES) {
      // Se busca el marcador **como palabra suelta y en mayúsculas**, con letras y guiones
      // bajos excluidos a ambos lados. Sin lo primero, cualquier comentario que mencione
      // "todo el contenido" —que en español es constante— saldría marcado. Sin lo segundo,
      // una referencia al propio registro (`docs/PENDIENTES.md`) se denunciaría a sí misma;
      // lo encontró este test al estrenarse.
      //
      // **El guion bajo se añadió en #224**, cuando `AVISO_PENDIENTE` —una constante de
      // estilos— se denunció como trabajo aplazado. Un identificador en mayúsculas con
      // guiones bajos es lo normal en este código y no es una nota: una guarda que grita
      // donde no hay nada es la que se acaba desactivando, que es lo que la mataría.
      //
      // `MARCADORES` es una constante literal de este fichero, no entrada externa: no hay
      // inyección ni ReDoS que valgan aquí.
      // eslint-disable-next-line security/detect-non-literal-regexp
      const patron = new RegExp(`(^|[^A-Za-z_])${marcador}([^A-Za-z_]|$)`);
      if (!patron.test(linea)) continue;

      // El issue, en la misma línea. En otra se pierde al mover el comentario.
      if (/#\d+/.test(linea)) continue;

      sinIssue.push({
        fichero,
        linea: indice + 1,
        texto: linea.trim(),
        marcador,
      });
    }
  });

  return sinIssue;
}

describe('nada aplazado se queda sin issue', () => {
  it('toda nota de algo pendiente cita un issue en su línea', () => {
    const rutas = [
      ...DIRECTORIOS.flatMap((dir) => ficheros(join(RAIZ, dir))),
      ...SUELTOS.map((nombre) => join(RAIZ, nombre)),
    ];

    const hallazgos: Nota[] = [];
    for (const ruta of rutas) {
      let fuente: string;
      try {
        fuente = readFileSync(ruta, 'utf8');
      } catch {
        continue;
      }
      // `split`/`join` y no una expresión regular: en Windows la ruta llega con barras invertidas
      // y aquí solo hace falta normalizarlas.
      const relativa = relative(RAIZ, ruta).split('\\').join('/');
      if (relativa === SE_EXCLUYE) continue;

      hallazgos.push(...notasSinIssue(fuente, relativa));
    }

    const detalle = hallazgos
      .map((nota) => `${nota.fichero}:${String(nota.linea)} — ${nota.texto}`)
      .join('\n');

    expect(
      hallazgos,
      `hay notas de trabajo aplazado sin issue al que apuntar.\n` +
        `Abre el issue y cítalo en la misma línea: // PENDIENTE(#123): …\n\n${detalle}`
    ).toEqual([]);
  });

  it('el detector encuentra una nota sin issue', () => {
    // Verificación del propio test: sin esto, un fallo en la detección daría verde para
    // siempre y el registro se quedaría atrás sin que nadie lo notara.
    const sinIssue = notasSinIssue('// TODO: arreglar esto algún día\n');

    expect(sinIssue).toHaveLength(1);
    expect(sinIssue[0]?.marcador).toBe('TODO');
  });

  it('el detector acepta una nota que sí cita su issue', () => {
    const conIssue = notasSinIssue('// PENDIENTE(#117): sin medir todavía.\n');

    expect(conIssue).toEqual([]);
  });

  it('el detector no marca la palabra «todo» del español', () => {
    // Es la falsa alarma que mataría el test: en este proyecto los comentarios están en
    // español y "todo el contenido", "todo-o-nada" y "sobre todo" aparecen por todas partes.
    const prosa = [
      '// Publica todo el contenido pendiente.',
      '// Es todo-o-nada por entrada (ADR-401).',
      '// Sobre todo, no perder el trabajo del editor.',
    ].join('\n');

    expect(notasSinIssue(prosa)).toEqual([]);
  });

  it('el detector no marca un identificador que lleva el marcador dentro', () => {
    // La otra falsa alarma, y esta ya pasó: `AVISO_PENDIENTE` es una constante de estilos del
    // panel y el detector la denunció como trabajo aplazado (#224). El nombre es correcto
    // —«pendiente» es el estado de una sección con cambios sin publicar— así que lo que
    // estaba mal era la detección.
    const codigo = [
      'const AVISO_PENDIENTE = "…";',
      '<div className={AVISO_PENDIENTE} />',
      'const TODO_LO_DEMAS = 1;',
    ].join('\n');

    expect(notasSinIssue(codigo)).toEqual([]);
  });

  it('y sigue encontrando la nota de verdad al lado del identificador', () => {
    // **Este es el caso que impide que el arreglo de arriba se pase de frenada.** Si alguien
    // ampliara la exclusión hasta apagar la detección, los tres casos anteriores seguirían en
    // verde: son todos negativos. Este es el positivo que tiene que sobrevivir.
    const mezcla = 'const AVISO_PENDIENTE = "x"; // PENDIENTE: falta medirlo';

    expect(notasSinIssue(mezcla)).toHaveLength(1);
  });
});
