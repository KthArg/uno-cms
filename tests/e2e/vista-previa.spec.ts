import { expect, test } from '@playwright/test';
import { consultarValor, ejecutarSql } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * T-J-1, T-J-7 y T-J-8: la vista previa en vivo, con dos ventanas de verdad (SPEC §6.1).
 *
 * **Esto es lo que `SPEC.md` §0 llama la razón de ser del proyecto.** Todo lo demás —el panel,
 * las actions, el historial— existe en cualquier CMS; escribir y ver la web cambiar al lado, no.
 *
 * Y solo se puede comprobar aquí: hace falta un iframe real, dos contextos de ventana y un canal
 * de mensajes entre ellos. Un test de componentes puede simular el mensaje —y lo hace, para los
 * casos hostiles— pero no puede demostrar que las dos piezas se entienden.
 */

test.describe.configure({ mode: 'serial' });

const CLAVE = 'faqs.vista-previa-e2e';
const PUBLICADO = 'la pregunta publicada';

test.beforeAll(() => {
  ejecutarSql('delete from content_entries where key = $1', [CLAVE]);
  ejecutarSql(
    `insert into content_entries (key, type, draft, published, status)
     values ($1, 'faqs', $2::jsonb, $2::jsonb, 'published')`,
    [CLAVE, JSON.stringify({ question: PUBLICADO, answer: { type: 'doc', content: [] } })]
  );
});

test('T-J-1 y T-J-7: escribir cambia el iframe sin recargarlo', async ({ page }) => {
  await crearYEntrar(page, { email: 'vista-previa-e2e@ejemplo.com', role: 'admin' });

  await page.goto(`/admin/content/${CLAVE}`);

  const marco = page.frameLocator('iframe[title="Vista previa de tu web"]');

  // Lo primero es que el iframe cargue **la landing**, no una página de error: si el token
  // fuera inválido esto sería un 404 y no habría nada dentro.
  await expect(marco.getByText(PUBLICADO)).toBeVisible({ timeout: 15_000 });

  // Y ahora lo que importa. Se escribe en el formulario del panel...
  await page.getByLabel(/Pregunta/).fill('ESCRITO SIN GUARDAR');

  // ...y la vista previa lo enseña. Sin recargar el iframe, sin publicar y sin que haya llegado
  // a guardarse: el mensaje va del formulario al iframe por `postMessage`.
  await expect(marco.getByText('ESCRITO SIN GUARDAR')).toBeVisible({ timeout: 10_000 });
  await expect(marco.getByText(PUBLICADO)).toHaveCount(0);
});

test('T-J-8: la vista previa no persiste nada por su cuenta', async ({ page }) => {
  await crearYEntrar(page, { email: 'vista-previa-persiste@ejemplo.com', role: 'admin' });

  const antes = consultarValor('select published from content_entries where key = $1', [CLAVE]);

  await page.goto(`/admin/content/${CLAVE}`);

  // Se espera al `main` del iframe y no a un texto concreto: el borrador lo pudo cambiar el
  // test anterior, y depender de eso ataría este test al orden de ejecución del fichero.
  const marco = page.frameLocator('iframe[title="Vista previa de tu web"]');
  await expect(marco.locator('main')).toBeAttached({ timeout: 15_000 });

  // Lo publicado no se toca. Quien mira una vista previa no está publicando, y confundir las dos
  // cosas sería el peor fallo posible de esta pantalla: se escribe *para* ver antes de publicar.
  expect(consultarValor('select published from content_entries where key = $1', [CLAVE])).toBe(
    antes
  );
});

test('el iframe no se puede embeber desde fuera (§6.2)', async ({ page }) => {
  const respuesta = await page.goto('/preview?token=basura');

  // `frame-ancestors 'self'` es lo que impide que un tercero monte la vista previa dentro de su
  // propia página y lea por encima del hombro. Va en la CSP de todas las respuestas.
  const csp = respuesta?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("frame-ancestors 'self'");
});

/**
 * T-R-15: **la vista previa de una web de este repositorio sigue igual** (spec 08 §6.4).
 *
 * Esta suite corre sin `PREVIEW_ORIGINS`, o sea en el estado por defecto de cualquier
 * despliegue. Los tests de arriba ya demuestran que la vista previa funciona; lo que este añade
 * es que **apunta a donde apuntaba**: si algún día el iframe empezara a salir hacia fuera sin
 * que nadie configurara nada, se vería aquí y no en producción.
 */
test('T-R-15: sin fase remota, el iframe apunta a `/preview` de este sitio', async ({ page }) => {
  await crearYEntrar(page, { email: 't-r-15@ejemplo.com', role: 'admin' });
  await page.goto(`/admin/content/${CLAVE}`);

  const src = await page
    .locator('iframe[title="Vista previa de tu web"]')
    .getAttribute('src', { timeout: 15_000 });

  expect(src).toMatch(/^\/preview\?token=/);
  expect(src).not.toContain('unocms_preview');
});
