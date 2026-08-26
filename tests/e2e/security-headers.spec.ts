import { expect, test } from '@playwright/test';
import { crearYEntrar } from './support/session';

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

test('T-60-5: X-Robots-Tag ausente en la landing', async ({ request }) => {
  // En la landing sería un error caro: costaría el posicionamiento del sitio entero y nadie
  // lo notaría hasta semanas después.
  expect((await request.get('/')).headers()['x-robots-tag']).toBeUndefined();
});

test('T-60-5: X-Robots-Tag en respuestas 200 de rutas privadas', async ({ request }) => {
  // Se comprueban respuestas con contenido, no redirecciones: si la cabecera solo estuviera
  // en el redirect de /admin, la página real quedaría indexable y el test anterior —que
  // mezclaba ambos casos— seguiría en verde.
  // `/setup` responde 404 en un sitio configurado, que es el estado de esta suite; la
  // cabecera tiene que estar igualmente, porque un 404 también se puede indexar.
  for (const ruta of ['/api/health', '/setup']) {
    const response = await request.get(ruta, { failOnStatusCode: false });
    // Lo que importa es que NO sea una redirección: `/api/health` responde 200 y `/setup`
    // responde 404 en un sitio configurado, y ambas respuestas son indexables.
    const status = response.status();
    expect(status < 300 || status >= 400, `${ruta} no debería redirigir (fue ${status})`).toBe(
      true
    );
    expect(response.headers()['x-robots-tag'], `${ruta} debe llevar noindex`).toBe('noindex');
  }
});

test('T-60-5: X-Robots-Tag también en la redirección de /admin', async ({ request }) => {
  // La respuesta 307 también es indexable si un rastreador la sigue, así que la cabecera
  // tiene que estar en ambas.
  const response = await request.get('/admin', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()['x-robots-tag']).toBe('noindex');
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

test('T-61-5: /setup devuelve 404 en un sitio ya configurado', async ({ request }) => {
  // El estado normal de un despliegue. Un 404 y no un 403: un 403 confirmaría que la ruta
  // existe y que alguien se configuró ahí, y esa información no le hace falta a nadie.
  //
  // El caso contrario —sitio recién desplegado, /setup accesible— se cubre en los tests de
  // integración, donde se puede controlar el estado de la base por test.
  const response = await request.get('/setup', { failOnStatusCode: false });
  expect(response.status()).toBe(404);
});

/**
 * T-N-1: las cabeceras de §7.2 sobre **todas** las clases de ruta (issue #120).
 *
 * Los tests de arriba cubren la landing, `/api/health`, `/setup` y la redirección de `/admin`.
 * Faltaban tres clases que existen desde M4 y M5: **el panel con sesión**, **la vista previa** y
 * **la subida de imágenes**.
 *
 * La distinción importa porque el middleware decide por prefijo y por método: una ruta que
 * responde 200 con sesión recorre un camino distinto del que redirige sin ella, y una ruta de
 * API que solo acepta POST no se comprueba pidiéndola con GET.
 */

/**
 * Las cabeceras que `SPEC.md` §7.2 exige en **todas** las respuestas.
 *
 * **No hay `X-Frame-Options`, y no es un olvido.** La escribí en la primera versión de estos
 * tests por costumbre y los tres fallaron. §7.2 no la lista: el anti-clickjacking lo hace
 * `frame-ancestors 'self'` en la CSP, que además es lo correcto aquí — un `X-Frame-Options:
 * DENY` bloquearía el iframe de la vista previa, que es **del mismo origen** y la razón de ser
 * del producto (§0). Es un caso de cabecera "de seguridad" que habría roto una función.
 */
const CABECERAS_DE_TODAS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
};

test('T-N-1: el panel CON sesión lleva las cabeceras y noindex', async ({ page }) => {
  await crearYEntrar(page, { email: 'cabeceras-panel@ejemplo.com', role: 'admin' });

  const respuesta = await page.goto('/admin');

  // Un 200 del panel, no la redirección: son dos caminos distintos del middleware, y hasta
  // ahora solo se comprobaba el segundo.
  expect(respuesta?.status()).toBe(200);

  const cabeceras = respuesta?.headers() ?? {};
  for (const [nombre, valor] of Object.entries(CABECERAS_DE_TODAS)) {
    expect(cabeceras[nombre], `${nombre} en /admin`).toBe(valor);
  }
  expect(cabeceras['x-robots-tag']).toBe('noindex');
  expect(cabeceras['content-security-policy']).toContain("frame-ancestors 'self'");
});

test('T-N-1: la vista previa lleva las cabeceras y noindex', async ({ request }) => {
  // Sin token responde 404, y da igual: un 404 también se puede indexar y también sale por el
  // middleware. Lo que se comprueba es la respuesta, no que la página exista.
  const respuesta = await request.get('/preview', { failOnStatusCode: false });

  const cabeceras = respuesta.headers();
  for (const [nombre, valor] of Object.entries(CABECERAS_DE_TODAS)) {
    expect(cabeceras[nombre], `${nombre} en /preview`).toBe(valor);
  }
  expect(cabeceras['x-robots-tag']).toBe('noindex');
});

test('T-N-1: la ruta de subida lleva las cabeceras, y rechaza sin sesión', async ({ request }) => {
  // Se pide con POST porque es lo que acepta: comprobarla con GET mediría otro camino.
  const respuesta = await request.post('/api/media/upload', {
    data: {},
    failOnStatusCode: false,
  });

  // Sin sesión no se emite token de subida. Que además responda con las cabeceras puestas es
  // lo que este caso añade.
  expect(respuesta.status()).toBeGreaterThanOrEqual(400);

  const cabeceras = respuesta.headers();
  for (const [nombre, valor] of Object.entries(CABECERAS_DE_TODAS)) {
    expect(cabeceras[nombre], `${nombre} en /api/media/upload`).toBe(valor);
  }
  expect(cabeceras['x-robots-tag']).toBe('noindex');
});

/**
 * T-R-1 y T-R-2 sobre la **respuesta real** (spec 08 §6.1).
 *
 * Los unitarios comparan la política carácter a carácter y comprueban el manejador de la ruta;
 * los dos pasarían igual si el middleware dejara de llamar a `construirCsp` o si la ruta no
 * estuviera desplegada. Esto es lo que dice que sale por el cable.
 *
 * Esta suite corre **sin** `PREVIEW_ORIGINS`, que es el estado por defecto de cualquier
 * despliegue: lo que se comprueba aquí es que la fase nace apagada.
 */

test('T-R-2: sin PREVIEW_ORIGINS, la CSP que sale no lleva frame-src', async ({ request }) => {
  const csp = (await request.get('/')).headers()['content-security-policy'] ?? '';

  expect(csp).not.toContain('frame-src');
  // Y lo que ya había sigue: la comprobación de arriba pasaría también con una CSP vacía.
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("default-src 'self'");
});

test('T-R-1: sin PREVIEW_ORIGINS, la ruta de borradores responde 404', async ({ request }) => {
  // La única ruta por la que pueden salir borradores (ADR-701). Sin la variable no existe, y
  // un 404 —no un 403— para no confirmar que ahí hay un endpoint.
  const respuesta = await request.get('/api/preview/contenido', { failOnStatusCode: false });

  expect(respuesta.status()).toBe(404);
  expect(await respuesta.text()).toBe('');
});
