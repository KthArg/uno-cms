import { Pool } from 'pg';

/**
 * Quita la verificación en dos pasos de una cuenta: la salida de quien perdió el móvil **y** los
 * códigos de recuperación (spec 20, T-V-18).
 *
 * ## Por qué un script y no un botón
 *
 * Porque se decidió que no haya «un admin te la quita» desde el panel (spec 20 §2): una cuenta de
 * admin robada podría quitarle la 2FA a cualquiera y entrar con su contraseña. Esto exige la base
 * de datos, que es una credencial que solo tiene quien despliega, y no una sesión del panel.
 *
 * ## Lo que hace
 *
 * Borra el secreto, la fecha de alta, el último paso y los códigos de recuperación, y **sube
 * `password_version`**: cualquier sesión abierta de esa cuenta deja de valer. Al volver a entrar
 * con su contraseña, la cuenta va a una sesión de alta y vuelve a dar de alta su 2FA. Lo deja
 * escrito en `audit_log`.
 *
 * Es un `.mjs` por lo mismo que `medios-huerfanos.mjs`: se ejecuta con `node` a secas.
 */

export const USO = 'Uso: pnpm mfa:quitar <correo>';

/**
 * Quita la 2FA de la cuenta con ese correo. Devuelve si había una cuenta con ese correo.
 *
 * @param {import('pg').Pool} pool
 * @param {string} correo
 * @returns {Promise<boolean>}
 */
export async function quitarSegundoFactor(pool, correo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const { rows } = await cliente.query(
      `update users
          set totp_secret = null,
              totp_activado_en = null,
              totp_ultimo_paso = null,
              codigos_recuperacion = '{}',
              password_version = password_version + 1,
              updated_at = now()
        where lower(email) = lower($1)
        returning id, email`,
      [correo.trim()]
    );
    const fila = rows[0];
    if (fila !== undefined) {
      await cliente.query(
        `insert into audit_log (action, actor_email, target_type, target_id, meta)
         values ('user.segundoFactor.quitado', null, 'user', $1, '{"via":"pnpm mfa:quitar"}')`,
        [fila.id]
      );
    }
    await cliente.query('commit');
    return fila !== undefined;
  } catch (error) {
    await cliente.query('rollback');
    throw error;
  } finally {
    cliente.release();
  }
}

/* c8 ignore start -- el arranque; lo probado es lo de arriba */
const esEjecucionDirecta = process.argv[1]?.endsWith('quitar-segundo-factor.mjs') === true;

if (esEjecucionDirecta) {
  const correo = process.argv[2];
  const url = process.env['DATABASE_URL'];

  if (correo === undefined || correo.trim() === '') {
    console.error(USO);
    process.exit(1);
  }
  if (url === undefined || url.trim() === '') {
    console.error('[2fa] Hace falta DATABASE_URL: este script va directo a la base.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  try {
    const habia = await quitarSegundoFactor(pool, correo);
    console.log(
      habia
        ? `[2fa] Quitada a ${correo}. Sus sesiones se han cerrado; al entrar la dará de alta otra vez.`
        : `[2fa] No hay ninguna cuenta con el correo ${correo}.`
    );
    process.exit(habia ? 0 : 1);
  } finally {
    await pool.end();
  }
}
/* c8 ignore stop */
