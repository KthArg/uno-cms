import { describe, expect, it } from 'vitest';
import {
  analizarFrontera,
  esDeCliente,
  funcionesEnLinea,
  leerImportaciones,
  leerReexportaciones,
  pareceComponente,
} from '../support/client-server-boundary';

/**
 * Issue #125: **la frontera servidor → cliente, que hasta ahora no vigilaba nadie.**
 *
 * `server-only` impide que el cliente importe código de servidor, y hay tests que lo sostienen
 * desde M0. La de vuelta ha fallado **dos veces en M4**, las dos con `typecheck`, `lint` y
 * `build` en verde y la página reventando en tiempo de ejecución.
 *
 * Dos veces en un hito no es mala suerte: es una superficie sin vigilancia. Y lo único que la
 * vigilaba era que un e2e pasara por esa línea concreta, lo cual con el panel va a ser siempre
 * parcial — el segundo fallo sobrevivió a la revisión de su PR porque su rama solo se ejecuta
 * cuando `publishAll` devuelve fallos.
 *
 * Los tres bloques de abajo hacen cosas distintas: el primero vigila el repositorio, el
 * segundo comprueba que el detector detecta, y el tercero que no marca lo que sí es correcto —
 * que es lo que decide si un test así sobrevive o acaba desactivado.
 */

describe('#125 — el servidor no usa código de cliente', () => {
  it('el repositorio está limpio', () => {
    const hallazgos = analizarFrontera();

    const detalle = hallazgos
      .map((h) => `${h.fichero}:${String(h.linea)} [${h.regla}] ${h.detalle}`)
      .join('\n');

    expect(hallazgos, `frontera servidor/cliente cruzada:\n${detalle}`).toEqual([]);
  });
});

describe('el detector detecta', () => {
  it('reconoce un módulo de cliente aunque lleve comentarios encima', () => {
    // La cabecera real de estos ficheros lleva un bloque de documentación antes de la
    // directiva en algunos casos, y mirar solo la primera línea los daría por de servidor.
    expect(esDeCliente("'use client';\n\nimport x from 'y';")).toBe(true);
    expect(esDeCliente("// un comentario\n'use client';\n")).toBe(true);
    expect(esDeCliente("import x from 'y';\n")).toBe(false);
  });

  it('distingue un componente de una función y de una constante', () => {
    // El criterio lo impone React: JSX trata las minúsculas como etiquetas HTML, así que un
    // componente **tiene** que ir en PascalCase.
    expect(pareceComponente('PublishAllButton')).toBe(true);
    expect(pareceComponente('EntryForm')).toBe(true);

    // El fallo del PR #124 tenía este nombre.
    expect(pareceComponente('motivoLegible')).toBe(false);

    // Y una constante a gritos no es un componente aunque empiece por mayúscula: lo que
    // llegaría al servidor tampoco sería su valor.
    expect(pareceComponente('SETTINGS_TAG')).toBe(false);
    expect(pareceComponente('MAX_REVISIONS')).toBe(false);
  });

  it('lee los nombres de un import, incluidos los renombrados y los de varias líneas', () => {
    const [importacion] = leerImportaciones(
      "import {\n  PublishAllButton,\n  motivoLegible as motivo,\n  type PublishAllResult,\n} from './x';"
    );

    expect(importacion?.nombres).toEqual(['PublishAllButton', 'motivo']);
    // El `type` de dentro de las llaves se borra al compilar: no cruza ninguna frontera.
    expect(importacion?.nombres).not.toContain('PublishAllResult');
  });

  it('ignora un import de solo tipos, que no existe en tiempo de ejecución', () => {
    const [importacion] = leerImportaciones("import type { Algo } from './x';");

    expect(importacion?.soloTipos).toBe(true);
  });

  it('encuentra una función escrita al vuelo en una propiedad JSX', () => {
    // Es la forma exacta del fallo del PR #108.
    const hallazgos = funcionesEnLinea('<PublishAllButton action={() => publicarTodo()} />');

    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]?.detalle).toContain('action');
  });
});

describe('las dos formas de saltarse la regla 1', () => {
  it('un import de espacio de nombres se marca siempre', () => {
    // No hay nombres que juzgar, y no hay forma legítima de hacerlo: aunque solo se usaran
    // componentes, se estaría trayendo el módulo entero al servidor.
    const [importacion] = leerImportaciones("import * as Botones from './PublishAllButton';");

    expect(importacion?.espacioDeNombres).toBe(true);
  });

  it('una reexportación se lee igual que un import', () => {
    // Es el hueco que este módulo tenía **escrito en su propia documentación**: un fichero sin
    // marca de cliente que reexporta una función de cliente lava el origen, y cualquier página
    // de servidor la importa de él sin que nada lo vea.
    const [reexport] = leerReexportaciones("export { motivoLegible } from './PublishAllButton';");

    expect(reexport?.nombres).toEqual(['motivoLegible']);
    expect(reexport?.especificador).toBe('./PublishAllButton');
  });

  it('un export local no cuenta como reexportación', () => {
    // `export { x }` sin `from` no trae nada de ningún otro módulo.
    expect(leerReexportaciones('export { algo };')).toEqual([]);
  });

  it('una reexportación de solo tipos se ignora', () => {
    const [reexport] = leerReexportaciones("export type { Algo } from './x';");

    expect(reexport?.soloTipos).toBe(true);
  });
});

describe('el detector no marca lo que es correcto', () => {
  it('una Server Action escrita en línea sí vale', () => {
    // Lleva la marca dentro, así que Next sí puede serializarla. Marcarla sería la falsa
    // alarma que acaba con el test desactivado.
    const valida = [
      '<form action={async () => {',
      "  'use server';",
      '  await hacerAlgo();',
      '}}>',
    ].join('\n');

    expect(funcionesEnLinea(valida)).toEqual([]);
  });

  it('pasar una Server Action por su nombre vale', () => {
    // Es justo el arreglo del PR #108: la función declarada con su marca y pasada por
    // referencia, en vez de envuelta en una flecha.
    expect(funcionesEnLinea('<PublishAllButton action={publicarTodo} />')).toEqual([]);
  });

  it('importar un componente de un módulo de cliente vale', () => {
    // Es lo normal y lo correcto: un componente de cliente se renderiza desde el servidor.
    // Si esto se marcara, el test sería inservible desde el primer día.
    expect(pareceComponente('EntryEditor')).toBe(true);
  });
});
