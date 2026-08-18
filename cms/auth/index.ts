import 'server-only';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authenticate, isSessionStillValid } from './authenticate';

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
  pages: { signIn: '/admin/login' },
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
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Al iniciar sesión, se copian los datos al token.
      if (user !== undefined) {
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
