import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { invalidateSessions, isSessionStillValid } from '@/cms/auth/authenticate';
import { autenticarConGoogle } from '@/cms/auth/google';
import { hashPassword } from '@/cms/auth/passwords';
import { auditLog, getDb, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-233-11 a T-233-14: el acceso con Google contra Postgres real (spec 13 §8, ADR-900).
 *
 * Lo que se ejercita aquí y no en la suite unitaria es justo lo que no se puede fingir: la
 * consulta por `lower(email)` que sostiene ADR-201, que no se escriba ninguna fila en `users`,
 * el rastro que queda en `audit_log` y que la invalidación de sesiones de ADR-301 alcance
 * también a esta puerta.
 */

const EMAIL = 'ana@ejemplo.com';

let hash: string;

async function crearUsuario(opciones: { email?: string; active?: boolean } = {}) {
  hash ??= await hashPassword('una-contrasena-larga-y-poco-comun');

  const [fila] = await getDb()
    .insert(users)
    .values({
      email: opciones.email ?? EMAIL,
      name: 'Ana',
      passwordHash: hash,
      role: 'editor',
      active: opciones.active ?? true,
    })
    .returning();

  return fila;
}

async function auditoria() {
  return getDb().select().from(auditLog);
}

describeIntegration('entrar con Google', () => {
  it('T-233-11: encuentra la cuenta sin distinguir mayúsculas (ADR-201)', async () => {
    /**
     * **La fila se guarda con mayúsculas y se busca en minúsculas**, y ese orden es el caso.
     *
     * La primera versión de este test hacía lo contrario —fila en minúsculas, correo de Google
     * con mayúsculas— y **la mutación lo cazó**: quitando el `lower()` de la consulta seguía en
     * verde. Claro, porque `autenticarConGoogle` ya normaliza lo que llega de Google, así que
     * los dos lados de la comparación eran minúsculas y el `lower()` no hacía nada.
     *
     * Lo que el `lower()` protege es lo que hay **guardado**: quien se registró con
     * `Ana@Ejemplo.com`. Sin él, esa persona recibiría "no puedes entrar" con una cuenta activa
     * — un fallo silencioso y muy difícil de contar por teléfono.
     */
    const usuario = await crearUsuario({ email: 'Ana@Ejemplo.COM' });

    const resultado = await autenticarConGoogle({
      email: 'ana@ejemplo.com',
      emailVerificado: true,
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.ok && resultado.usuario.id).toBe(usuario?.id);
    expect(resultado.ok && resultado.usuario.role).toBe('editor');
  });

  it('y el correo que llega de Google también se normaliza antes de comparar', async () => {
    // La otra mitad, con la fila en minúsculas: sin `toLowerCase()` en la entrada, quien tenga
    // el correo con mayúsculas en su cuenta de Google no entraría. Son dos defensas distintas
    // y hacen falta las dos — la mutación de una no mata el test de la otra.
    await crearUsuario({ email: 'ana@ejemplo.com' });

    expect(
      (await autenticarConGoogle({ email: 'ANA@Ejemplo.com', emailVerificado: true })).ok
    ).toBe(true);
  });

  it('T-233-12: un correo que no existe no entra, y no crea ninguna cuenta', async () => {
    const resultado = await autenticarConGoogle({
      email: 'nadie@ejemplo.com',
      emailVerificado: true,
    });

    expect(resultado).toEqual({ ok: false, motivo: 'cuenta-inexistente' });

    // La comprobación que sostiene ADR-900 §2: Google autentica, no autoriza. Si esta ruta
    // creara la fila, cualquiera con una cuenta de Google entraría al panel de cualquiera, y
    // "nunca existen credenciales por defecto" (SPEC §7.3) dejaría de ser cierto.
    expect(await getDb().select().from(users)).toHaveLength(0);
  });

  it('T-233-7 contra base de datos: una cuenta desactivada no entra', async () => {
    await crearUsuario({ active: false });

    const resultado = await autenticarConGoogle({ email: EMAIL, emailVerificado: true });

    expect(resultado).toEqual({ ok: false, motivo: 'cuenta-desactivada' });
  });

  it('T-233-8 contra base de datos: el bloqueo por intentos fallidos no cierra esta puerta', async () => {
    const usuario = await crearUsuario();

    // El bloqueo que dejaría `authenticate` tras cinco fallos, puesto a mano para no gastar
    // cinco verificaciones de Argon2 en algo que no se está probando aquí.
    await getDb()
      .update(users)
      .set({ failedLogins: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) })
      .where(eq(users.id, usuario!.id));

    // ADR-901: el bloqueo defiende la contraseña de que la adivinen, y por aquí no pasa
    // ninguna. Si cerrara también esta puerta, cualquiera echaría a otro del panel entero
    // tecleando cinco contraseñas malas con su correo.
    expect((await autenticarConGoogle({ email: EMAIL, emailVerificado: true })).ok).toBe(true);
  });

  it('T-233-13: cada intento deja su rastro, con el proveedor y el motivo', async () => {
    const usuario = await crearUsuario();

    await autenticarConGoogle({ email: EMAIL, emailVerificado: true });
    await autenticarConGoogle({ email: 'nadie@ejemplo.com', emailVerificado: true });
    await autenticarConGoogle({ email: EMAIL, emailVerificado: false });

    const registro = await auditoria();

    expect(registro.map((fila) => fila.action)).toEqual([
      'login.success',
      'login.fail',
      'login.fail',
    ]);

    expect(registro[0]?.actorId).toBe(usuario?.id);
    expect(registro[0]?.meta).toEqual({ proveedor: 'google' });
    expect(registro[1]?.meta).toEqual({ proveedor: 'google', motivo: 'cuenta-inexistente' });
    expect(registro[2]?.meta).toEqual({ proveedor: 'google', motivo: 'correo-sin-verificar' });

    // El rechazo por correo sin verificar sí sabe de quién es la fila —el correo existe— pero
    // no se ha llegado a consultar, así que no puede señalarla. Es coherente con no inventarse
    // un actor: mejor un registro sin identificador que uno con el equivocado.
    expect(registro[1]?.actorId).toBeNull();
    expect(registro[2]?.actorId).toBeNull();
  });

  it('T-233-14: invalidar sesiones alcanza también a quien entró con Google (ADR-301)', async () => {
    const usuario = await crearUsuario();

    const resultado = await autenticarConGoogle({ email: EMAIL, emailVerificado: true });
    expect(resultado.ok).toBe(true);

    const version = resultado.ok ? resultado.usuario.passwordVersion : -1;

    // La sesión recién abierta es válida…
    expect(await isSessionStillValid(usuario!.id, version)).toBe(true);

    // …y deja de serlo en cuanto se cambia la contraseña. No hay una segunda ruta de sesión:
    // hay dos formas de conseguir el mismo token, y el claim `pwdV` es el mismo para las dos.
    await invalidateSessions(usuario!.id);

    expect(await isSessionStillValid(usuario!.id, version)).toBe(false);
  });

  it('desactivar también echa a quien ya está dentro por Google', async () => {
    const usuario = await crearUsuario();
    const resultado = await autenticarConGoogle({ email: EMAIL, emailVerificado: true });
    const version = resultado.ok ? resultado.usuario.passwordVersion : -1;

    await getDb().update(users).set({ active: false }).where(eq(users.id, usuario!.id));

    expect(await isSessionStillValid(usuario!.id, version)).toBe(false);
  });
});
