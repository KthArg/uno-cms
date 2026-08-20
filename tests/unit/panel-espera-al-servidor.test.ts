import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * **Toda espera al servidor en el panel va dentro de un `try`.**
 *
 * ## El fallo que este test existe para impedir
 *
 * Las pantallas hacían `setOcupado(true)`, esperaban a una action y bajaban la bandera después.
 * Si la llamada **lanza** en vez de responder —red caída, un 500, un despliegue a mitad de la
 * petición— el `await` propaga, el manejador muere ahí y la bandera **nunca vuelve a bajar**: el
 * botón se queda deshabilitado diciendo "Guardando…" para siempre, sin un solo mensaje.
 *
 * Estaba en seis pantallas y en el autoguardado, donde era peor todavía: el indicador que existe
 * justo para decir si lo escrito está a salvo se quedaba mintiendo.
 *
 * ## Por qué un test y no la memoria
 *
 * **Ninguna suite lo detectaba, y no por descuido: la condición no existe en local ni en CI.**
 * La red no se cae, el servidor no devuelve 500, el despliegue no cambia a mitad. Solo pasa en
 * producción, con alguien delante.
 *
 * Así que lo que se comprueba aquí no es que el código de hoy esté bien —eso ya lo comprueban
 * los tests de `fallo-de-red.test.tsx`— sino que **el próximo `await` que alguien escriba** no
 * repita el patrón. Lo encontré con este mismo escaneo, a mano, y me pareció mejor dejarlo
 * puesto que apuntarlo.
 */

const PANEL = join(REPO_ROOT, 'cms', 'ui');

/**
 * Las esperas que **sí** pueden estar fuera de un `try`, con su motivo.
 *
 * Que haya que escribir el motivo es parte del diseño: una lista de excepciones sin explicación
 * crece hasta vaciar el test de sentido.
 */
const EXCEPCIONES: { readonly fichero: string; readonly motivo: string }[] = [
  {
    fichero: 'cms/ui/EntryForm.tsx',
    motivo:
      'Es el `import()` perezoso de Tiptap dentro de `dynamic`, no una llamada al servidor. Un fallo al cargar el trozo lo gestiona Next, y envolverlo aquí no daría ninguna forma de recuperarse.',
  },
  {
    fichero: 'cms/ui/PublishAllButton.tsx',
    motivo:
      'El `await action()` vive en `encadenar`, que se llama **desde dentro** del `try` de `publicarTodo`. La protección está, pero no léxicamente: este escaneo mira la forma, no el camino de llamada.',
  },
];

function ficherosDelPanel(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) return ficherosDelPanel(ruta);
    return ['.ts', '.tsx'].includes(extname(entrada.name)) ? [ruta] : [];
  });
}

/** Si el nodo está dentro del bloque `try` de algún `try/catch` que lo envuelva. */
function dentroDeUnTry(nodo: ts.Node): boolean {
  let actual: ts.Node | undefined = nodo.parent;

  while (actual !== undefined) {
    if (
      ts.isTryStatement(actual) &&
      actual.tryBlock.pos <= nodo.pos &&
      nodo.end <= actual.tryBlock.end
    ) {
      return true;
    }
    actual = actual.parent;
  }

  return false;
}

function esperasSinProteger(fichero: string): number {
  const fuente = ts.createSourceFile(
    fichero,
    readFileSync(fichero, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX
  );

  let cuenta = 0;

  function visitar(nodo: ts.Node): void {
    if (ts.isAwaitExpression(nodo) && !dentroDeUnTry(nodo)) cuenta += 1;
    ts.forEachChild(nodo, visitar);
  }

  visitar(fuente);
  return cuenta;
}

const FICHEROS = ficherosDelPanel(PANEL);

describe('el panel no se queda esperando al servidor', () => {
  it('se están escaneando ficheros de verdad', () => {
    // Verificación del propio test: si el directorio cambiara de sitio, todo lo de abajo pasaría
    // sin mirar nada.
    expect(FICHEROS.length).toBeGreaterThanOrEqual(10);
  });

  it('ningún `await` queda fuera de un `try`, salvo los declarados', () => {
    const exceptuados = new Set(EXCEPCIONES.map((e) => e.fichero));

    const culpables = FICHEROS.map((fichero) => ({
      fichero: relative(REPO_ROOT, fichero).replace(/\\/g, '/'),
      sinProteger: esperasSinProteger(fichero),
    }))
      .filter((r) => r.sinProteger > 0 && !exceptuados.has(r.fichero))
      .map((r) => `${r.fichero} (${String(r.sinProteger)})`);

    expect(
      culpables,
      'Una llamada al servidor sin `try` deja la pantalla bloqueada si la red se cae. ' +
        'Envuélvela y enseña FALLO_DE_RED, o declárala en EXCEPCIONES con su motivo.'
    ).toEqual([]);
  });

  it('cada excepción sigue haciendo falta y explica por qué', () => {
    for (const excepcion of EXCEPCIONES) {
      const ruta = join(REPO_ROOT, excepcion.fichero);

      // Si alguien arregla una excepción, la lista tiene que encogerse: una exención que ya no
      // corresponde a nada es permiso escrito para reintroducir el fallo.
      expect(
        esperasSinProteger(ruta),
        `${excepcion.fichero} ya no necesita su exención`
      ).toBeGreaterThan(0);

      expect(excepcion.motivo.length).toBeGreaterThan(60);
    }
  });
});
