import { expect, test } from '@playwright/test';

/**
 * T-60-1 a T-60-6: cabeceras de seguridad y guard de `/admin` (SPEC §7.2, §7.1).
 *
 * Van en e2e y no en unitarios a propósito: lo que hay que comprobar es la **respuesta
 * real** que sale del servidor, no lo que el middleware cree que devuelve. Un test unitario
 * del middleware pasaría igual si el `matcher` estuviera mal y no se ejecutara nunca.
 */

test('T-60-2: la landing lleva todas las cabeceras de SPEC §7.2', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();

  expect(headers['content-security-policy']).toBeDefined();
  expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
});

test('T-60-3: la CSP lleva nonce y frame-ancestors self', async ({ request }) => {
  const csp = (await request.get('/')).headers()['content-security-policy'] ?? '';

  expect(csp).toMatch(/script-src [^;]*'nonce-[^']+'/);
  expect(csp).toContain("'strict-dynamic'");
  // Anti-clickjacking (SPEC §7.1). `self` y no `none`, porque el iframe de la vista previa
  // es same-origin y tiene que seguir funcionando.
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
});

test('T-60-4: el nonce cambia en cada petición', async ({ request }) => {
  const extraer = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

  const primero = extraer((await request.get('/')).headers()['content-security-policy'] ?? '');
  const segundo = extraer((await request.get('/')).headers()['content-security-policy'] ?? '');

  expect(primero).toBeDefined();
  // Un nonce reutilizado no es un nonce: su sentido es que no se pueda conocer de antemano.
  expect(primero).not.toBe(segundo);
});

test('T-60-5: X-Robots-Tag solo en las rutas privadas', async ({ request }) => {
  const landing = await request.get('/');
  // En la landing sería un error caro: costaría el posicionamiento del sitio entero.
  expect(landing.headers()['x-robots-tag']).toBeUndefined();

  for (const ruta of ['/admin', '/setup', '/api/health']) {
    const response = await request.get(ruta, { maxRedirects: 0 });
    expect(response.headers()['x-robots-tag'], `${ruta} debe llevar noindex`).toBe('noindex');
  }
});

test('T-60-6: la CSP de producción no lleva unsafe-eval', async ({ request }) => {
  const csp = (await request.get('/')).headers()['content-security-policy'] ?? '';

  // El e2e corre contra `next build && next start`, o sea producción. En desarrollo Next
  // necesita `unsafe-eval` para la recarga en caliente; dejarlo aquí anularía buena parte
  // de la política.
  expect(csp).not.toContain('unsafe-eval');
});

test('T-60-1: /admin sin sesión redirige al login sin filtrar contenido', async ({ page }) => {
  const response = await page.goto('/admin');

  expect(page.url()).toContain('/admin/login');
  // Ni rastro del panel en el cuerpo: la redirección ocurre antes de renderizar nada.
  expect(await page.content()).not.toContain('Sesión iniciada como');
  expect(response?.status()).toBe(200);
});

test('T-60-1: la ruta de destino se conserva para volver tras entrar', async ({ page }) => {
  await page.goto('/admin/media');
  expect(page.url()).toContain('next=%2Fadmin%2Fmedia');
});

test('T-60-7: una mutación con Origin ajeno se rechaza', async ({ request }) => {
  const response = await request.post('/admin', {
    headers: { origin: 'https://sitio-ajeno.example' },
    data: {},
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(403);
});

test('T-60-7: una petición GET con Origin ajeno NO se rechaza', async ({ request }) => {
  // Solo se comprueban los métodos que modifican estado: bloquear GET rompería enlaces
  // legítimos desde otros sitios sin aportar nada, porque un GET no debe mutar.
  const response = await request.get('/', {
    headers: { origin: 'https://sitio-ajeno.example' },
  });

  expect(response.status()).toBe(200);
});
