import { expect, test } from '@playwright/test';
import { rutasDelPanel, RUTAS_PUBLICAS } from '../support/admin-routes';
import { ejecutarSql } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * T-F-1 (issue #70): **el guard autoritativo corre en todas las rutas del panel.**
 *
 * ## Por qué no basta con "sin sesión redirige"
 *
 * Ese caso ya está cubierto desde M2, y **no distingue los dos guards**. Una página colocada
 * fuera del grupo `(panel)` sigue redirigiendo a un anónimo, porque el middleware la protege
 * por prefijo. Lo que pierde es la comprobación de Node, y con ella las garantías de ADR-301.
 *
 * El caso que sí los distingue es una sesión **válida en su firma pero invalidada en la base
 * de datos**: exactamente lo que queda cuando a alguien se le cambia la contraseña o se le
 * desactiva la cuenta. El middleware la deja pasar —la firma es correcta— y solo el layout de
 * `(panel)` la rechaza.
 *
 * Así que el test entra de verdad, invalida la sesión por SQL como haría `deactivateUser`, y
 * pide **todas** las rutas del panel enumeradas del sistema de ficheros. Una pantalla nueva
 * entra sola en este test el día que se cree.
 */

const RUTAS_PRIVADAS = rutasDelPanel().filter(
  (ruta) => !RUTAS_PUBLICAS.some((publica) => publica.url === ruta.url)
);

test('hay rutas privadas que comprobar', () => {
  // Si la enumeración se rompiera, el bucle de abajo no ejecutaría ni un aserto y este fichero
  // daría verde sin comprobar nada.
  expect(RUTAS_PRIVADAS.length).toBeGreaterThanOrEqual(2);
});

test('una sesión invalidada no entra por ninguna ruta del panel', async ({ page }) => {
  const email = 'guards-e2e@ejemplo.com';
  await crearYEntrar(page, { email, role: 'admin' });

  // Lo que hace `deactivateUser`, y también `changePassword`: subir la versión de contraseña.
  // La cookie del navegador sigue siendo válida en su firma; lo que ha caducado es su claim.
  ejecutarSql('update users set password_version = password_version + 1 where email = $1', [email]);

  for (const ruta of RUTAS_PRIVADAS) {
    await page.goto(ruta.url);

    // Tiene que acabar en el login. Si esta página estuviera fuera del grupo `(panel)`, el
    // middleware la habría dejado pasar —la firma es correcta— y se vería el panel con una
    // sesión que ya no vale.
    await expect(
      page,
      `la ruta ${ruta.url} (${ruta.fichero}) no expulsó a una sesión invalidada`
    ).toHaveURL(/\/admin\/login/);
  }
});
