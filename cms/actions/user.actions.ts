'use server';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '@/cms/auth/passwords';
import { getDb, users } from '@/cms/db';
import { signToken } from '@/cms/security/tokens';
import { defineAction, fail, ok } from './pipeline';

/**
 * Server Actions de usuarios (SPEC §5.3).
 *
 * La regla que gobierna este fichero es `LAST_ADMIN`: **el sistema no puede quedarse sin
 * ningún administrador**. Si ocurriera, nadie podría invitar, cambiar roles ni reactivar
 * cuentas, y no habría forma de arreglarlo desde la interfaz — solo entrando a la base de
 * datos a mano. Por eso la comprobación no está en la interfaz sino aquí, y por eso no basta
 * con contar antes de escribir.
 */

/**
 * Cuenta los administradores activos **bloqueando sus filas**.
 *
 * El `FOR UPDATE` es la parte que no se puede quitar, y suena innecesaria hasta que se piensa
 * en dos peticiones a la vez: con `READ COMMITTED`, que es el nivel por defecto de Postgres,
 * dos transacciones que degraden a dos administradores distintos cuentan **dos** cada una,
 * ninguna ve a la otra, las dos pasan la comprobación y el sistema acaba sin
 * administradores. El bloqueo las serializa, y la segunda ve el resultado de la primera.
 *
 * Se cuentan solo los **activos**: un administrador desactivado no puede entrar, así que
 * contarlo sería contar a alguien que no puede administrar nada.
 */
async function countActiveAdmins(tx: {
  select: ReturnType<typeof getDb>['select'];
}): Promise<string[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.role} = 'admin' and ${users.active} = true`)
    .for('update');

  return rows.map((row) => row.id);
}

/**
 * Si un error de Postgres es una violación de unicidad (`23505`).
 *
 * Se mira el código y no el mensaje: el mensaje cambia con la versión y con el idioma del
 * servidor, y encadenar la respuesta a un texto es encadenarla a algo que no controlamos.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
  );
}

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email()
  // Se normaliza aquí para que la comprobación de duplicados y el índice único de ADR-201
  // —que es sobre `lower(email)`— miren lo mismo.
  .transform((value) => value.toLowerCase());

export const inviteUser = defineAction({
  name: 'user.invite',
  role: 'admin',
  bucket: 'admin',
  input: z.object({
    email: emailSchema,
    name: z.string().trim().min(1).max(120),
    role: z.enum(['admin', 'editor']),
  }),
  targetType: 'user',
  handler: async (input) => {
    const db = getDb();

    const [existente] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);

    // Un administrador ya autenticado puede ver la lista de usuarios, así que decirle que
    // ese correo ya existe no filtra nada que no pueda mirar.
    if (existente !== undefined) {
      return fail('CONFLICT', 'Ya hay una cuenta con ese correo.');
    }

    // La cuenta nace con una contraseña **aleatoria que no se devuelve nunca**. No es un
    // trámite: si se devolviera, quedaría en el registro de auditoría, en los logs del
    // servidor y en el historial del navegador de quien invita. La forma de entrar es el
    // token, que caduca.
    const passwordHash = await hashPassword(crypto.randomUUID() + crypto.randomUUID());

    let creado: { id: string; email: string; passwordVersion: number } | undefined;
    try {
      [creado] = await db
        .insert(users)
        .values({
          email: input.email,
          name: input.name,
          passwordHash,
          role: input.role,
          active: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          passwordVersion: users.passwordVersion,
        });
    } catch (error) {
      // La comprobación de arriba y esta inserción no son atómicas: dos invitaciones
      // simultáneas del mismo correo pasan las dos y la segunda choca con el índice único de
      // ADR-201. Los datos están a salvo —el índice es la garantía de verdad— pero quien
      // invita merece el mismo mensaje que en el camino normal y no un error genérico.
      if (isUniqueViolation(error)) {
        return fail('CONFLICT', 'Ya hay una cuenta con ese correo.');
      }
      throw error;
    }

    // Token de un solo uso de 24 h (SPEC §10.2: sin correo en el MVP, el administrador lo
    // comparte a mano). Es de un solo uso porque establecer la contraseña incrementa
    // `password_version`, y la versión va dentro del payload firmado.
    //
    // El valor sale de la fila recién insertada y no escrito a mano: hoy es 0 siempre, y
    // fijarlo aquí sería un acoplamiento que se rompería en silencio el día que la invitación
    // tocara esa columna, con el fallo apareciendo al canjear el token, lejos de aquí.
    const token = signToken('password-reset', {
      userId: creado!.id,
      pwdV: String(creado!.passwordVersion),
    });

    return ok({ userId: creado!.id, email: creado!.email, token });
  },
  // El token **no** entra en la auditoría: es una credencial. Lo que interesa registrar es a
  // quién se invitó.
  auditMeta: (output) => ({ userId: output.userId, email: output.email }),
});

export const updateUserRole = defineAction({
  name: 'user.updateRole',
  role: 'admin',
  bucket: 'admin',
  input: z.object({ userId: z.string().uuid(), role: z.enum(['admin', 'editor']) }),
  targetType: 'user',
  targetId: (input) => input.userId,
  handler: async (input) => {
    const db = getDb();

    return db.transaction(async (tx) => {
      const admins = await countActiveAdmins(tx);

      const [objetivo] = await tx
        .select({ id: users.id, role: users.role, active: users.active })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (objetivo === undefined) return fail('NOT_FOUND');

      const degradaAlUltimo =
        objetivo.role === 'admin' &&
        input.role !== 'admin' &&
        objetivo.active &&
        admins.length <= 1;

      if (degradaAlUltimo) return fail('LAST_ADMIN');

      await tx
        .update(users)
        .set({
          role: input.role,
          // **Y se le cierra la sesión.** El rol viaja dentro del JWT y el callback de
          // Auth.js solo lo escribe al iniciar sesión: en las peticiones siguientes
          // comprueba que la sesión siga viva, no qué rol tiene ahora. Sin esto, alguien a
          // quien acabas de degradar conserva `role: 'admin'` en su cookie y sigue pudiendo
          // invitar, cambiar roles y desactivar cuentas durante los siete días que dura la
          // sesión — y degradar es justo lo que se hace cuando alguien deja de ser de
          // confianza.
          //
          // Es el mismo agujero que ADR-301 cerró para las contraseñas, aplicado al rol.
          passwordVersion: sql`${users.passwordVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId));

      return ok({ userId: input.userId, role: input.role });
    });
  },
});

