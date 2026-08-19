import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { changePassword, deactivateUser, inviteUser, updateUserRole } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { authenticate, isSessionStillValid } from '@/cms/auth/authenticate';
import { hashPassword } from '@/cms/auth/passwords';
import { getDb, users } from '@/cms/db';
import { verifyToken } from '@/cms/security/tokens';
import { describeIntegration } from './env';

/** T-81-1 a T-81-7: usuarios y el guard `LAST_ADMIN` (SPEC §5.3, §7.1). */

const PASSWORD = 'una-contrasena-larga-y-valida';
let hash: string | undefined;

async function crearUsuario(opciones: {
  email: string;
  role: 'admin' | 'editor';
  active?: boolean;
}) {
  hash ??= await hashPassword(PASSWORD);
  const [user] = await getDb()
    .insert(users)
    .values({
      email: opciones.email,
      name: 'Persona',
      passwordHash: hash,
      role: opciones.role,
      active: opciones.active ?? true,
    })
    .returning();
  return user!;
}

function sesionDe(user: { id: string; email: string; role: 'admin' | 'editor' }) {
  setSessionProviderForTests(() =>
    Promise.resolve({ userId: user.id, email: user.email, role: user.role })
  );
}

async function leer(id: string) {
  const [row] = await getDb().select().from(users).where(eq(users.id, id));
  return row!;
}

