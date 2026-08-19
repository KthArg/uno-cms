import { expect, test } from '@playwright/test';

/**
 * T-82-3 y T-82-4: `GET /api/content/:key` (SPEC §5.3).
 *
 * En e2e y no en integración a propósito: lo que hay que comprobar es la **respuesta real**
 * que sale del servidor —incluidas las cabeceras de caché, que las pone Next— y que la ruta
 * es alcanzable **sin sesión**. Un test que llamara al manejador a mano pasaría igual si el
 * middleware la estuviera bloqueando o si el enrutado no la registrara.
 */

test('T-82-3: devuelve el contenido publicado con su Cache-Control', async ({ request }) => {
  const response = await request.get('/api/content/hero');

  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe(
    'public, s-maxage=60, stale-while-revalidate=300'
  );

  const body = (await response.json()) as { key: string; data: Record<string, unknown> };
  expect(body.key).toBe('hero');
  expect(body.data).toBeDefined();
});

test('T-82-3: una colección devuelve su lista', async ({ request }) => {
  const response = await request.get('/api/content/testimonials');

  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: unknown[] };
  expect(Array.isArray(body.items)).toBe(true);
});

test('T-82-4: la ruta no expone borradores', async ({ request }) => {
  // Es pública y sin sesión: filtrar un borrador aquí es publicar sin querer, y sin que nadie
  // pulse nada. La entrada `hero` que siembra el arranque tiene borrador y no tiene
  // publicado, así que lo que vuelva no puede traer nada de él.
  const response = await request.get('/api/content/hero');
  const body = (await response.json()) as { data: Record<string, unknown> };

  // Sin publicar, el contrato de ADR-404 es "vacíos y por defecto", nunca el borrador.
  expect(JSON.stringify(body)).not.toContain('draft');
  expect(body.data['title']).toBe('');
});

test('T-82-4: una clave que no está en cms.config.ts da 404', async ({ request }) => {
  // Sin esta comprobación, la ruta sería un lector genérico de `content_entries` — incluidos
  // los elementos de colección sin publicar, que existen como filas aunque no se vean.
  const response = await request.get('/api/content/inventada');

  expect(response.status()).toBe(404);
  // Y no se cachea: una respuesta de "no existe" guardada un minuto haría que una clave
  // recién añadida a la configuración pareciera seguir sin existir.
  expect(response.headers()['cache-control'] ?? '').not.toContain('s-maxage=60');
});

test('la ruta pública no exige sesión', async ({ request }) => {
  // Sin cookie de ningún tipo. Si el middleware la tratara como privada, esto sería un 307 a
  // la página de acceso.
  const response = await request.get('/api/content/hero', { headers: { cookie: '' } });

  expect(response.status()).toBe(200);
});
