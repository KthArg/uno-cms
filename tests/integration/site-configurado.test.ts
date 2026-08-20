import { expect, it } from 'vitest';
import { readSiteConfigured } from '@/cms/core/settings';
import { getDb, settings, users } from '@/cms/db';
import { hashPassword } from '@/cms/auth/passwords';
import { describeIntegration } from './env';

/**
 * ADR-502: la landing pregunta si el sitio está configurado en vez de redirigir a `/setup`.
 *
 * Se prueba la lectura sin caché, que es la que decide. La versión cacheada es un envoltorio de
 * una línea sobre esta y no se puede ejecutar fuera de una petición de Next — misma separación
 * que `readContent`/`getContent` (ADR-405).
 */

describeIntegration('si el sitio está configurado', () => {
  it('sin usuarios y sin la marca, NO lo está', async () => {
    // Es el estado de un despliegue recién hecho. La landing enseña el camino a `/setup` en vez
    // de una página en blanco.
    expect(await readSiteConfigured()).toBe(false);
  });

  it('con la marca de bootstrap, lo está', async () => {
    await getDb()
      .insert(settings)
      .values({ key: 'setup_completed', value: { completedAt: new Date().toISOString() } });

    expect(await readSiteConfigured()).toBe(true);
  });

  it('con usuarios pero sin la marca, TAMBIÉN lo está', async () => {
    await getDb()
      .insert(users)
      .values({
        email: 'alguien@ejemplo.com',
        name: 'Alguien',
        passwordHash: await hashPassword('una-contrasena-larga-y-poco-comun'),
        role: 'admin',
      });

    // Una restauración parcial pudo dejar los usuarios sin la fila de `settings`. Decir que el
    // sitio no está configurado ahí sería ofrecerlo para que lo reclame otro, que es el peor de
    // los dos errores posibles. Mismo criterio que `cms/auth/setup.ts`.
    expect(await readSiteConfigured()).toBe(true);
  });
});
