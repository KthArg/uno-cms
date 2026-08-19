import { expect, test } from '@playwright/test';
import { consultarValor, ejecutarSql } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * T-E-1 a T-E-3: el historial contra un servidor de verdad.
 *
 * Lo que aquí se comprueba y los tests de componentes no pueden: que restaurar **no publica**,
 * afirmado sobre la base de datos. Que la action lo garantice (#79) y que la pantalla lo diga
 * son dos cosas distintas de que el recorrido entero acabe bien.
 *
 * ## Sobre una sección propia, y no sobre `hero`
 *
 * La primera versión usaba `hero`, y pasaba sola y fallaba en la suite completa: `hero` lo
 * tocan también los tests del editor y los de la ruta pública, en paralelo. Un CMS acoplado a
 * una landing es **un solo sitio**, así que dos ficheros que editan la misma sección son dos
 * editores peleándose.
 *
 * Aquí se usa un elemento **creado por este fichero** en la colección de preguntas, que no
 * toca nadie más. Es la misma regla de siempre —cada test deja el estado que necesita— llevada
 * un paso más allá: cuando el estado no se puede aislar, se crea uno que sí.
 *
 * En serie porque estos tres tests sí comparten ese elemento entre ellos.
 */

test.describe.configure({ mode: 'serial' });

/** El elemento de este fichero. La clave es fija para poder rehacerlo en cada ejecución. */
const CLAVE = 'faqs.historial-e2e';

test.beforeAll(() => {
  // Estado de partida propio: sin revisiones y sin publicar, para que el recorrido sea el mismo
  // en la primera ejecución y en la décima.
  ejecutarSql('delete from revisions where entry_key = $1', [CLAVE]);
  ejecutarSql('delete from content_entries where key = $1', [CLAVE]);
  ejecutarSql(
    `insert into content_entries (key, type, draft, published, status)
     values ($1, 'faqs', $2::jsonb, null, 'changed')`,
    [
      CLAVE,
      JSON.stringify({
        question: 'Primera versión',
        answer: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sí.' }] }],
        },
      }),
    ]
  );
});

test('T-E-2: restaurar una versión anterior NO publica', async ({ page }) => {
  await crearYEntrar(page, { email: 'historial@ejemplo.com', role: 'admin' });

  // Se publica dos veces para que exista una revisión: la primera no sustituye nada y no genera
  // ninguna (ADR-402), cosa que la pantalla vacía explica.
  await page.goto(`/admin/content/${CLAVE}`);
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });

  await page.getByLabel(/Pregunta/).fill('Segunda versión');
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });

  expect(consultarValor('select published from content_entries where key = $1', [CLAVE])).toContain(
    'Segunda versión'
  );

  // Ahora al historial, que debe tener la primera guardada.
  await page.getByRole('link', { name: 'Ver versiones anteriores' }).click();
  await expect(page.getByText('Primera versión')).toBeVisible();

  await page
    .getByRole('button', { name: /Volver a la versión de/ })
    .first()
    .click();
  await expect(page.getByText(/Tu web no cambia/)).toBeVisible();
  await page.getByRole('button', { name: 'Sí, volver a esta versión' }).click();

  // `waitForURL` con una función en vez de una expresión construida: la clave lleva un punto,
  // que en una expresión regular significa "cualquier carácter".
  await page.waitForURL((url) => url.pathname === `/admin/content/${CLAVE}`);

  // **Lo que importa**: el borrador es la versión vieja y lo publicado sigue siendo la nueva.
  // Si restaurar publicara, un clic exploratorio en el historial habría cambiado la web.
  await expect(page.getByLabel(/Pregunta/)).toHaveValue('Primera versión');
  expect(consultarValor('select published from content_entries where key = $1', [CLAVE])).toContain(
    'Segunda versión'
  );
});

test('T-E-1: el historial no mezcla versiones de otras secciones', async ({ page }) => {
  ejecutarSql(
    `insert into revisions (entry_key, data) values ('about', '{"heading":"De otra sección"}'::jsonb)`
  );

  await crearYEntrar(page, { email: 'historial-filtro@ejemplo.com', role: 'admin' });
  await page.goto(`/admin/history/${CLAVE}`);

  await expect(page.getByText('De otra sección')).toHaveCount(0);
});

test('T-E-3: deshacer cambios pide confirmación diciendo qué se pierde', async ({ page }) => {
  await crearYEntrar(page, { email: 'historial-deshacer@ejemplo.com', role: 'admin' });

  await page.goto(`/admin/content/${CLAVE}`);
  await page.getByLabel(/Pregunta/).fill('Algo que voy a descartar');
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Deshacer cambios' }).click();

  // No un "¿estás seguro?": dice qué se descarta y a qué se vuelve.
  await expect(page.getByText(/Se descarta todo lo que has escrito/)).toBeVisible();
  await page.getByRole('button', { name: 'Sí, deshacer' }).click();

  // Vuelve lo publicado, que en este punto es la segunda versión.
  await expect(page.getByLabel(/Pregunta/)).toHaveValue('Segunda versión', {
    timeout: 10_000,
  });
});
