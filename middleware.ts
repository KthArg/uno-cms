import NextAuth from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';
import { construirCsp } from '@/cms/csp';
import { esNoIndexable, esRutaPublicaDelPanel } from '@/cms/routes';
import { origenesDeVistaPreviaRemota } from '@/cms/vista-previa-remota';

/**
 * Cabeceras de seguridad, CSP con nonce y guard de `/admin` (SPEC §7.2, §7.1).
 *
 * ## Por qué la configuración de Auth.js está aquí dentro y no importada de `cms/auth`
 *
 * El middleware corre en el runtime **edge**. `cms/auth/index.ts` arrastra
 * `authenticate.ts`, que usa Argon2 —un módulo nativo— y el cliente de Postgres: nada de
 * eso existe en edge. La configuración de aquí no tiene proveedores ni callbacks de base de
 * datos; solo verifica la **firma** del JWT, que es lo único que se puede y se debe hacer
 * en este punto.
 *
 * ## Y por qué eso significa que este guard NO es el autoritativo
 *
 * Verificar la firma dice que la sesión la emitimos nosotros y no ha caducado. **No** dice
 * que siga siendo válida: el claim `pwdV` de ADR-301 —que es lo que expulsa a quien cambió
 * la contraseña o a una cuenta borrada— exige consultar la base de datos, y eso solo se
 * puede hacer en el runtime de Node.
 *
 * La comprobación de verdad vive en `app/admin/(panel)/layout.tsx`, que sí corre en Node y
 * sí llama a `auth()` con la configuración completa. Este middleware es un primer filtro
 * barato que evita renderizar nada a quien no trae sesión; **no es la última línea**, y
 * confundir una cosa con la otra sería creer que `/admin` está protegido cuando solo
 * está tapado.
 */

const { auth } = NextAuth({
  // Mismo motivo y mismas mitigaciones que en `cms/auth/index.ts`: el proyecto es
  // auto-hospedable y Auth.js solo detecta el host por su cuenta en Vercel.
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [],
  callbacks: {
    // Sin callbacks de base de datos: en edge no hay base de datos.
    authorized: ({ auth: session }) => session !== null,
  },
});

/** Métodos que modifican estado y por tanto exigen comprobación de origen (SPEC §7.1). */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function applySecurityHeaders(response: NextResponse, request: NextRequest, nonce: string): void {
  const isDevelopment = process.env.NODE_ENV === 'development';

  response.headers.set(
    'Content-Security-Policy',
    construirCsp({
      nonce,
      desarrollo: isDevelopment,
      // La variable se nombra aquí, escrita entera, y no se lee por una clave calculada:
      // los empaquetadores sustituyen `process.env.ALGO` cuando lo ven literal y no cuando
      // lo ven como `entorno[clave]`, y ese fallo dejaría la lista vacía **en el despliegue**
      // con todos los tests en verde.
      //
      // Que aquí haga falta no está comprobado: con `next build && next start`, una
      // `PREVIEW_ORIGINS` definida solo al arrancar llegó igualmente y la cabecera salió con
      // sus orígenes. Lo que sí está comprobado es que así llega; escribirla literal cuesta
      // nada y cubre el caso en que el empaquetado sea otro.
      origenesEmpotrables: origenesDeVistaPreviaRemota(process.env.PREVIEW_ORIGINS),
    })
  );
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Solo en las rutas privadas. En la landing sería un error caro: costaría el
  // posicionamiento del sitio entero y nadie lo notaría hasta semanas después.
  const path = request.nextUrl.pathname;
  if (esNoIndexable(path)) {
    response.headers.set('X-Robots-Tag', 'noindex');
  }
}

/**
 * Comprobación de origen para mutaciones (SPEC §7.1, CSRF).
 *
 * Las Server Actions de Next ya verifican el origen por su cuenta; esto es defensa en
 * profundidad y cubre además las rutas de API. Una petición **sin** cabecera `Origin` se
 * deja pasar a propósito: los navegadores la envían siempre en peticiones de otro sitio, y
 * exigirla rompería a los clientes que no son navegadores sin aportar nada.
 */
function hasForeignOrigin(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return false;

  const origin = request.headers.get('origin');
  if (origin === null) return false;

  try {
    return new URL(origin).host !== request.headers.get('host');
  } catch {
    // Un `Origin` que ni siquiera es una URL no puede venir de un navegador honrado.
    return true;
  }
}

export default auth((request) => {
  // Nonce nuevo por petición. Reutilizarlo anularía la protección: el sentido del nonce es
  // que un atacante no pueda conocerlo de antemano.
  //
  // 16 bytes aleatorios, no un UUID codificado en base64. Un UUID también valdría —122 bits
  // sobran— pero pasarlo por base64 produce 48 caracteres de los que varios son guiones
  // fijos: parece más entropía de la que hay, y el código acabaría diciendo algo que no es.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  if (hasForeignOrigin(request)) {
    const rejected = new NextResponse('Origen no permitido', { status: 403 });
    applySecurityHeaders(rejected, request, nonce);
    return rejected;
  }

  const path = request.nextUrl.pathname;
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  // La lista de rutas públicas es compartida con el test estructural de #70: si cada uno
  // tuviera la suya, abrir una ruta aquí sin tocar el test dejaría una página sin guard y con
  // el test en verde.
  const esPublica = esRutaPublicaDelPanel(path);

  if (isAdmin && !esPublica && request.auth === null) {
    // Redirección, no 404 ni 403: quien llega aquí suele ser un editor con la sesión
    // caducada, y mandarle al login con la ruta de vuelta es lo útil. No se filtra nada,
    // porque la respuesta es idéntica exista o no la página de destino.
    const login = new URL('/admin/login', request.nextUrl.origin);
    login.searchParams.set('next', path);

    const redirect = NextResponse.redirect(login);
    applySecurityHeaders(redirect, request, nonce);
    return redirect;
  }

  // El nonce viaja a la página por una cabecera de petición, que es como Next lo expone a
  // los componentes de servidor.
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  // La ruta, por el mismo camino. La usa el layout del panel para pintar el **primer** render
  // con la sección correcta; a partir de ahí manda `usePathname()` en el cliente.
  //
  // Antes esta cabecera era la única fuente, y eso estaba roto: el layout de `(panel)` es común
  // a todas las rutas de `/admin`, así que en una navegación de cliente Next no lo vuelve a
  // ejecutar y la ruta se quedaba congelada en la de la primera carga (#234).
  headers.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers } });
  applySecurityHeaders(response, request, nonce);
  return response;
});

export const config = {
  /**
   * Todo menos los ficheros estáticos y las imágenes optimizadas.
   *
   * Se excluyen porque las sirve el CDN sin pasar por aquí y añadirles cabeceras costaría
   * latencia en cada recurso de la landing, que es justo lo que SPEC §8 quiere evitar.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
