import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sinComentarios } from '../support/codigo';
import { listTypeScriptFiles, REPO_ROOT } from '../support/module-boundary';

/**
 * T-J-2: **ningún `postMessage` del proyecto usa `'*'` como destino** (SPEC §6.2).
 *
 * Con `'*'`, el navegador entrega el mensaje a quien sea que haya en la ventana de destino. Hoy
 * las dos ventanas son nuestras; el día que un redirect, un error o un `src` mal construido
 * lleven a otro sitio, el contenido sin publicar de quien edita se manda a un tercero **sin que
 * nada falle** — ni una excepción, ni un aviso, ni un test en rojo.
 *
 * Por eso esto es un test estructural sobre el repositorio y no una comprobación dentro de un
 * componente: lo que hay que impedir no es que este `postMessage` esté mal, sino que lo esté el
 * **próximo**.
 */

const ARBOLES = ['cms', 'app', 'components'];

function ficheros(): string[] {
  return ARBOLES.flatMap((arbol) => listTypeScriptFiles(join(REPO_ROOT, arbol)));
}

/** `postMessage(loQueSea, '*')`, con cualquiera de las dos comillas. */
const A_CUALQUIERA = /postMessage\([\s\S]*?,\s*['"]\*['"]\s*\)/;

describe('T-J-2 — postMessage siempre con origen explícito', () => {
  it('nadie manda a `*`', () => {
    const culpables = ficheros()
      .filter((fichero) => A_CUALQUIERA.test(sinComentarios(readFileSync(fichero, 'utf8'))))
      .map((fichero) => fichero.replace(REPO_ROOT, ''));

    expect(culpables, 'Usa window.location.origin en vez de "*".').toEqual([]);
  });

  it('y hay al menos un postMessage que revisar', () => {
    // Verificación del propio test: si algún día no quedara ninguno, lo de arriba pasaría en
    // vacío dando una sensación de cobertura que no existe.
    const conMensajes = ficheros().filter((fichero) =>
      sinComentarios(readFileSync(fichero, 'utf8')).includes('postMessage(')
    );

    expect(conMensajes.length).toBeGreaterThan(0);
  });
});
