import { expect, test } from '@playwright/test';
import { consultarValor, ejecutarSql } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * T-F-2: el recorrido completo, que es la Definition of Done de M4 (spec de fase §5).
 *
 * Entrar → editar → guardar → publicar → historial → volver a una versión anterior, de una
 * sentada y contra un servidor de verdad.
 *
 * ## Qué añade esto a los tests que ya hay
 *
 * Cada tramo tiene ya su test: el editor guarda solo (#124), publicar dice qué se publicó
 * (#108), el historial lista y restaura (#105). Lo que ninguno cubre es **la costura entre
 * ellos**: que la versión que devuelve un guardado sirva para el publicar siguiente, que lo
 * publicado aparezca en el historial, y que restaurar deje al editor en un estado desde el que
 * se pueda seguir trabajando.
 *
 * Ahí es donde se han roto las cosas en este hito. El conflicto espurio de #124 no lo vio
 * ningún test de tramo: aparecía al encadenar escribir y publicar. Este es el test que lo
 * habría visto.
 *
 * ## Sobre su propia sección
 *
 * Un elemento creado por este fichero, en una colección que no toca ningún otro spec. Es la
 * lección de #105 y #134: en un CMS acoplado 1:1 a una landing no hay forma de darle a cada
 * test su propio `hero`, así que cuando el estado no se puede aislar, se crea uno que sí.
 */

test.describe.configure({ mode: 'serial' });

const CLAVE = 'faqs.recorrido-e2e';
const PRIMER_TEXTO = 'Lo que decía al principio';
const SEGUNDO_TEXTO = 'Lo que digo después de cambiarlo';

test.beforeAll(() => {
  ejecutarSql('delete from revisions where entry_key = $1', [CLAVE]);
  ejecutarSql('delete from content_entries where key = $1', [CLAVE]);
  ejecutarSql(
    `insert into content_entries (key, type, draft, published, status)
     values ($1, 'faqs', $2::jsonb, null, 'changed')`,
    [
      CLAVE,
      JSON.stringify({
        question: PRIMER_TEXTO,
        answer: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sí.' }] }],
        },
      }),
    ]
  );
});

test('T-F-2: entrar, editar, guardar, publicar, historial y volver atrás', async ({ page }) => {
  // ── Entrar ───────────────────────────────────────────────────────────────────────────────
  // Por el formulario de verdad, no fabricando la cookie: una sesión falsificada saltaría el
  // callback donde se comprueba `pwdV` contra la base de datos (ADR-301).
  await crearYEntrar(page, { email: 'recorrido-e2e@ejemplo.com', role: 'admin' });

  // ── Publicar por primera vez ─────────────────────────────────────────────────────────────
  // Hace falta para que exista algo a lo que volver: la primera publicación no genera revisión
  // porque no sustituye nada (ADR-402), y eso es justo lo que el historial vacío explica.
  await page.goto(`/admin/content/${CLAVE}`);
  await expect(page.getByLabel(/Pregunta/)).toHaveValue(PRIMER_TEXTO);
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });

  // El historial todavía está vacío, y lo dice explicando por qué.
  await page.getByRole('link', { name: 'Ver versiones anteriores' }).click();
  await expect(page.getByText(/Todavía no hay versiones anteriores/)).toBeVisible();
  await expect(page.getByText(/la primera no sustituye nada/)).toBeVisible();

  // ── Editar y guardar solo ────────────────────────────────────────────────────────────────
  await page.getByRole('link', { name: /Volver a/ }).click();
  await page.getByLabel(/Pregunta/).fill(SEGUNDO_TEXTO);

  // Guardar es automático (SPEC §8): no hay botón de guardar borrador que pulsar.
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  // Y lo guardado es borrador: la web sigue enseñando lo anterior.
  expect(consultarValor('select published from content_entries where key = $1', [CLAVE])).toContain(
    PRIMER_TEXTO
  );

  // ── Publicar el cambio ───────────────────────────────────────────────────────────────────
  // Encadenado con lo anterior, que es donde estaba el conflicto espurio de #124: el publicar
  // tiene que usar la versión que devolvió el guardado, no una que ya venció.
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });
  expect(consultarValor('select published from content_entries where key = $1', [CLAVE])).toContain(
    SEGUNDO_TEXTO
  );

  // ── El historial ya tiene la versión anterior ────────────────────────────────────────────
  await page.getByRole('link', { name: 'Ver versiones anteriores' }).click();

  // Con un fragmento del contenido, no solo la fecha: una lista de horas no permite elegir.
  await expect(page.getByText(PRIMER_TEXTO)).toBeVisible();

  // ── Volver a una versión anterior ────────────────────────────────────────────────────────
  await page
    .getByRole('button', { name: /Volver a la versión de/ })
    .first()
    .click();
  await expect(page.getByText(/Tu web no cambia/)).toBeVisible();
  await page.getByRole('button', { name: 'Sí, volver a esta versión' }).click();

  await page.waitForURL((url) => url.pathname === `/admin/content/${CLAVE}`);

  // Se vuelve al editor con el texto recuperado **en el borrador**, y la web intacta. Que
  // restaurar no publique lo garantiza la action desde #79; lo que se comprueba aquí es que el
  // recorrido entero acaba donde tiene que acabar.
  await expect(page.getByLabel(/Pregunta/)).toHaveValue(PRIMER_TEXTO);
  expect(consultarValor('select published from content_entries where key = $1', [CLAVE])).toContain(
    SEGUNDO_TEXTO
  );

  // ── Y desde ahí se puede seguir trabajando ───────────────────────────────────────────────
  // El remate del recorrido: tras restaurar, la pantalla queda con una versión utilizable, no
  // en un estado del que haya que salir recargando. Sin esto, todo lo anterior podría pasar y
  // dejar al editor atascado en el último paso.
  await page.getByLabel(/Pregunta/).fill('Y encima puedo seguir escribiendo');
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });

  expect(consultarValor('select published from content_entries where key = $1', [CLAVE])).toContain(
    'Y encima puedo seguir escribiendo'
  );
});
