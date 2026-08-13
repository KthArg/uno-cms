import { describe } from 'vitest';

/**
 * Los tests de integración corren contra un Postgres real (SPEC §11.4). En CI lo aporta el
 * servicio del workflow; en local, quien lo tenga levantado.
 *
 * Sin `DATABASE_URL` no se inventa una base de datos ni se simula: los tests se **saltan**
 * con un aviso visible. Un test de integración que pasa sin base de datos no es un test de
 * integración, y dar verde en ese caso es peor que no correrlo.
 */
export const databaseUrl = process.env['DATABASE_URL'];
export const hasDatabase = typeof databaseUrl === 'string' && databaseUrl.length > 0;

if (!hasDatabase) {
  console.warn(
    '\n[integration] DATABASE_URL no está definida: los tests de integración se saltan.\n' +
      '              Para ejecutarlos: DATABASE_URL=postgres://... pnpm test:integration\n'
  );
}

/** `describe` que se salta el bloque entero cuando no hay base de datos disponible. */
export const describeIntegration = hasDatabase ? describe : describe.skip;
