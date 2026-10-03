import { expect, test } from '@playwright/test';
import { consultarValor, ejecutarSql } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * Spec 17, idiomas: lo que solo se ve con un servidor delante (T-ID-30 a T-ID-34, T-ID-44).
 *
 * `cms.config.ts` declara `es` (por defecto, en `/`) y `en` (en `/en`).
 */

test.describe.configure({ mode: 'serial' });

const ESPANOL = 'Portada en español del e2e de idiomas';
const INGLES = 'English cover from the language e2e';

test.beforeAll(() => {
  // El español, publicado y conocido: es lo que tiene que seguir igual al final.
  ejecutarSql(
    `insert into content_entries (key, locale, type, draft, published, status)
     values ('hero', '', 'hero', $1::jsonb, $1::jsonb, 'published')
     on conflict (key, locale) do update
       set draft = excluded.draft, published = excluded.published, status = 'published'`,
    [JSON.stringify({ title: ESPANOL })]
  );
  // Y el inglés, sin fila: se crea la primera vez que alguien abre su editor.
  ejecutarSql(`delete from content_entries where key = 'hero' and locale = 'en'`);
  ejecutarSql(`delete from revisions where entry_key = 'hero' and locale = 'en'`);
});

test('T-ID-44: elegir English, editar la portada, publicar, y el español sigue igual', async ({
  page,
}) => {
  await crearYEntrar(page, { email: 'idiomas-e2e@ejemplo.com', role: 'admin' });

  await page.goto('/admin');
  const selector = page.getByRole('group', { name: 'Idioma del contenido' });
  await expect(selector.getByRole('button', { name: 'Español' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await selector.getByRole('button', { name: 'English' }).click();
  await expect(selector.getByRole('button', { name: 'English' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByText('En English')).toBeVisible();

  // T-ID-41, con un servidor de verdad: la etiqueta del editor dice el idioma que lleva la cookie.
  await page.goto('/admin/content/hero');
  await expect(page.getByText('En English')).toBeVisible();

  await page.getByLabel(/Título principal/).fill(INGLES);
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });

  // T-ID-30: `/en` enseña el inglés, dentro de un elemento que lo dice.
  await page.goto('/en');
  await expect(page.getByText(INGLES)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('main[lang="en"]')).toBeVisible();

  // Y `/` sigue en español, sin una letra del inglés.
  await page.goto('/');
  await expect(page.getByText(ESPANOL)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(INGLES)).toHaveCount(0);

  // Lo mismo, preguntado a la base y no a la página: lo publicado en español no se ha tocado.
  // `consultarValor` devuelve el valor en JSON, así que un texto llega entre comillas.
  expect(
    JSON.parse(
      consultarValor(
        `select published->>'title' from content_entries where key = 'hero' and locale = ''`
      )
    )
  ).toBe(ESPANOL);
});

test('T-ID-31: `/es`, que es el de por defecto, redirige a `/` para siempre', async ({ page }) => {
  const respuesta = await page.request.get('/es', { maxRedirects: 0 });

  expect(respuesta.status()).toBe(308);
  expect(new URL(respuesta.headers()['location'] ?? '', 'http://x').pathname).toBe('/');
});

test('T-ID-32: un idioma que no existe es 404', async ({ page }) => {
  const respuesta = await page.request.get('/xx');

  expect(respuesta.status()).toBe(404);
});

test('T-ID-33: el `<html lang>` es el del idioma por defecto', async ({ page }) => {
  await page.goto('/en');

  // El `<html>` lo comparte el layout raíz; el inglés lo dice su `<main>` (spec 17 §5.6).
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('T-ID-34: el sitemap lista `/` y `/en`, con sus alternativas de idioma', async ({ page }) => {
  const respuesta = await page.request.get('/sitemap.xml');
  const xml = await respuesta.text();

  expect(respuesta.ok()).toBe(true);
  expect(xml).toMatch(/<loc>[^<]*\/en<\/loc>/);
  expect(xml).toContain('hreflang="en"');
  expect(xml).toContain('hreflang="es"');
});