describeIntegration('usuarios', () => {
  beforeEach(() => {
    resetBucketsForTests();
    // `signToken` exige `APP_SECRET` y lanza sin él: es un contrato deliberado (M2), no un
    // descuido, así que aquí se le da uno de usar y tirar en vez de relajar la comprobación.
    vi.stubEnv('APP_SECRET', 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres');
  });

  afterEach(() => {
    setSessionProviderForTests(null);
    vi.unstubAllEnvs();
  });

  it('T-81-1: un editor no puede invitar, cambiar rol ni desactivar', async () => {
    const editora = await crearUsuario({ email: 'editora@ejemplo.com', role: 'editor' });
    const otra = await crearUsuario({ email: 'otra@ejemplo.com', role: 'editor' });
    sesionDe(editora);

    expect(
      await inviteUser({ email: 'nueva@ejemplo.com', name: 'Nueva', role: 'editor' })
    ).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await updateUserRole({ userId: otra.id, role: 'admin' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await deactivateUser({ userId: otra.id })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });

    // Y nada de eso ha escrito: sigue siendo editora y solo hay dos cuentas.
    expect((await leer(otra.id)).role).toBe('editor');
    expect(await getDb().select().from(users)).toHaveLength(2);
  });

  it('T-81-2: degradar al último admin falla y no cambia nada', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    await crearUsuario({ email: 'editora@ejemplo.com', role: 'editor' });
    sesionDe(admin);

    const result = await updateUserRole({ userId: admin.id, role: 'editor' });

    expect(result).toMatchObject({ ok: false, code: 'LAST_ADMIN' });
    expect((await leer(admin.id)).role).toBe('admin');
  });

  it('T-81-3: desactivar al último admin falla', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    const otra = await crearUsuario({ email: 'otra@ejemplo.com', role: 'admin' });
    sesionDe(otra);

    // Se degrada a `otra` primero, así que `admin` queda como el único administrador activo.
    await updateUserRole({ userId: otra.id, role: 'editor' });
    sesionDe({ ...otra, role: 'admin' });

    const result = await deactivateUser({ userId: admin.id });

    expect(result).toMatchObject({ ok: false, code: 'LAST_ADMIN' });
    expect((await leer(admin.id)).active).toBe(true);
  });

  it('T-81-3: un admin desactivado no cuenta como administrador', async () => {
    // Contar a un administrador que no puede entrar sería contar a alguien que no administra
    // nada, y dejaría degradar al único que sí puede.
    const activo = await crearUsuario({ email: 'activo@ejemplo.com', role: 'admin' });
    await crearUsuario({ email: 'inactivo@ejemplo.com', role: 'admin', active: false });
    sesionDe(activo);

    const result = await updateUserRole({ userId: activo.id, role: 'editor' });

    expect(result).toMatchObject({ ok: false, code: 'LAST_ADMIN' });
  });

  it('T-81-4: con dos admins, degradar a uno funciona', async () => {
    const primera = await crearUsuario({ email: 'a@ejemplo.com', role: 'admin' });
    const segunda = await crearUsuario({ email: 'b@ejemplo.com', role: 'admin' });
    sesionDe(primera);

    const result = await updateUserRole({ userId: segunda.id, role: 'editor' });

    expect(result.ok).toBe(true);
    expect((await leer(segunda.id)).role).toBe('editor');
  });

  it('T-81-4b: el FOR UPDATE impide que dos degradaciones dejen el sitio sin admins', async () => {
    // **`Promise.all` de dos actions no sirve aquí**: el primero reutiliza la conexión libre
    // del pool y el segundo tiene que abrir una nueva, así que se resuelven en secuencia y el
    // test pasaría igual sin el bloqueo. Comprobado por mutación.
    //
    // Esto fuerza el entrelazado. Sin `FOR UPDATE`, la action cuenta dos administradores,
    // pasa la comprobación, y para cuando escribe el otro ya se ha degradado: cero admins,
    // habiendo pasado las dos comprobaciones. Es el escenario que describe la spec de fase
    // §3.7 y el que hace que "comprobar dentro de la transacción" no baste.
    const primera = await crearUsuario({ email: 'a@ejemplo.com', role: 'admin' });
    const segunda = await crearUsuario({ email: 'b@ejemplo.com', role: 'admin' });
    sesionDe(primera);

    const db = getDb();
    let soltar!: () => void;
    const bloqueo = new Promise<void>((resolve) => {
      soltar = resolve;
    });

    const otra = db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`${users.role} = 'admin' and ${users.active} = true`)
        .for('update');

      await bloqueo;

      // Lo que haría la otra administradora degradándose a sí misma.
      await tx.update(users).set({ role: 'editor' }).where(eq(users.id, primera.id));
    });

    const degradacion = updateUserRole({ userId: segunda.id, role: 'editor' });

    // Margen para que la action llegue a su consulta antes de soltar el bloqueo.
    await new Promise((resolve) => setTimeout(resolve, 300));
    soltar();
    await otra;

    // Con el bloqueo, cuenta **después** y ve que solo queda una.
    expect(await degradacion).toMatchObject({ ok: false, code: 'LAST_ADMIN' });

    const adminsActivos = (await getDb().select().from(users)).filter(
      (row) => row.role === 'admin' && row.active
    );
    expect(adminsActivos).toHaveLength(1);
  });

  it('T-81-5: changePassword exige la actual', async () => {
    const editora = await crearUsuario({ email: 'e@ejemplo.com', role: 'editor' });
    sesionDe(editora);

    const result = await changePassword({
      currentPassword: 'la-que-no-es-pero-es-larga',
      newPassword: 'otra-contrasena-larga-valida',
    });

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect((await leer(editora.id)).passwordHash).toBe(editora.passwordHash);
  });

  it('T-81-5: changePassword aplica la política', async () => {
    const editora = await crearUsuario({ email: 'e@ejemplo.com', role: 'editor' });
    sesionDe(editora);

    const result = await changePassword({ currentPassword: PASSWORD, newPassword: 'corta' });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    // Y el mensaje dice el motivo, en español llano: sin él, el editor prueba a ciegas.
    expect(result.ok === false && result.message.length).toBeGreaterThan(10);
    expect((await leer(editora.id)).passwordHash).toBe(editora.passwordHash);
  });

  it('T-81-6: changePassword invalida las sesiones abiertas', async () => {
    const editora = await crearUsuario({ email: 'e@ejemplo.com', role: 'editor' });
    sesionDe(editora);

    // La sesión que ya estaba abierta, con la versión de antes.
    expect(await isSessionStillValid(editora.id, 0)).toBe(true);

    const result = await changePassword({
      currentPassword: PASSWORD,
      newPassword: 'una-contrasena-nueva-y-larga',
    });

    expect(result.ok).toBe(true);
    // Es lo que hace cualquiera al sospechar que le han entrado. Sin esto, quien entró sigue
    // dentro siete días (ADR-301).
    expect(await isSessionStillValid(editora.id, 0)).toBe(false);
  });

  it('T-81-6: y la contraseña nueva sirve para entrar', async () => {
    const editora = await crearUsuario({ email: 'e@ejemplo.com', role: 'editor' });
    sesionDe(editora);

    await changePassword({
      currentPassword: PASSWORD,
      newPassword: 'una-contrasena-nueva-y-larga',
    });

    const login = await authenticate({
      email: 'e@ejemplo.com',
      password: 'una-contrasena-nueva-y-larga',
    });
    expect(login.ok).toBe(true);
  });

  it('T-81-7: inviteUser no devuelve la contraseña generada', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    sesionDe(admin);

    const result = await inviteUser({
      email: 'Nueva@Ejemplo.com',
      name: 'Nueva',
      role: 'editor',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // La cuenta nace con una contraseña aleatoria que no sale de aquí. Devolverla la dejaría
    // en la auditoría, en los logs y en el historial del navegador de quien invita.
    expect(Object.keys(result.data)).toEqual(['userId', 'email', 'token']);
    // El token sí, porque es su propósito: es la única forma de entrar y caduca.
    expect(verifyToken('password-reset', result.data.token).ok).toBe(true);
  });

  it('T-81-7: el token de invitación no vale para otro propósito', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    sesionDe(admin);

    const result = await inviteUser({ email: 'n@ejemplo.com', name: 'N', role: 'editor' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // El propósito va dentro de la firma: un token de invitación no es un token de bootstrap.
    expect(verifyToken('setup', result.data.token).ok).toBe(false);
    expect(verifyToken('preview', result.data.token).ok).toBe(false);
  });

  it('degradar a un administrador le cierra la sesión en el acto', async () => {
    // El rol viaja dentro del JWT y Auth.js solo lo escribe al iniciar sesión: en las
    // peticiones siguientes comprueba que la sesión siga viva, no qué rol tiene ahora. Sin
    // invalidarla, la persona degradada conserva `role: 'admin'` en su cookie y sigue
    // pudiendo invitar, cambiar roles y desactivar cuentas durante siete días — y degradar es
    // justo lo que se hace cuando alguien deja de ser de confianza.
    const primera = await crearUsuario({ email: 'a@ejemplo.com', role: 'admin' });
    const segunda = await crearUsuario({ email: 'b@ejemplo.com', role: 'admin' });
    sesionDe(primera);

    expect(await isSessionStillValid(segunda.id, 0)).toBe(true);

    const result = await updateUserRole({ userId: segunda.id, role: 'editor' });
    expect(result.ok).toBe(true);

    expect(await isSessionStillValid(segunda.id, 0)).toBe(false);
  });

  it('promover a alguien también le cierra la sesión', async () => {
    // Por el mismo motivo, y aquí además le hace falta: sin volver a entrar, su cookie sigue
    // diciendo `editor` y el panel de administración le seguiría cerrado.
    const admin = await crearUsuario({ email: 'a@ejemplo.com', role: 'admin' });
    const editora = await crearUsuario({ email: 'b@ejemplo.com', role: 'editor' });
    sesionDe(admin);

    await updateUserRole({ userId: editora.id, role: 'admin' });

    expect(await isSessionStillValid(editora.id, 0)).toBe(false);
  });

  it('el token de invitación lleva la versión de contraseña de la fila creada', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    sesionDe(admin);

    const result = await inviteUser({ email: 'n@ejemplo.com', name: 'N', role: 'editor' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const verificado = verifyToken('password-reset', result.data.token);
    expect(verificado.ok).toBe(true);
    if (!verificado.ok) return;

    const [creado] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, verificado.data['userId']!));

    // Escrito a mano, esto valdría hasta el día que la invitación tocara esa columna, y el
    // fallo aparecería al canjear el token, lejos de donde se creó.
    expect(verificado.data['pwdV']).toBe(String(creado!.passwordVersion));
  });

  it('inviteUser normaliza el correo y rechaza duplicados sin distinguir mayúsculas', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    sesionDe(admin);

    await inviteUser({ email: 'Nueva@Ejemplo.com', name: 'Nueva', role: 'editor' });
    const repetida = await inviteUser({ email: 'NUEVA@ejemplo.COM', name: 'Otra', role: 'editor' });

    expect(repetida).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await getDb().select().from(users)).toHaveLength(2);
  });

  it('la auditoría de la invitación no lleva el token', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    sesionDe(admin);

    const result = await inviteUser({ email: 'n@ejemplo.com', name: 'N', role: 'editor' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { auditLog } = await import('@/cms/db');
    const filas = await getDb().select().from(auditLog);
    // El token es una credencial: en la tabla de auditoría sería una puerta abierta a quien
    // pueda leerla.
    expect(JSON.stringify(filas)).not.toContain(result.data.token);
    expect(filas[0]?.meta).toMatchObject({ email: 'n@ejemplo.com' });
  });

  it('un usuario desactivado no puede entrar', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    const otra = await crearUsuario({ email: 'otra@ejemplo.com', role: 'editor' });
    sesionDe(admin);

    await deactivateUser({ userId: otra.id });

    // Sin esto, desactivar es poner un cartel en la puerta en vez de cerrarla.
    const login = await authenticate({ email: 'otra@ejemplo.com', password: PASSWORD });
    expect(login.ok).toBe(false);
  });

  it('desactivar expulsa la sesión que ya estaba abierta', async () => {
    const admin = await crearUsuario({ email: 'admin@ejemplo.com', role: 'admin' });
    const otra = await crearUsuario({ email: 'otra@ejemplo.com', role: 'editor' });
    sesionDe(admin);

    expect(await isSessionStillValid(otra.id, 0)).toBe(true);

    await deactivateUser({ userId: otra.id });

    // Sin esto, la persona que acabas de desactivar sigue trabajando siete días.
    expect(await isSessionStillValid(otra.id, 0)).toBe(false);
  });

  it('un admin no puede desactivarse a sí mismo', async () => {
    const admin = await crearUsuario({ email: 'a@ejemplo.com', role: 'admin' });
    await crearUsuario({ email: 'b@ejemplo.com', role: 'admin' });
    sesionDe(admin);

    const result = await deactivateUser({ userId: admin.id });

    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect((await leer(admin.id)).active).toBe(true);
  });

  it('desactivar dos veces no es un error', async () => {
    const admin = await crearUsuario({ email: 'a@ejemplo.com', role: 'admin' });
    const otra = await crearUsuario({ email: 'b@ejemplo.com', role: 'editor' });
    sesionDe(admin);

    await deactivateUser({ userId: otra.id });
    const segunda = await deactivateUser({ userId: otra.id });

    // Idempotente: el estado que se pedía ya está, así que no hay nada que corregir ni nada
    // que explicarle a quien pulsó.
    expect(segunda.ok).toBe(true);
  });

  it('un usuario que no existe da NOT_FOUND', async () => {
    const admin = await crearUsuario({ email: 'a@ejemplo.com', role: 'admin' });
    sesionDe(admin);

    const inexistente = '00000000-0000-4000-8000-000000000000';
    expect(await updateUserRole({ userId: inexistente, role: 'editor' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(await deactivateUser({ userId: inexistente })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });
});
