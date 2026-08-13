import { afterAll, beforeEach } from 'vitest';
import { closeDatabase, resetDatabase } from './db';
import { hasDatabase } from './env';

/**
 * T-41-2: cada test arranca con la base en estado conocido.
 *
 * Se aplica **a todos los ficheros de integración**, en vez de que cada uno declare su
 * propio `beforeEach(resetDatabase)`. La diferencia importa: un fichero nuevo que se olvide
 * de hacerlo no falla, hereda los datos del anterior. Ese fallo se manifiesta como un test
 * que pasa solo o falla según el orden de ejecución, y se diagnostica fatal.
 *
 * Los ganchos se registran solo si hay base de datos: sin ella, los tests están saltados y
 * un `beforeEach` que intentara conectarse rompería la ejecución en vez de saltarla.
 */
if (hasDatabase) {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });
}
