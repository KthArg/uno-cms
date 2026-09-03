import 'server-only';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { authenticate, isSessionStillValid } from './authenticate';
import { type AccesoDeGoogle, autenticarConGoogle, credencialesDeGoogle } from './google';

/**
 * Configuración de Auth.js (SPEC ADR-004).
 *
 * Este fichero es **pegamento**: toda la lógica de seguridad —lockout, señuelo contra
 * enumeración, contadores, invalidación de sesión— vive en `authenticate.ts`, que se
 * ejercita contra una base de datos real sin levantar nada de Auth.js. Aquí solo se conecta
 * con las cookies.
 *
 * Esa separación no es estética: si el lockout viviera dentro del proveedor de credenciales,
 * probarlo exigiría montar media librería, y lo que cuesta probar se acaba probando poco.
 */

/** SPEC §7.1: cookies httpOnly, Secure, SameSite=Lax; sesión de 7 días. */
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * El JWT que viaja en la cookie.
 *
 * `pwdV` es el claim de ADR-301: sin él, cambiar la contraseña no expulsa a nadie hasta que
 * la sesión caduque sola, siete días después.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'editor';
    };
  }
}

/**
 * Las credenciales de Google, leídas **una vez**, al cargar el módulo.
 *
 * Y eso tiene una consecuencia que conviene saber: definir las variables en un despliegue ya
 * arrancado no enciende Google hasta que el proceso se reinicia. En Vercel eso pasa solo —
 * cambiar una variable de entorno vuelve a desplegar— y en un servidor propio hay que
 * reiniciar. Es el precio de que la lista de proveedores sea una constante y no algo que se
 * recalcule en cada petición.
 */
const GOOGLE = credencialesDeGoogle();

/**
 * Si el acceso con Google está disponible, **según la misma lectura** que decidió la lista de
 * proveedores.
 *
 * Existe por un hallazgo de la autorrevisión de #233: la pantalla de acceso preguntaba con una
 * función que leía `process.env` **en cada petición**, mientras el proveedor se decide una sola
 * vez arriba. Casi siempre da igual, y donde muerde es justo en el caso que documenta `GOOGLE`:
 * quien define las dos variables en un servidor propio y no reinicia veía **el botón pintado y
 * el proveedor inexistente**, o sea una puerta que no está.
 *
 * El arreglo no fue sincronizar las dos lecturas —eso las deja pudiendo discrepar, solo que
 * menos— sino **quitar la segunda**: esa función ya no existe. Aquí hay una decisión y de ella
 * salen las dos cosas.
 */
export const ACCESO_CON_GOOGLE_DISPONIBLE = GOOGLE !== null;

/**
 * Lo que este proyecto guarda dentro del `user` de Auth.js cuando quien entra viene de Google.
 *
 * No es un capricho de estructura: es el único sitio donde cabe. `profile()` no puede rechazar
 * —devuelve un usuario o lanza, y lanzar deja a quien lo intenta delante de una página de la
 * librería sin explicación— así que la **decisión** viaja con el usuario y la aplican los dos
 * callbacks de abajo.
 */
interface UsuarioDeAuthConDecision {
  readonly acceso?: AccesoDeGoogle;
}

function decisionDeGoogle(user: unknown): AccesoDeGoogle | undefined {
  return (user as UsuarioDeAuthConDecision | null | undefined)?.acceso;
}

/**
 * El proveedor de Google.
 *
 * ## Por qué todo el trabajo se hace en `profile()`
 *
 * Porque es el único punto del flujo que corre **antes** de que Auth.js decida nada y que puede
 * consultar la base de datos. Aquí se resuelve el correo contra `users` una sola vez y el
 * resultado viaja hasta el token; hacerlo en `signIn` y otra vez en `jwt` serían dos consultas
 * y, peor, dos sitios donde la regla podría acabar diciendo cosas distintas.
 *
 * ## Lo que se le pide a Google, y lo que no
 *
 * Solo `openid email profile`, que es el ámbito por omisión del proveedor. No se pide acceso a
 * nada de la cuenta: este CMS no lee el correo de nadie ni su calendario, y un ámbito de más es
 * un permiso que alguien tiene que conceder en la pantalla de Google sin que le sirva de nada.
 */
function proveedorDeGoogle(credenciales: { id: string; secreto: string }) {
  return Google({
    clientId: credenciales.id,
    clientSecret: credenciales.secreto,
    async profile(perfil) {
      const acceso = await autenticarConGoogle({
        email: perfil.email,
        // **De aquí sale la seguridad de las otras dos puertas.** `email_verified` lo firma
        // Google en el `id_token` que `@auth/core` ya ha validado contra sus claves públicas
        // antes de llegar aquí; no es un campo que ponga quien inicia sesión. El día que se
        // acepte otro proveedor, esta frase deja de ser cierta y hay que volver a mirarla.
        emailVerificado: perfil.email_verified === true,
      });

      // El `id` que se pone aquí **no llega a ninguna parte**: Auth.js lo sustituye por un UUID
      // aleatorio nada más volver de esta función. El identificador que importa va dentro de
      // `acceso` y lo coloca el callback `jwt`.
      const usuario = {
        id: perfil.sub,
        email: perfil.email,
        name: acceso.ok ? acceso.usuario.name : perfil.name,
        acceso,
      };

      return usuario;
    },
  });
}

