import { expect, test } from '@playwright/test';
import { ejecutarSql } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * T-K-2: **publicar cambia lo que sirve la landing**, de extremo a extremo.
 *
 * ## Lo que ADR-405 dejó pendiente
 *
 * Desde M3 está comprobado que `publish` llama a `revalidateTag` con el tag correcto. Eso es un
 * test que **espía una llamada**, y pasa igual si el tag no invalida nada: si la lectura se
 * registrara con otro tag, si el caché no participara, si la landing leyera por otro camino.
 *
 * Este es el primer sitio donde se puede comprobar de verdad, porque hasta M5 no había landing
 * que mirar. Y por eso afirma sobre **la página servida**, no sobre la llamada.
 */

test.describe.configure({ mode: 'serial' });

const CLAVE = 'faqs.publicacion-e2e';
const ANTES = 'lo que había publicado antes';
const DESPUES = 'LO QUE SE PUBLICA AHORA';

/** La respuesta tiene contenido: es un campo obligatorio y sin él no se puede publicar. */
const RESPUESTA = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sí.' }] }],
};

test.beforeAll(() => {
  ejecutarSql('delete from content_entries where key = $1', [CLAVE]);
  ejecutarSql(
    `insert into content_entries (key, type, draft, published, status)
     values ($1, 'faqs', $2::jsonb, $2::jsonb, 'published')`,
    [CLAVE, JSON.stringify({ question: ANTES, answer: RESPUESTA })]
  );
});

test('T-K-2: publicar cambia la landing, sin reiniciar nada', async ({ page }) => {
  await crearYEntrar(page, { email: 'publicacion-e2e@ejemplo.com', role: 'admin' });

  // 1. **Publicar para que la landing conozca el elemento.** El `beforeAll` lo insertó por SQL,
  //    y eso no invalida nada: la landing sirve la lista cacheada, que no lo incluye. Ese
  //    detalle no es un estorbo del test — es la primera prueba de que el caché es real.
  await page.goto(`/admin/content/${CLAVE}`);
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });

  // 2. Ahora sí aparece, y esta visita deja **el caché caliente con el texto viejo**, que es lo
  //    que hace útil el resto: sin ella, la lectura final podría acertar por ser la primera.
  await page.goto('/');
  await expect(page.getByText(ANTES)).toBeVisible({ timeout: 10_000 });

  // 3. Se edita y se publica.
  await page.goto(`/admin/content/${CLAVE}`);
  await page.getByLabel(/Pregunta/).fill(DESPUES);
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });

  // 4. Y la landing enseña lo nuevo. **Esto es lo que ningún test anterior podía demostrar**:
  //    que la invalidación por tag funciona de verdad, no que se llame a la función.
  await page.goto('/');
  await expect(page.getByText(DESPUES)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(ANTES)).toHaveCount(0);
});

test('un borrador sin publicar NO se asoma a la landing', async ({ page }) => {
  await crearYEntrar(page, { email: 'publicacion-borrador@ejemplo.com', role: 'admin' });

  await page.goto(`/admin/content/${CLAVE}`);
  await page.getByLabel(/Pregunta/).fill('ESTO NO SE PUBLICA');
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  // La columna `published` separada existe justo para esto (SPEC §4). Es la propiedad que hace
  // que un CMS sirva para trabajar: se puede escribir a medias sin que lo vea nadie.
  await page.goto('/');
  await expect(page.getByText('ESTO NO SE PUBLICA')).toHaveCount(0);
  await expect(page.getByText(DESPUES)).toBeVisible();
});
