import { describe, expect, it } from 'vitest';
import { usarAlmacenLocal } from '@/cms/security/almacen-local';

/**
 * T-A-1 … T-A-4: cuándo se guardan las imágenes en disco (spec 07 §5.1).
 *
 * ## Por qué esta condición tiene tests propios y no se comprueba de pasada
 *
 * Es la que hace aceptable todo el almacén local. Metida dentro del manejador de una ruta, se
 * acabaría comprobando de refilón en un test que va de otra cosa, junto con la sesión y el
 * tamaño y el tipo — y el día que alguien la tocara, el rojo saldría en un sitio que no habla
 * de ella.
 *
 * Entra el entorno, sale un booleano. Sin servidor, sin base de datos y sin ficheros.
 *
 * ## El que importa es T-A-2
 *
 * El disco de una función serverless es efímero y no se comparte entre instancias. Un almacén
 * en disco desplegado **no falla**: acepta el fichero, dice que todo fue bien y lo pierde. El
 * panel enseñaría "subida" y la landing un hueco semanas después, sin nada en ningún registro
 * que una las dos cosas.
 *
 * De los fallos posibles, ese es el peor, porque **se parece al éxito**.
 */

describe('cuándo se usa el almacén local', () => {
  it('T-A-1: con un almacén conectado, no', () => {
    expect(
      usarAlmacenLocal({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_algo', NODE_ENV: 'development' })
    ).toBe(false);
  });

  it('T-A-2: en producción, no — aunque no haya almacén conectado', () => {
    expect(usarAlmacenLocal({ NODE_ENV: 'production' })).toBe(false);

    // Y tampoco con la variable declarada y vacía, que es el caso de quien copió `.env.example`
    // y desplegó sin rellenarla. Ahí el almacén local sería la única cosa que "funciona", y es
    // exactamente donde no debe funcionar.
    expect(usarAlmacenLocal({ NODE_ENV: 'production', BLOB_READ_WRITE_TOKEN: '' })).toBe(false);
  });

  it('T-A-3: en desarrollo y sin almacén conectado, sí', () => {
    expect(usarAlmacenLocal({ NODE_ENV: 'development' })).toBe(true);
  });

  it('T-A-4: una variable vacía cuenta como que no hay almacén', () => {
    // Si contara como "hay token", el almacén local quedaría apagado y el de Vercel roto: lo
    // peor de los dos. Pasa al copiar `.env.example` sin rellenar.
    expect(usarAlmacenLocal({ NODE_ENV: 'development', BLOB_READ_WRITE_TOKEN: '' })).toBe(true);
    expect(usarAlmacenLocal({ NODE_ENV: 'development', BLOB_READ_WRITE_TOKEN: '   ' })).toBe(true);
  });

  it('en los tests tampoco se activa por accidente al mirar el entorno de verdad', () => {
    // Sin argumento lee `process.env`. Este test no fija su valor: solo comprueba que la
    // función es **pura respecto a lo que recibe** y no devuelve algo distinto según el humor
    // del entorno. Lo que se prueba arriba es la decisión; esto es que el argumento manda.
    expect(usarAlmacenLocal({})).toBe(true);
    expect(usarAlmacenLocal({ NODE_ENV: 'production' })).toBe(false);
  });
});
