import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb, users } from '@/cms/db';
import { audit } from '@/cms/security/audit';

/**
 * Entrar con Google (ADR-900, spec 13).
 *
 * Vive aparte de `authenticate.ts` por la misma razón por la que aquel vive aparte de la
 * configuración de Auth.js: esto es lo que hay que poder ejercitar —las tres puertas, la
 * identidad que acaba en la sesión— sin levantar media librería de OAuth.
 *
 * ## La regla de este fichero, que es de seguridad
 *
 * **Google autentica, no autoriza.** Sustituye a la contraseña, no a la invitación. De Google
 * salen exactamente dos datos —el correo y si Google lo da por verificado— y **todo lo demás
 * sale de la fila de `users`**: el identificador, el nombre, el rol y la versión de contraseña.
 *
 * No es purismo. Nuestro `id` es la clave de la que cuelgan `audit_log.actor_id`,
 * `content_entries.updated_by`, `media.uploaded_by` y los guards de rol; un identificador que
 * venga de fuera los apuntaría a un usuario que no existe. Y un `role` que viniera del perfil
 * sería un rol que decide quien entra, no quien administra.
 *
 * ## Por qué no hay tabla de cuentas vinculadas
 *
 * Porque la sesión es JWT y no hay adaptador de base de datos: Auth.js no persiste nada del
 * proveedor, así que no hay nada que guardar. La correspondencia es por correo y punto — con lo
 * que eso implica y está dicho en spec 13 §9: cambiar el correo en el panel cambia con qué
 * cuenta de Google se entra.
 */

/** Los tres motivos por los que se rechaza. La pantalla solo muestra uno (ADR-902). */
export type MotivoDeRechazo = 'correo-sin-verificar' | 'cuenta-inexistente' | 'cuenta-desactivada';

/** Lo único que se toma del perfil que devuelve Google. */
export interface PerfilDeGoogle {
  readonly email: string;
  /** `email_verified` de Google. La primera puerta de spec 13 §3. */
  readonly emailVerificado: boolean;
}

/** La fila de `users`, con lo justo para decidir y para construir la sesión. */
export interface CuentaDelPanel {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'admin' | 'editor';
  readonly passwordVersion: number;
  readonly active: boolean;
}

export interface UsuarioDeGoogle {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'admin' | 'editor';
  readonly passwordVersion: number;
}

export type AccesoDeGoogle =
  | { readonly ok: true; readonly usuario: UsuarioDeGoogle }
  | { readonly ok: false; readonly motivo: MotivoDeRechazo };

/**
 * Las dos variables, leídas **literales**.
 *
 * Escritas enteras y no por una clave calculada, que es la misma precaución que toma el
 * middleware con `PREVIEW_ORIGINS`: los empaquetadores sustituyen `process.env.ALGO` cuando lo
 * ven literal y no cuando lo ven como `entorno[clave]`. Aquí el código nunca llega al
 * navegador, así que hoy no muerde; cuesta nada y cubre el día que el empaquetado sea otro.
 */
function delEntorno(): Record<string, string | undefined> {
  return {
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
  };
}

export interface CredencialesDeGoogle {
  readonly id: string;
  readonly secreto: string;
}

/**
 * Las credenciales, o `null` si Google no está configurado.
 *
 * **Hacen falta las dos.** Con una sola definida se devuelve `null` y Google queda apagado
 * entero, que es la regla de ADR-900 y la misma de `PREVIEW_ORIGINS` en ADR-701: media
 * configuración que funciona a medias falla al pulsar el botón —delante de quien lo pulsa— en
 * vez de al arrancar, que es la peor forma de fallar.
 *
 * Una cadena vacía cuenta como no definida. En Vercel una variable creada y sin rellenar llega
 * exactamente así, y tratarla como un valor daría un cliente de OAuth con el identificador
 * vacío: el botón aparecería y llevaría a un error de Google.
 */
export function credencialesDeGoogle(
  entorno: Record<string, string | undefined> = delEntorno()
): CredencialesDeGoogle | null {
  const id = entorno['AUTH_GOOGLE_ID'];
  const secreto = entorno['AUTH_GOOGLE_SECRET'];

  if (id === undefined || id === '') return null;
  if (secreto === undefined || secreto === '') return null;

  return { id, secreto };
}

/**
 * **No hay aquí una función «¿está Google disponible?»**, y es a propósito.
 *
 * La hubo, y la autorrevisión de #233 la quitó. El problema era que leía el entorno **vivo**
 * mientras la lista de proveedores se congela al cargar `cms/auth/index.ts`: la pantalla decía
 * una cosa y la configuración otra, y en la dirección mala — el botón pintado sobre un proveedor
 * que no existe.
 *
 * Quien necesite saberlo usa `ACCESO_CON_GOOGLE_DISPONIBLE` de `cms/auth`, que sale de la
 * **misma** lectura que decidió los proveedores. Dejar aquí una segunda forma de preguntarlo
 * sería dejar que la discrepancia siguiera siendo posible, solo que menos probable.
 */

