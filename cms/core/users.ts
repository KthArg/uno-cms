import 'server-only';
import { asc } from 'drizzle-orm';
import { getDb, users } from '@/cms/db';

/**
 * Lectura de las cuentas, para la pantalla de personas (SPEC §3, §9).
 *
 * Vive en `cms/core` y no en `cms/actions` por la misma razón que `settings.ts`: **leer no es
 * mutar**, y el test T-75-6 exige que todo lo exportado desde `cms/actions` pase por el
 * envoltorio de rol y límite. Quien protege esta lectura es la propia página, que es de
 * `admin`.
 */

export interface PersonaDelPanel {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: 'admin' | 'editor';
  readonly activa: boolean;
  /**
   * Si la cuenta todavía no ha entrado nunca.
   *
   * Se deduce de `passwordVersion === 0`: la contraseña que pone `inviteUser` es aleatoria y no
   * la conoce nadie, así que hasta que alguien canjea la invitación —lo que sube la versión— la
   * cuenta existe pero no se ha usado. Sirve para que quien administra sepa a quién le falta
   * todavía compartir su enlace.
   *
   * Es una deducción, no un hecho registrado: quien canjea y nunca llega a entrar aparecería
   * como que sí. La alternativa era una columna `last_login_at`, que `SPEC.md` §4 no contempla
   * y que obligaría a escribir en cada acceso.
   */
  readonly sinEstrenar: boolean;
}

/**
 * Todas las cuentas, por nombre.
 *
 * Sin paginar: `SPEC.md` describe el equipo de una landing, que son unas pocas personas. Está
 * anotado en `docs/PENDIENTES.md` junto al mismo caso de las colecciones.
 */
export async function listUsers(): Promise<PersonaDelPanel[]> {
  const filas = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      passwordVersion: users.passwordVersion,
    })
    .from(users)
    .orderBy(asc(users.name), asc(users.email));

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.name,
    correo: fila.email,
    // La columna es `text` con un CHECK (M1), así que el tipo que llega es `string`. Se
    // estrecha aquí en vez de dejar que la pantalla reciba cualquier cadena.
    rol: fila.role === 'admin' ? 'admin' : 'editor',
    activa: fila.active,
    sinEstrenar: fila.passwordVersion === 0,
  }));
}
