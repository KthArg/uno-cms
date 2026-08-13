/**
 * Constantes compartidas por los dos ficheros del par de aislamiento (T-41-2).
 *
 * Los ficheros `isolation-a.test.ts` e `isolation-b.test.ts` solo prueban algo **juntos**:
 * insertan la misma clave única y, sin limpieza entre ficheros, uno de los dos choca. Por
 * separado, cada uno pasa sin demostrar nada.
 *
 * Que la clave viva aquí y no duplicada en cada fichero no es cosmética: si alguien borra
 * uno de los dos, el otro deja de compilar por la importación huérfana en vez de quedarse
 * en verde probando el vacío.
 */
export const SHARED_ISOLATION_KEY = 'clave-compartida';
