import 'server-only';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { SESSION_MAX_AGE_SECONDS, secretoDeSesionValido, sesionCaducada } from '@/cms/sesion';
import { ipDelCliente } from '@/cms/security/ip';
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

/**
 * El secreto con el que Auth.js firma las sesiones, el mismo que lee él (`AUTH_SECRET`, y
 * `NEXTAUTH_SECRET` por compatibilidad).
 */
function secretoDeSesion(): string | undefined {
  return process.env['AUTH_SECRET'] ?? process.env['NEXTAUTH_SECRET'];
}

/**
 * Falla cerrado con un secreto corto (T-S-10), igual que `APP_SECRET` en `tokens.ts`. Se
 * comprueba **al usarlo** y no al cargar el módulo: `next build` importa esto para recoger datos
 * de las páginas, y un build sin secretos tiene que seguir siendo posible.
 */
function exigirSecretoDeSesion(): void {
  if (!secretoDeSesionValido(secretoDeSesion())) {
    throw new Error(
      'AUTH_SECRET debe existir y tener al menos 32 caracteres. Genéralo con ' +
        '`openssl rand -base64 32`; ver .env.example.'
    );
  }
}

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

        exigirSecretoDeSesion();

        // De dónde sale la IP, y por qué no de la primera entrada de `x-forwarded-for`, que es
        // la que escribe el cliente: `cms/security/ip.ts` (ADR-1302).
        const ip = ipDelCliente(request.headers);

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
        // Cuándo se entró, y no se mueve: es lo que pone la caducidad absoluta (T-S-8).
        token['authTime'] = Math.floor(Date.now() / 1000);
        return token;
      }

      // Un secreto corto no firma nada que valga (T-S-10): ninguna sesión sobrevive con él.
      if (!secretoDeSesionValido(secretoDeSesion())) return null;

      // La vida absoluta. El `maxAge` de la cookie se renueva con cada petición, así que sin
      // esto una sesión usada a diario no caducaba nunca (T-S-8).
      if (sesionCaducada(token['authTime'], Math.floor(Date.now() / 1000))) return null;

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
