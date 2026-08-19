import { expect, test } from '@playwright/test';
import { dejarSinPublicar } from './support/db';

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
  // **El estado lo pone el propio test**, justo antes de mirarlo. La primera versión daba por
  // hecho que `hero` estaría sin publicar, y empezó a fallar en cuanto los tests del editor
  // publicaron algo: no porque expusiera un borrador, sino porque el mundo había cambiado.
  // Ordenar los tests con cuidado aguanta hasta el siguiente que se añade.
  dejarSinPublicar('seo', { title: 'BORRADOR-QUE-NO-DEBE-SALIR' });

  const response = await request.get('/api/content/seo');
  const body = (await response.json()) as { data: Record<string, unknown> };

  // Es pública y sin sesión: filtrar un borrador aquí es publicar sin querer, sin que nadie
  // pulse nada. Sin publicar, el contrato de ADR-404 es "vacíos y por defecto".
  expect(JSON.stringify(body)).not.toContain('BORRADOR-QUE-NO-DEBE-SALIR');
  expect(body.data['title']).toBeUndefined();
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
