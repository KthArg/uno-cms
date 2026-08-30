import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leerDestino } from '../humo/entorno';
import { sinComentarios } from '../support/codigo';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-207-1, T-207-2, T-207-3 y T-207-9: **las reglas de la suite de humo** (spec 09, issue #207).
 *
 * ## Por qué una suite de tests tiene tests
 *
 * Porque esta escribe en un sitio en línea con contenido que puede ser de alguien, y la regla
 * que la hace aceptable —«no toca nada que no haya creado ella»— estaba escrita en prosa, en un
 * comentario. Una regla en prosa dura hasta el siguiente que tenga prisa; y el que la rompa no
 * se va a enterar en su máquina, sino en el sitio de otro.
 *
 * Es la misma forma que T-J-2, que comprueba sobre todo el repositorio que ningún `postMessage`
 * usa `'*'` como destino.
 */

const HUMO = join(REPO_ROOT, 'tests', 'humo');
const CODIGO = sinComentarios(readFileSync(join(HUMO, 'humo.spec.ts'), 'utf8'));
const CONFIG = readFileSync(join(REPO_ROOT, 'playwright.humo.config.ts'), 'utf8');

describe('T-207-2 — sin destino, se salta y dice qué falta', () => {
  const COMPLETO = {
    HUMO_URL: 'https://uno-cms.vercel.app',
    HUMO_EMAIL: 'alguien@ejemplo.com',
    HUMO_PASSWORD: 'x',
  };

  it('con las tres variables, hay destino', () => {
    const lectura = leerDestino(COMPLETO);

    expect(lectura.hay).toBe(true);
    expect(lectura.hay && lectura.avisos).toEqual([]);
  });

  it('sin cada una, se salta nombrando la que falta', () => {
    for (const nombre of ['HUMO_URL', 'HUMO_EMAIL', 'HUMO_PASSWORD'] as const) {
      const lectura = leerDestino({ ...COMPLETO, [nombre]: undefined });

      expect(lectura.hay, nombre).toBe(false);
      // Que diga **cuál** falta, no «faltan variables». Quien lea esto está en otra máquina.
      expect(!lectura.hay && lectura.motivo, nombre).toContain(nombre);
    }
  });

  it('una variable vacía o en blanco cuenta como que falta', () => {
    // `export HUMO_PASSWORD=` deja la variable puesta y vacía. Sin esto, la suite intentaría
    // entrar con una contraseña vacía y el rojo sería «no se pudo entrar», que manda a mirar
    // al sitio equivocado.
    expect(leerDestino({ ...COMPLETO, HUMO_PASSWORD: '' }).hay).toBe(false);
    expect(leerDestino({ ...COMPLETO, HUMO_URL: '   ' }).hay).toBe(false);
  });

  it('la barra final no se cuela en las direcciones', () => {
    const lectura = leerDestino({ ...COMPLETO, HUMO_URL: 'https://uno-cms.vercel.app/' });

    expect(lectura.hay && lectura.destino.url).toBe('https://uno-cms.vercel.app');
  });
});

describe('T-207-3 — avisa si le apuntan a una dirección local', () => {
  it('lo dice, y dice por qué importa', () => {
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:3100', 'https://mac.local']) {
      const lectura = leerDestino({
        HUMO_URL: url,
        HUMO_EMAIL: 'a@b.c',
        HUMO_PASSWORD: 'x',
      });

      // Corre igualmente —depurar la propia suite es legítimo— pero nadie puede leer ese verde
      // como «el despliegue está probado», que es justo lo que #207 dice que no está.
      expect(lectura.hay, url).toBe(true);
      expect(lectura.hay && lectura.avisos.join(' '), url).toMatch(/NO está probando|local/);
    }
  });

  it('y un despliegue de verdad no genera avisos', () => {
    const lectura = leerDestino({
      HUMO_URL: 'https://uno-cms.vercel.app',
      HUMO_EMAIL: 'a@b.c',
      HUMO_PASSWORD: 'x',
    });

    expect(lectura.hay && lectura.avisos).toEqual([]);
  });
});

describe('T-207-1 — no arranca ningún servidor', () => {
  it('la configuración no tiene `webServer`', () => {
    // **Es el punto entero de esta suite.** Con un `webServer`, estaría probando otra vez el
    // camino local: imágenes al disco, Postgres a secas, ninguna CSP ejercida por un navegador.
    // Daría verde sin haber tocado lo que #207 dice que no cubre nada.
    expect(sinComentarios(CONFIG)).not.toContain('webServer');
  });

  it('y no hereda el `globalSetup` de la otra suite, que escribe en la base', () => {
    expect(sinComentarios(CONFIG)).not.toContain('globalSetup');
  });
});

describe('T-207-9 — no toca nada que no haya creado ella', () => {
  /**
   * Lo que **no** puede aparecer en el código de la suite, con el motivo de cada uno.
   *
   * Se mira el código sin comentarios: si no, este caso obligaría a no poder explicar en prosa
   * por qué la suite no publica, que es la parte que hace falta escribir.
   */
  const PROHIBIDO: readonly (readonly [string, string])[] = [
    ['Publicar', 'publicar es visible para quien visita la web'],
    ['publishAll', 'lo mismo, y de golpe'],
    ['Guardar', 'saveDraft sobre una sección real pisa el trabajo a medias de alguien'],
    ['Revertir', 'deshacer cambios de otro es destructivo y no tiene vuelta'],
    ['Desactivar', 'dejaría a alguien fuera de su propio panel'],
    ['/setup', 'crear la primera cuenta necesitaría el SETUP_TOKEN al alcance de la suite'],
  ];

  for (const [aguja, motivo] of PROHIBIDO) {
    it(`no usa «${aguja}»: ${motivo}`, () => {
      expect(CODIGO).not.toContain(aguja);
    });
  }

  it('lo único que borra lleva su propio nombre', () => {
    // Un `Eliminar` genérico sobre «la primera imagen» borraría la de alguien. La suite borra
    // por el nombre con el que ella sube, y ese nombre dice de dónde salió.
    expect(CODIGO).toContain('getByTitle(FICHERO.name');
    expect(CODIGO).toMatch(/FICHERO = \{ name: 'humo-/);
  });

  it('y comprueba que no queda nada suyo antes de terminar', () => {
    expect(CODIGO).toContain('borrarLasNuestras');
    // Contando hasta el número que había **antes**, no hasta cero: a cero borraría lo ajeno.
    expect(CODIGO).toMatch(/borrarLasNuestras\(page, antes\)/);
  });
});
