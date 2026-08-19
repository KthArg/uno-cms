import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';

/**
 * Crea una cuenta y entra por el formulario real (SPEC §7.1).
 *
 * **Entra por el formulario y no fabricando la cookie a mano**, que sería más rápido: una
 * sesión falsificada saltaría el callback `jwt` de Auth.js, que es donde se comprueba el claim
 * `pwdV` contra la base de datos (ADR-301). Los tests pasarían sin ejercitar la comprobación
 * que sostiene medio modelo de sesión — y el día que se rompiera, seguirían en verde.
 */

export const CONTRASENA = 'una-contrasena-larga-para-e2e';

export async function crearYEntrar(
  page: Page,
  opciones: { email: string; role: 'admin' | 'editor' }
): Promise<void> {
  crearUsuario(opciones);

  await page.goto('/admin/login');
  await page.getByLabel('Correo').fill(opciones.email);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
}

/**
 * Inserta la fila con el hash de Argon2 calculado en un proceso aparte.
 *
 * En un proceso aparte porque `@node-rs/argon2` es un módulo nativo y el proceso de
 * Playwright no lo tiene cargado. Los argumentos van por `execFileSync` y no interpolados en
 * una cadena de shell: aquí no hay entrada hostil, pero construir comandos por concatenación
 * es una costumbre que acaba apareciendo donde sí la hay.
 */
function crearUsuario(opciones: { email: string; role: 'admin' | 'editor' }): void {
  const script = `
    const { hash } = require('@node-rs/argon2');
    const { Pool } = require('pg');
    const [email, role, password] = process.argv.slice(1);
    (async () => {
      const passwordHash = await hash(password, {
        algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1,
      });
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(
        \`insert into users (email, name, password_hash, role)
         values ($1, 'E2E', $2, $3)
         on conflict do nothing\`,
        [email, passwordHash, role]
      );
      await pool.end();
    })().catch((error) => { console.error(error); process.exit(1); });
  `;

  execFileSync('node', ['-e', script, opciones.email, opciones.role, CONTRASENA], {
    stdio: 'inherit',
  });
}
