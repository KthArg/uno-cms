import { expect, it } from 'vitest';
import { databaseUrl, describeIntegration } from './env';

/**
 * Verifica el propio harness de integración, no la aplicación: que cuando CI dice que hay
 * Postgres, hay de verdad una URL utilizable. Si esto falla, cualquier test de integración
 * posterior fallaría por la razón equivocada.
 */
describeIntegration('harness de integración', () => {
  it('recibe una DATABASE_URL de Postgres bien formada', () => {
    expect(databaseUrl).toBeDefined();

    const url = new URL(databaseUrl as string);
    expect(['postgres:', 'postgresql:']).toContain(url.protocol);
    expect(url.hostname).not.toBe('');
    expect(url.pathname.replace(/^\//, '')).not.toBe('');
  });
});
