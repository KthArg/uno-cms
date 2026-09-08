import { describe, expect, it } from 'vitest';
import {
  AVISO_SIN_ALMACEN,
  compararMedios,
  informe,
  pathnamesDelAlmacen,
} from '@/scripts/medios-huerfanos.mjs';

/**
 * T-206-1 a T-206-4: **la reconciliación del almacén con la tabla `media`** (issue #206, ADR-705).
 *
 * ## Qué se comprueba aquí y qué en integración
 *
 * Aquí, la comparación y el caso de «no hay almacén», que son pura lógica. Contra Postgres real, en
 * `tests/integration/medios-huerfanos.test.ts`, que la lectura de la base devuelve lo que hay.
 *
 * La comparación se separó de la lectura precisamente para que se pudiera probar así: es la parte
 * donde está la decisión, y encerrarla dentro del script la habría dejado sin probar.
 */

describe('T-206-1 y T-206-2 — se detecta lo que sobra por cada lado', () => {
  it('T-206-1: un objeto en el almacén sin fila se detecta', () => {
    const { sinFila, sinFichero } = compararMedios(['a.png', 'huerfano.png'], ['a.png']);

    expect(sinFila).toEqual(['huerfano.png']);
    expect(sinFichero).toEqual([]);
  });

  it('T-206-2: una fila sin objeto en el almacén, también', () => {
    // El caso simétrico, y hoy tampoco se veía: la biblioteca la enseña y no se puede abrir.
    const { sinFila, sinFichero } = compararMedios(['a.png'], ['a.png', 'perdida.png']);

    expect(sinFila).toEqual([]);
    expect(sinFichero).toEqual(['perdida.png']);
  });

  it('los dos a la vez, que es como se ve un almacén de verdad', () => {
    const { sinFila, sinFichero } = compararMedios(
      ['comun.png', 'solo-almacen.png'],
      ['comun.png', 'solo-base.png']
    );

    expect(sinFila).toEqual(['solo-almacen.png']);
    expect(sinFichero).toEqual(['solo-base.png']);
  });

  it('compara conjuntos, no cuenta', () => {
    /*
     * La comprobación que separa esto de un contador. Dos listas del **mismo tamaño** y distinto
     * contenido: si la comparación fuera por número, aquí no saldría nada y el script diría que
     * todo cuadra teniendo un huérfano por cada lado.
     */
    const { sinFila, sinFichero } = compararMedios(['a.png'], ['b.png']);

    expect(sinFila).toEqual(['a.png']);
    expect(sinFichero).toEqual(['b.png']);
  });
});

describe('T-206-3 — no toca nada, y decirlo dos veces da lo mismo', () => {
  it('el resultado no depende de cuántas veces se pregunte', () => {
    // La idempotencia sale gratis porque no hay efecto: `compararMedios` es una función pura. El
    // caso existe para que eso siga siendo verdad el día que alguien le añada un borrado.
    const almacen = ['a.png', 'b.png'];
    const base = ['a.png', 'c.png'];

    expect(compararMedios(almacen, base)).toEqual(compararMedios(almacen, base));
    // Y los datos de entrada siguen intactos: nada se consumió por el camino.
    expect(almacen).toEqual(['a.png', 'b.png']);
    expect(base).toEqual(['a.png', 'c.png']);
  });

  it('cuando todo cuadra, lo dice y no propone nada', () => {
    const texto = informe(compararMedios(['a.png'], ['a.png']));

    expect(texto).toContain('Todo cuadra');
    expect(texto).not.toContain('Bórral');
  });

  it('y cuando no cuadra, avisa de que no ha tocado nada', () => {
    // Es la mitad que hace útil el informe: quien lo lee tiene que saber que sigue habiendo que
    // decidir. Un informe que enumera problemas sin decir eso se lee como si ya estuvieran
    // resueltos.
    const texto = informe(compararMedios(['huerfano.png'], []));

    expect(texto).toContain('huerfano.png');
    expect(texto).toContain('no ha tocado nada');
  });
});

describe('T-206-4 — sin almacén no concluye nada, y no se cae', () => {
  it('sin token y sin directorio, devuelve `null` y no una lista vacía', async () => {
    /*
     * La diferencia es todo el caso. Una lista vacía diría que el almacén está vacío y **todas**
     * las filas saldrían como huérfanas — un informe alarmante y completamente falso, que es peor
     * que no tener informe.
     */
    const original = process.cwd();

    try {
      // Un directorio sin `.uploads/`: el del sistema sirve y no hace falta crear nada.
      process.chdir(process.env['TEMP'] ?? process.env['TMPDIR'] ?? '/tmp');
      expect(await pathnamesDelAlmacen({})).toBeNull();
    } finally {
      process.chdir(original);
    }
  });

  it('y hay un aviso que lo explica en vez de un error', () => {
    expect(AVISO_SIN_ALMACEN).toContain('no hay almacén');
    // En local es el estado normal, y el aviso tiene que decirlo o parecerá que algo falla.
    expect(AVISO_SIN_ALMACEN).toContain('lo normal');
  });
});