/**
 * Las tres puertas de spec 13 §3, sin tocar nada de fuera.
 *
 * Está separada de la consulta a propósito: es la decisión de seguridad entera, y así se puede
 * escribir un caso por puerta sin base de datos de por medio.
 *
 * ## Lo que NO mira, y es una decisión escrita
 *
 * **El bloqueo por intentos fallidos** (`locked_until`). Está en ADR-901: el bloqueo defiende
 * la contraseña de que la adivinen a base de intentos, y por aquí no pasa ninguna contraseña.
 * Mirarlo dejaría además que cualquiera eche a otro del panel entero tecleando cinco
 * contraseñas malas con su correo.
 *
 * `active`, en cambio, sí se mira: el bloqueo se levanta solo con el tiempo, y una
 * desactivación es la decisión de una persona.
 */
export function decidirAcceso(entrada: {
  readonly emailVerificado: boolean;
  readonly cuenta: CuentaDelPanel | undefined;
}): AccesoDeGoogle {
  if (!entrada.emailVerificado) return { ok: false, motivo: 'correo-sin-verificar' };
  if (entrada.cuenta === undefined) return { ok: false, motivo: 'cuenta-inexistente' };
  if (!entrada.cuenta.active) return { ok: false, motivo: 'cuenta-desactivada' };

  return {
    ok: true,
    usuario: {
      id: entrada.cuenta.id,
      email: entrada.cuenta.email,
      name: entrada.cuenta.name,
      role: entrada.cuenta.role,
      passwordVersion: entrada.cuenta.passwordVersion,
    },
  };
}

/**
 * Busca la cuenta por correo, sin distinguir mayúsculas.
 *
 * Por `lower(email)`, que es el índice único de ADR-201. Buscar por igualdad directa no
 * fallaría: sencillamente no encontraría a quien tiene el correo guardado con una mayúscula, y
 * eso es un fallo silencioso — la persona existe, está activa, y el panel le dice que no puede
 * entrar.
 */
async function buscarCuentaPorCorreo(email: string): Promise<CuentaDelPanel | undefined> {
  const filas = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      passwordVersion: users.passwordVersion,
      active: users.active,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  const fila = filas[0];
  if (fila === undefined) return undefined;

  // La columna es `text` con un `CHECK` (ADR-203), así que lo que llega tipado es `string`. Se
  // estrecha aquí y no se deja que el rol viaje como una cadena cualquiera hasta la sesión.
  return { ...fila, role: fila.role === 'admin' ? 'admin' : 'editor' };
}

export interface OpcionesDeAcceso {
  /** Inyectable para poder **contar** las consultas en el caso T-233-5, no para producción. */
  readonly buscarCuenta?: (email: string) => Promise<CuentaDelPanel | undefined>;
  readonly registrar?: typeof audit;
}

/**
 * El acceso con Google, de principio a fin.
 *
 * El orden de las dos primeras líneas es el caso T-233-5 y no es cosmético: si Google no da el
 * correo por verificado, **no se consulta la base de datos**. Preguntar por un correo que no se
 * sabe de quién es no aporta nada y sí convierte esta ruta en algo que consulta `users` con lo
 * que le manden.
 */
export async function autenticarConGoogle(
  perfil: PerfilDeGoogle,
  opciones: OpcionesDeAcceso = {}
): Promise<AccesoDeGoogle> {
  const buscar = opciones.buscarCuenta ?? buscarCuentaPorCorreo;
  const registrar = opciones.registrar ?? audit;
  const email = perfil.email.trim().toLowerCase();

  const cuenta = perfil.emailVerificado ? await buscar(email) : undefined;
  const resultado = decidirAcceso({ emailVerificado: perfil.emailVerificado, cuenta });

  if (!resultado.ok) {
    await registrar({
      action: 'login.fail',
      // `actorId` solo cuando se sabe de quién es la fila. En los otros dos motivos no hay
      // fila que señalar, y poner el identificador del perfil de Google sería inventarse un
      // actor que no existe en `users`.
      ...(cuenta === undefined ? {} : { actorId: cuenta.id }),
      actorEmail: email,
      meta: { proveedor: 'google', motivo: resultado.motivo },
    });

    return resultado;
  }

  await registrar({
    action: 'login.success',
    actorId: resultado.usuario.id,
    actorEmail: resultado.usuario.email,
    meta: { proveedor: 'google' },
  });

  return resultado;
}
