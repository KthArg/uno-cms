import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { cifrarSecreto, codigoTotp } from '../../../cms/segundo-factor';

/**
 * Crea una cuenta y entra por el formulario real (SPEC §7.1).
 *
 * **Entra por el formulario y no fabricando la cookie a mano**, que sería más rápido: una
 * sesión falsificada saltaría el callback `jwt` de Auth.js, que es donde se comprueba el claim
 * `pwdV` contra la base de datos (ADR-301). Los tests pasarían sin ejercitar la comprobación
 * que sostiene medio modelo de sesión — y el día que se rompiera, seguirían en verde.
 */

export const CONTRASENA = 'una-contrasena-larga-para-e2e';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * El secreto TOTP de una cuenta de prueba, **derivado de su correo** (spec 20).
 *
 * Determinista a propósito: varios casos crean la misma cuenta con `on conflict do nothing`, y si
 * el secreto fuera al azar, el segundo calcularía códigos de un secreto que no es el que quedó en
 * la base. Que sea adivinable no importa: es una cuenta de la base de e2e, que no existe fuera.
 */
export function secretoDePrueba(email: string): string {
  const bytes = createHash('sha1').update(`e2e:${email}`).digest();
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return salida;
}

export async function crearYEntrar(
  page: Page,
  opciones: { email: string; role: 'admin' | 'editor'; sinSegundoFactor?: boolean }
): Promise<void> {
  crearUsuario(opciones);

  await page.goto('/admin/login');
  await page.getByLabel('Correo').fill(opciones.email);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  // Desde la spec 20, todas las cuentas tienen segundo factor. La de prueba lo trae ya dado de
  // alta, y el código se calcula como lo haría su app.
  if (opciones.sinSegundoFactor !== true) {
    await page
      .getByLabel('Código de verificación')
      .fill(codigoTotp(secretoDePrueba(opciones.email)));
  }
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
function crearUsuario(opciones: {
  email: string;
  role: 'admin' | 'editor';
  sinSegundoFactor?: boolean;
}): void {
  // El secreto se cifra aquí, con el mismo `APP_SECRET` que tiene el servidor de la suite, y viaja
  // ya cifrado: el proceso hijo no necesita saber de 2FA.
  const cifrado =
    opciones.sinSegundoFactor === true
      ? ''
      : cifrarSecreto(secretoDePrueba(opciones.email), process.env['APP_SECRET'] ?? '');

  const script = `
    const { hash } = require('@node-rs/argon2');
    const { Pool } = require('pg');
    const [email, role, password, cifrado] = process.argv.slice(1);
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
      // Y siempre, exista o no de antes: el segundo factor en el estado que pide el caso, y el
      // último paso a cero, para que dos entradas de la misma cuenta dentro de los mismos treinta
      // segundos no choquen con la protección contra repetir un código (T-V-5).
      await pool.query(
        \`update users
            set totp_secret = nullif($2, ''),
                totp_activado_en = case when $2 = '' then null else now() end,
                totp_ultimo_paso = null,
                failed_logins = 0,
                locked_until = null
          where lower(email) = lower($1)\`,
        [email, cifrado]
      );
      await pool.end();
    })().catch((error) => { console.error(error); process.exit(1); });
  `;

  execFileSync('node', ['-e', script, opciones.email, opciones.role, CONTRASENA, cifrado], {
    stdio: 'inherit',
  });
}
