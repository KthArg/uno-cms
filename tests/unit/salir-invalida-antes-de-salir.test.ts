import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sinComentarios } from '../support/codigo';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-249-2: **salir invalida la sesión antes de borrar la cookie** (issue #249, ADR-910).
 *
 * ## Por qué el orden es el arreglo
 *
 * `signOut` borra la cookie, y cualquier petición en vuelo puede devolverla a su sitio: cada
 * lectura de sesión de Auth.js la reemite. Lo que hace que esa cookie resucitada no valga es que
 * `password_version` ya haya subido.
 *
 * Con las dos llamadas al revés queda una ventana entre el borrado y la subida de versión: una
 * petición que se cuele ahí resucita la cookie **y** pasa la comprobación de versión, porque
 * todavía no ha cambiado. Vuelve el fallo, más raro y por tanto peor.
 *
 * ## Lo que este caso hace, y lo que no
 *
 * Lee el fichero y comprueba el orden. Es análisis de texto, como la guarda de `api-routes.ts`, y
 * tiene su misma limitación: detecta que las llamadas estén y en qué orden, no que el
 * comportamiento sea correcto.
 *
 * Existe porque el caso de e2e **no cubre esto**: T-249-1 vuelve a poner la cookie mucho después
 * de salir, así que pasa en verde con las dos líneas intercambiadas. Comprobado, no supuesto —
 * es lo que lo convierte en un hueco y no en una redundancia.
 *
 * Un caso que sí lo cubriera tendría que colar una petición exactamente entre las dos llamadas, y
 * eso no se puede hacer sin abrir una costura en el código solo para el test — que es lo que este
 * repositorio ya rechazó para la concurrencia del canje de invitación.
 *
 * Así que es una guarda floja **declarada como floja**, y aun así es la diferencia entre que
 * reordenar esas dos líneas se note y que no se note.
 */

const LAYOUT = sinComentarios(
  readFileSync(join(REPO_ROOT, 'app', 'admin', '(panel)', 'layout.tsx'), 'utf8')
);

describe('T-249-2 — el orden de las dos llamadas al salir', () => {
  it('las dos están', () => {
    // Si alguna faltara, el caso de abajo compararía posiciones inventadas y pasaría en vacío.
    expect(LAYOUT).toContain('invalidateSessions(');
    expect(LAYOUT).toContain('signOut(');
  });

  it('invalidar va antes de borrar la cookie', () => {
    const invalida = LAYOUT.indexOf('invalidateSessions(');
    const borra = LAYOUT.indexOf('signOut(');

    expect(
      invalida,
      'salir borra la cookie antes de subir `password_version`, y eso deja la ventana que ' +
        'ADR-910 cierra: una petición que se cuele entre las dos resucita la sesión y pasa la ' +
        'comprobación de versión'
    ).toBeLessThan(borra);
  });
});
