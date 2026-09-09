import { expect, test } from '@playwright/test';
import { ejecutarSql } from './support/db';

/**
 * T-A-30 … T-A-32: `GET /api/settings` (spec 16 §5.7, issue #284).
 *
 * En e2e y no en integración por lo mismo que `/api/content/:key`: lo que hay que comprobar es la
 * **respuesta real** que sale del servidor —cabeceras incluidas— y que la ruta es alcanzable sin
 * sesión. Un test que llamara al manejador a mano pasaría igual si el middleware la estuviera
 * bloqueando o si el enrutado no la registrara.
 */

test('T-A-30: devuelve site y seo con sus valores efectivos', async ({ request }) => {
  ejecutarSql(
    `insert into settings (key, value) values ('site', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify({ siteName: 'La web de las pruebas' })]
  );

  const response = await request.get('/api/settings');

  expect(response.status()).toBe(200);
  const body = (await response.json()) as { site: Record<string, unknown>; seo: unknown };

  expect(body.site['siteName']).toBe('La web de las pruebas');
  // `seo` sale aunque no se haya guardado nunca: sus campos son opcionales y el contrato es
  // «los valores efectivos», no «lo que haya en la tabla».
  expect(body.seo).toBeDefined();
});

test('T-A-31: NUNCA devuelve setup_completed', async ({ request }) => {
  // **El estado lo pone el test justo antes de mirarlo.** Sin esta fila, la ausencia de
  // `setup_completed` en la respuesta no probaría nada: podría estar ausente porque nadie la
  // escribió nunca. Es la lección de T-82-4, que empezó a fallar el día que otro test publicó.
  ejecutarSql(
    `insert into settings (key, value) values ('setup_completed', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify({ completed: true, marcaDeEsteTest: 'NO-DEBE-SALIR' })]
  );

  const response = await request.get('/api/settings');
  const crudo = await response.text();

  // Ese ajuste dice si el bootstrap sigue abierto, y `/setup` responde 404 después de
  // completarse **precisamente para no decirlo**. Sacarlo por aquí anularía esa protección
  // desde la ruta de al lado.
  expect(crudo).not.toContain('setup_completed');
  expect(crudo).not.toContain('NO-DEBE-SALIR');

  // Y las claves son exactamente dos, no «las que hubiera menos una»: así, la siguiente clave
  // que alguien añada a la tabla tampoco sale.
  expect(Object.keys((await response.json()) as object).sort()).toEqual(['seo', 'site']);
});

test('T-A-32: sigue sin cabeceras CORS, igual que /api/content/:key', async ({ request }) => {
  const response = await request.get('/api/settings', {
    headers: { origin: 'https://cualquiera.example' },
  });

  // No se le añaden y es deliberado: se pide desde el servidor de la otra web, no desde el
  // navegador de quien la visita. Es el mismo criterio que T-R-14.
  expect(response.headers()['access-control-allow-origin']).toBeUndefined();
});

test('lleva la misma cabecera de caché que la ruta de contenido', async ({ request }) => {
  const settings = await request.get('/api/settings');
  const contenido = await request.get('/api/content/hero');

  expect(settings.headers()['cache-control']).toBe(contenido.headers()['cache-control']);
});

test('es pública: no exige sesión', async ({ request }) => {
  const response = await request.get('/api/settings', { headers: { cookie: '' } });

  expect(response.status()).toBe(200);
});
