import 'server-only';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb, users, type UserRow } from '@/cms/db';
import {
  cifrarSecreto,
  descifrarSecreto,
  generarCodigosDeRecuperacion,
  generarSecreto,
  huellaDeRecuperacion,
  pareceDeRecuperacion,
  verificarTotp,
} from '@/cms/segundo-factor';

/**
 * La verificación en dos pasos contra la base de datos (spec 20).
 *
 * Las piezas puras —TOTP, cifrado, códigos— están en `cms/segundo-factor.ts`. Aquí está lo que
 * necesita una fila: comprobar un código **gastándolo**, dar de alta y regenerar los códigos de
 * recuperación. Cada «gastar» es una sola sentencia condicionada, por lo mismo que la reserva de
 * intentos (ADR-1301): dos peticiones a la vez con el mismo código no pueden entrar las dos.
 */

function appSecret(): string {
  return process.env['APP_SECRET'] ?? '';
}

export type ResultadoDelSegundoFactor =
  | { readonly resultado: 'ok' }
  | { readonly resultado: 'recuperacion' }
  | { readonly resultado: 'sin-alta' }
  | { readonly resultado: 'falla' };

const FALLA: ResultadoDelSegundoFactor = { resultado: 'falla' };

/**
 * Comprueba el segundo factor de una cuenta cuya contraseña ya es buena, y **gasta** lo usado.
 *
 * - Sin 2FA activada: `sin-alta`. Entra, pero a una sesión que solo sirve para darla de alta.
 * - Un código de recuperación: se quita de la lista en la misma sentencia que lo comprueba.
 * - Un código de la app: se guarda su paso, y solo vale si es posterior al último aceptado.
 *
 * Un secreto que no se puede descifrar —un `APP_SECRET` cambiado— es `falla`, no `sin-alta`:
 * tratarlo como «no tiene 2FA» dejaría entrar con la contraseña sola a quien sí la tenía.
 */
export async function comprobarSegundoFactor(
  user: Pick<UserRow, 'id' | 'totpSecret' | 'totpActivadoEn'>,
  codigo: string | undefined,
  now: Date
): Promise<ResultadoDelSegundoFactor> {
  if (user.totpActivadoEn === null) return { resultado: 'sin-alta' };

  const escrito = (codigo ?? '').trim();
  if (escrito === '' || user.totpSecret === null) return FALLA;

  if (pareceDeRecuperacion(escrito)) {
    const huella = huellaDeRecuperacion(escrito);
    const [gastado] = await getDb()
      .update(users)
      .set({
        codigosRecuperacion: sql`array_remove(${users.codigosRecuperacion}, ${huella})`,
        updatedAt: now,
      })
      .where(and(eq(users.id, user.id), sql`${huella} = any(${users.codigosRecuperacion})`))
      .returning({ id: users.id });
    return gastado === undefined ? FALLA : { resultado: 'recuperacion' };
  }

  let secreto: string;
  try {
    secreto = descifrarSecreto(user.totpSecret, appSecret());
  } catch (error) {
    console.error('[2fa] no se ha podido descifrar el secreto de una cuenta', error);
    return FALLA;
  }

  const paso = verificarTotp(secreto, escrito, now);
  if (paso === null) return FALLA;

  const [aceptado] = await getDb()
    .update(users)
    .set({ totpUltimoPaso: paso, updatedAt: now })
    .where(
      and(eq(users.id, user.id), or(isNull(users.totpUltimoPaso), lt(users.totpUltimoPaso, paso)))
    )
    .returning({ id: users.id });

  return aceptado === undefined ? FALLA : { resultado: 'ok' };
}

// ── El alta ─────────────────────────────────────────────────────────────────────────────────

/**
 * El secreto pendiente de una cuenta que todavía no tiene 2FA, creándolo si no hay ninguno.
 *
 * Se guarda **cifrado y sin activar** antes de enseñarlo, para que el código que escriba después
 * se compare con algo que está en la base y no con algo que viaja en el formulario. Si la cuenta
 * ya la tiene activada devuelve `null`: un alta nueva pisaría el secreto de su móvil (T-V-13).
 */
export async function secretoPendiente(userId: string): Promise<string | null> {
  const db = getDb();
  const [fila] = await db
    .select({ totpSecret: users.totpSecret, totpActivadoEn: users.totpActivadoEn })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (fila === undefined || fila.totpActivadoEn !== null) return null;

  if (fila.totpSecret !== null) {
    try {
      return descifrarSecreto(fila.totpSecret, appSecret());
    } catch {
      // Un pendiente que no se puede leer se sustituye: todavía no protege nada.
    }
  }

  const secreto = generarSecreto();
  const [guardado] = await db
    .update(users)
    .set({ totpSecret: cifrarSecreto(secreto, appSecret()), updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.totpActivadoEn)))
    .returning({ id: users.id });

  return guardado === undefined ? null : secreto;
}

/**
 * Confirma el alta con un código del secreto pendiente. Devuelve los diez códigos de recuperación
 * **en claro**, la única vez que existen así, o `null` si el código no vale (T-V-12).
 *
 * La activación va condicionada a `totp_activado_en is null`: dos confirmaciones a la vez no
 * generan dos juegos de códigos.
 */
export async function confirmarAlta(
  userId: string,
  codigo: string,
  now: Date = new Date()
): Promise<string[] | null> {
  const secreto = await secretoPendiente(userId);
  if (secreto === null) return null;

  const paso = verificarTotp(secreto, codigo, now);
  if (paso === null) return null;

  const codigos = generarCodigosDeRecuperacion();
  const [activada] = await getDb()
    .update(users)
    .set({
      totpActivadoEn: now,
      totpUltimoPaso: paso,
      codigosRecuperacion: codigos.map(huellaDeRecuperacion),
      updatedAt: now,
    })
    .where(and(eq(users.id, userId), isNull(users.totpActivadoEn)))
    .returning({ id: users.id });

  return activada === undefined ? null : codigos;
}

/**
 * Códigos de recuperación nuevos, a cambio de un código válido de la app (T-V-17). Los viejos dejan
 * de valer en la misma sentencia.
 */
export async function regenerarCodigos(
  userId: string,
  codigo: string,
  now: Date = new Date()
): Promise<string[] | null> {
  const [fila] = await getDb()
    .select({
      id: users.id,
      totpSecret: users.totpSecret,
      totpActivadoEn: users.totpActivadoEn,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (fila === undefined || fila.totpActivadoEn === null) return null;
  // Solo un código de la app: uno de recuperación no sirve para fabricar diez más.
  if (pareceDeRecuperacion(codigo)) return null;

  const comprobado = await comprobarSegundoFactor(fila, codigo, now);
  if (comprobado.resultado !== 'ok') return null;

  const codigos = generarCodigosDeRecuperacion();
  await getDb()
    .update(users)
    .set({ codigosRecuperacion: codigos.map(huellaDeRecuperacion), updatedAt: now })
    .where(eq(users.id, userId));
  return codigos;
}

/** Cuántos códigos de recuperación le quedan. Para avisar antes de que se acaben. */
export async function codigosRestantes(userId: string): Promise<number> {
  const [fila] = await getDb()
    .select({ codigos: users.codigosRecuperacion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return fila?.codigos.length ?? 0;
}