export const authConfig = {
  /**
   * Auth.js rechaza peticiones cuyo `Host` no reconoce, salvo en Vercel, donde lo detecta
   * solo. Como `SPEC.md` §0 dice "auto-hospedable", hay que decidirlo aquí.
   *
   * Se confía en el `Host`, con dos mitigaciones que ya existen y que son las que hacen que
   * la decisión sea aceptable:
   *
   * - La única redirección que construimos con datos externos es la de la página de acceso,
   *   y solo acepta rutas internas: se rechaza cualquier destino que no empiece por `/`, y
   *   también `//host`, que es una URL externa disfrazada de ruta.
   * - La CSP fija `form-action 'self'` y `base-uri 'self'` (SPEC §7.2), así que un `Host`
   *   falsificado no puede llevarse un envío de formulario a otro sitio.
   *
   * **Lo que queda vivo:** un proxy mal configurado delante puede inyectar `Host` y hacer
   * que los enlaces absolutos que genere Auth.js apunten a otro dominio. La defensa contra
   * eso no está aquí, está en definir `AUTH_URL` en el despliegue, y así queda dicho en
   * `.env.example`.
   */
  trustHost: true,
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  /**
   * `error` apunta a la propia pantalla de acceso y no a la de Auth.js (issue #233).
   *
   * Sin esto, un rechazo de Google acaba en `/api/auth/error`, que es una página de la
   * librería, en inglés y sin nada de este panel. Con esto, el rechazo vuelve al acceso con
   * `?error=…` y lo cuenta la pantalla que ya sabe contarlo.
   */
  pages: { signIn: '/admin/login', error: '/admin/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const email = credentials?.['email'];
        const password = credentials?.['password'];

        if (typeof email !== 'string' || typeof password !== 'string') return null;

        // La IP llega de la cabecera que pone la plataforma. Se coge la primera entrada de
        // `x-forwarded-for`: las siguientes las puede escribir el cliente.
        const forwarded = request.headers.get('x-forwarded-for');
        const ip = forwarded?.split(',')[0]?.trim();

        const result = await authenticate({
          email,
          password,
          ...(ip === undefined ? {} : { ip }),
          ...(request.headers.get('user-agent') === null
            ? {}
            : { userAgent: request.headers.get('user-agent') as string }),
        });

        // `null` sin distinguir el motivo: Auth.js lo convierte en el mismo error para
        // todos los casos, que es lo que pide SPEC §7.1.
        if (!result.ok) return null;

        return {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          passwordVersion: result.user.passwordVersion,
        };
      },
    }),
    // El proveedor de Google **solo si está configurado** (ADR-900). No es que el botón no se
    // pinte: es que sin las dos variables la ruta `/api/auth/callback/google` no existe. Un
    // botón escondido con un proveedor vivo detrás seguiría siendo una puerta abierta, y es lo
    // que comprueba el caso T-233-2 sobre esta lista y no sobre la pantalla.
    ...(GOOGLE === null ? [] : [proveedorDeGoogle(GOOGLE)]),
  ],
  callbacks: {
    /**
     * La puerta del acceso con Google (spec 13 §3).
     *
     * Auth.js llama a esto **después** de `profile()` y **antes** de emitir nada, y devolver
     * `false` aquí acaba en `/admin/login?error=AccessDenied`, que es el mensaje de ADR-902.
     *
     * El proveedor de credenciales no pasa por aquí a decidir nada: su rechazo ya viene de
     * `authenticate()`, que devuelve `null` y ni siquiera llega a este punto.
     */
    signIn({ user, account }) {
      if (account?.provider !== 'google') return true;

      return decisionDeGoogle(user)?.ok === true;
    },

    async jwt({ token, user, account }) {
      // Al iniciar sesión, se copian los datos al token.
      if (user !== undefined) {
        if (account?.provider === 'google') {
          const decision = decisionDeGoogle(user);

          // La segunda cerradura, y no sobra: la primera vive en el callback de arriba, que es
          // otra función y podría dejar de hacer su trabajo. Aquí el modo de fallo sería emitir
          // una sesión para alguien a quien se acaba de rechazar.
          if (decision === undefined || !decision.ok) return null;

          // **El identificador es el de `users`, no el que trae `user.id`.** Auth.js descarta
          // el `id` que devuelve `profile()` y pone un UUID aleatorio en su lugar (está en
          // `getUserAndAccount` de `@auth/core`, con su comentario: el usuario debe ser
          // independiente del proveedor). Sin esta línea, `token.sub` sería ese UUID, la
          // sesión no correspondería a ninguna fila y `isSessionStillValid` echaría a quien
          // acaba de entrar — ruidoso, por suerte, pero por el motivo equivocado.
          token.sub = decision.usuario.id;
          token['role'] = decision.usuario.role;
          token['pwdV'] = decision.usuario.passwordVersion;
          return token;
        }

        const authenticated = user as unknown as {
          id: string;
          role: 'admin' | 'editor';
          passwordVersion: number;
        };
        token.sub = authenticated.id;
        token['role'] = authenticated.role;
        token['pwdV'] = authenticated.passwordVersion;
        return token;
      }

      // En el resto de peticiones se comprueba que la sesión siga viva (ADR-301). Cuesta
      // una consulta por petición autenticada, y es el precio de que cambiar la contraseña
      // —o borrar la cuenta— expulse de verdad.
      const id = token.sub;
      const version = token['pwdV'];

      if (typeof id !== 'string' || typeof version !== 'number') return null;
      if (!(await isSessionStillValid(id, version))) return null;

      return token;
    },

    session({ session, token }) {
      if (typeof token.sub === 'string') session.user.id = token.sub;
      const role = token['role'];
      if (role === 'admin' || role === 'editor') session.user.role = role;
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
