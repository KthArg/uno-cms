import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { ejecutarSql } from './support/db';

/**
 * T-I-1, T-I-3 y T-I-5: la ruta `/preview` contra un servidor de verdad (SPEC §6.1, §6.2).
 *
 * ## Su propia sección
 *
 * Un elemento creado por este fichero en una colección que no toca ningún otro spec. Es la
 * lección de #105 y #134: cuando el estado no se puede aislar, se crea uno que sí.
 */

// En serie: los cuatro tests comparten el elemento que crea el `beforeAll`, y ese `beforeAll`
// corre **una vez por worker**. En paralelo, tres workers intentan insertar la misma clave y
// dos chocan contra el índice único. Lo descubrí así, no leyéndolo.
test.describe.configure({ mode: 'serial' });

const CLAVE = 'faqs.preview-e2e';
const BORRADOR = 'ESTO ES EL BORRADOR';
const PUBLICADO = 'esto es lo publicado';

/**
 * Firma un token de vista previa igual que lo haría el servidor.
 *
 * En un proceso aparte porque la firma vive en un módulo TypeScript del proyecto y el proceso
 * de Playwright no lo transpila. Se le pasa el mismo `APP_SECRET` que usa el servidor bajo
 * prueba: si no coincidiera, el token sería inválido y el test fallaría por el motivo
 * equivocado — pareciendo que la ruta rechaza tokens buenos.
 */
function firmarToken(key: string, ttlSegundos = 7200): string {
  const script = `
    const { createHmac } = require('node:crypto');
    const [key, ttl] = process.argv.slice(1);
    const payload = {
      purpose: 'preview',
      data: { key },
      exp: Math.floor(Date.now() / 1000) + Number(ttl),
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const firma = createHmac('sha256', process.env.APP_SECRET).update(encoded).digest('base64url');
    process.stdout.write(encoded + '.' + firma);
  `;

  return execFileSync('node', ['-e', script, key, String(ttlSegundos)], { encoding: 'utf8' });
}

test.beforeAll(() => {
  ejecutarSql('delete from content_entries where key = $1', [CLAVE]);
  ejecutarSql(
    `insert into content_entries (key, type, draft, published, status)
     values ($1, 'faqs', $2::jsonb, $3::jsonb, 'changed')`,
    [
      CLAVE,
      JSON.stringify({ question: BORRADOR, answer: { type: 'doc', content: [] } }),
      JSON.stringify({ question: PUBLICADO, answer: { type: 'doc', content: [] } }),
    ]
  );
});

test('T-I-1: con token válido enseña el BORRADOR de esa clave', async ({ page }) => {
  await page.goto(`/preview?token=${encodeURIComponent(firmarToken(CLAVE))}`);

  // La razón de existir de la ruta: la landing pública enseña lo publicado, esta enseña lo que
  // el editor tiene escrito sin publicar.
  await expect(page.getByText(BORRADOR)).toBeVisible();
  await expect(page.getByText(PUBLICADO)).toHaveCount(0);
});

test('el borrador de OTRA clave no se asoma (ADR-501)', async ({ page }) => {
  // Un token de `hero` no autoriza a ver los borradores de las preguntas. Sin esto, la clave
  // que viaja dentro de la firma (#82) no acotaría nada y un enlace filtrado sería una llave
  // maestra a todo lo que hay sin publicar.
  await page.goto(`/preview?token=${encodeURIComponent(firmarToken('hero'))}`);

  await expect(page.getByText(BORRADOR)).toHaveCount(0);
  await expect(page.getByText(PUBLICADO)).toBeVisible();
});

test('T-I-3: sin token, con basura, caducado o de otro propósito → 404', async ({ page }) => {
  // Los cuatro igual. Distinguirlos convertiría la ruta en un comprobador de enlaces ajenos:
  // "este existió alguna vez" es lo único que le falta a quien encuentre uno viejo.
  for (const url of [
    '/preview',
    '/preview?token=',
    '/preview?token=basura',
    '/preview?token=eyJhIjoxfQ.firmainventada',
    `/preview?token=${encodeURIComponent(firmarToken(CLAVE, -60))}`,
  ]) {
    const respuesta = await page.goto(url);
    expect(respuesta?.status(), url).toBe(404);
  }
});

test('T-I-5: la vista previa no se indexa', async ({ page }) => {
  const respuesta = await page.goto(`/preview?token=${encodeURIComponent(firmarToken(CLAVE))}`);

  // Sin esto, una vista previa compartida acabaría en un buscador con el contenido sin publicar
  // de alguien dentro.
  expect(respuesta?.headers()['x-robots-tag']).toContain('noindex');
});