export const deactivateUser = defineAction({
  name: 'user.deactivate',
  role: 'admin',
  bucket: 'admin',
  input: z.object({ userId: z.string().uuid() }),
  targetType: 'user',
  targetId: (input) => input.userId,
  handler: async (input, session) => {
    // Desactivarse a uno mismo deja al administrador fuera de su propio panel en el acto. No
    // es una protección de seguridad —podría hacerlo con otra cuenta— sino de producto: no
    // hay ninguna razón para permitir un clic cuyo único efecto es echarte.
    if (input.userId === session.userId) {
      return fail('CONFLICT', 'No puedes desactivar tu propia cuenta.');
    }

    const db = getDb();

    return db.transaction(async (tx) => {
      const admins = await countActiveAdmins(tx);

      const [objetivo] = await tx
        .select({ id: users.id, role: users.role, active: users.active })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (objetivo === undefined) return fail('NOT_FOUND');
      if (!objetivo.active) return ok({ userId: input.userId });

      if (objetivo.role === 'admin' && admins.length <= 1) return fail('LAST_ADMIN');

      await tx
        .update(users)
        .set({
          active: false,
          // **Y se le expulsa.** Sin incrementar la versión, la persona que acabas de
          // desactivar sigue trabajando con su sesión abierta hasta que caduque sola, siete
          // días después (ADR-301). Desactivar sin esto es poner un cartel, no cerrar la
          // puerta.
          passwordVersion: sql`${users.passwordVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId));

      return ok({ userId: input.userId });
    });
  },
});

export const changePassword = defineAction({
  name: 'user.changePassword',
  // Rol `editor`: cualquiera cambia **la suya**. El objetivo sale de la sesión y no del
  // input, así que no hay forma de cambiar la de otra persona.
  role: 'editor',
  bucket: 'admin',
  input: z.object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(1).max(1024),
  }),
  targetType: 'user',
  handler: async (input, session) => {
    const db = getDb();

    const [usuario] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (usuario === undefined) return fail('UNAUTHORIZED');

    // La actual **primero**. Al revés, decir "esa contraseña es demasiado corta" antes de
    // comprobar quién eres deja que alguien con la sesión robada tantee políticas sin
    // conocer la contraseña — y, sobre todo, la contraseña actual es lo que autoriza el
    // cambio, así que es lo primero que hay que exigir.
    if (!(await verifyPassword(usuario.passwordHash, input.currentPassword))) {
      return fail('FORBIDDEN', 'La contraseña actual no es correcta.');
    }

    const politica = checkPasswordPolicy(input.newPassword);
    if (!politica.ok) return fail('VALIDATION_FAILED', politica.reason);

    const passwordHash = await hashPassword(input.newPassword);

    await db
      .update(users)
      .set({
        passwordHash,
        // Cambiar la contraseña expulsa todas las sesiones, incluida la actual (ADR-301).
        // Es lo que hace cualquiera al sospechar que le han entrado, y sin esto no serviría
        // de nada durante siete días.
        passwordVersion: sql`${users.passwordVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    return ok({ sessionsInvalidated: true });
  },
});
