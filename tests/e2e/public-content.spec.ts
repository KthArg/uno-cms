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

/**
 * T-A-28 y T-A-29: el `?v=` con el que la web remota esquiva la CDN (spec 16 §5.3).
 *
 * ## Por qué esto necesita un caso propio
 *
 * El aviso al publicar llega en menos de un segundo, pero la respuesta de esta ruta lleva
 * `s-maxage=60` y eso lo sirve **la CDN**, que `revalidateTag` no toca. Sin nada más, quien
 * obedeciera el aviso y volviera a pedir recibiría la copia de hace cuarenta segundos y
 * concluiría que el webhook no sirve.
 *
 * El contrato es pedir `?v=<ts del aviso>`: una query distinta es una entrada de caché distinta.
 * Eso solo funciona si la ruta **ignora** el parámetro, y de eso va este caso. Hoy lo ignora
 * porque solo lee `params.key` — pero "hoy no lo lee" es una propiedad del código, y sin un caso
 * que la fije, el día que alguien añada un `searchParams` aquí se rompe una web que no es
 * nuestra y no se entera nadie.
 */
test('T-A-28: el ?v= no cambia la respuesta, solo la clave de caché', async ({ request }) => {
  const sinV = await request.get('/api/content/hero');
  const conV = await request.get(`/api/content/hero?v=${String(Date.now())}`);

  expect(conV.status()).toBe(sinV.status());
  expect(await conV.json()).toEqual(await sinV.json());
});

test('T-A-29: y mantiene el mismo Cache-Control', async ({ request }) => {
  const conV = await request.get('/api/content/hero?v=1757404800123');

  // Si el `?v=` desactivara el caché, cada aviso castigaría a todas las visitas siguientes —
  // que es justo lo que §5.3 descarta al no bajar el `s-maxage`.
  expect(conV.headers()['cache-control']).toBe('public, s-maxage=60, stale-while-revalidate=300');
});

test('T-A-26: un parámetro cualquiera tampoco convierte la ruta en otra cosa', async ({
  request,
}) => {
  // No es paranoia: si algún día se leyera la query, el primer uso natural sería filtrar campos
  // o pedir el borrador. Esta ruta es pública y sin sesión, así que eso sería publicar sin que
  // nadie pulse nada.
  const conBasura = await request.get('/api/content/hero?draft=1&fields=title&v=x');
  const limpia = await request.get('/api/content/hero');

  expect(await conBasura.json()).toEqual(await limpia.json());
});

test('la ruta pública no exige sesión', async ({ request }) => {
  // Sin cookie de ningún tipo. Si el middleware la tratara como privada, esto sería un 307 a
  // la página de acceso.
  const response = await request.get('/api/content/hero', { headers: { cookie: '' } });

  expect(response.status()).toBe(200);
});
