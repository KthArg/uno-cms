import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/cms/auth';
import { invalidateSessions } from '@/cms/auth/authenticate';
import { fuenteDelPanel } from '@/app/fuente';
import { COOKIE_DE_TEMA, DURACION_DE_LA_COOKIE, elContrario, leerTema } from '@/cms/tema';
import { PanelShell } from '@/cms/ui/PanelShell';

/**
 * Guard de sesión del panel (SPEC §3, §7.1) y armazón (M4).
 *
 * **Esta es la comprobación autoritativa**, no la del middleware. El middleware corre en
 * edge y solo puede verificar la firma del JWT; aquí, en el runtime de Node, `auth()` usa la
 * configuración completa, que incluye comprobar el claim `pwdV` contra la base de datos
 * (ADR-301). Es lo que expulsa a quien cambió su contraseña, a quien fue desactivado y a las
 * cuentas borradas.
 *
 * ## Por qué esto vive en un grupo de rutas `(panel)` y no en `app/admin/layout.tsx`
 *
 * Porque la página de acceso está en `app/admin/login/` (SPEC §3) y un layout en
 * `app/admin/` se le aplicaría también: el guard redirigiría al login desde el propio
 * login, en bucle. Lo descubrí con un `ERR_TOO_MANY_REDIRECTS` en el e2e, no leyendo el
 * código.
 *
 * El grupo `(panel)` no aparece en la URL —`/admin` sigue siendo `/admin`— pero deja el
 * login fuera del alcance del guard.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (session === null) redirect('/admin/login');

  // La ruta actual se lee de la cabecera que pone el middleware, y sirve **solo para el primer
  // render**: este layout es común a todas las rutas de `/admin` y Next no lo vuelve a ejecutar
  // al navegar entre ellas, así que a partir de ahí manda `usePathname()` dentro del armazón.
  // Está contado en `cms/ui/PanelShell.tsx`; era un fallo real (#234), no una optimización.
  const rutaActual = (await headers()).get('x-pathname') ?? '/admin';

  // Se captura aquí, donde `session` ya está estrechado: dentro de la acción de abajo
  // TypeScript pierde ese estrechamiento y haría falta un `!`, que es afirmar a mano algo que
  // el guard de arriba ya garantiza.
  const usuarioId = session.user.id;

  const tema = leerTema((await cookies()).get(COOKIE_DE_TEMA)?.value);

  /**
   * Cambia de modo (issue #219).
   *
   * Guardar en cookie y no en el navegador es lo que permite que el servidor pinte el modo
   * correcto desde el primer byte. `httpOnly: false` a propósito: no es un secreto, y dejarla
   * legible permite que una futura mejora la lea sin otra vuelta.
   */
  async function cambiarDeTema(): Promise<void> {
    'use server';

    const almacen = await cookies();
    almacen.set(COOKIE_DE_TEMA, elContrario(leerTema(almacen.get(COOKIE_DE_TEMA)?.value)), {
      maxAge: DURACION_DE_LA_COOKIE,
      sameSite: 'lax',
      path: '/',
    });
  }

  /**
   * Cerrar sesión (issue #211), **y de verdad** (issue #249, ADR-910).
   *
   * Borrar la cookie no basta, y esto no es una precaución: está medido. Cada lectura de sesión
   * de Auth.js **reemite** `authjs.session-token` con una caducidad nueva —lo hace
   * `lib/actions/session.js` de `@auth/core`, sin throttling—, así que cualquier petición que
   * esté en vuelo cuando se pulsa «Salir» puede llegar **después** del borrado y devolver la
   * cookie a su sitio. El panel deja varias en vuelo: Next prefetcha los enlaces del menú.
   *
   * Reproducido: 2 fallos en 140 pasadas del caso T-208-3, con la cookie de sesión presente
   * después de salir, `/admin` respondiendo 200 y el panel en pantalla. O sea que quien pulsa
   * «Salir», ve la pantalla de acceso y se levanta de un ordenador compartido puede dejar la
   * sesión viva.
   *
   * Así que se sube `password_version` antes de salir, que es el mecanismo de ADR-301: una
   * cookie resucitada lleva el `pwdV` viejo y `isSessionStillValid` la rechaza en la siguiente
   * petición. **El borrado sigue estando** — esto es lo que lo hace fiable, no lo que lo
   * sustituye.
   *
   * Lo que cuesta está en ADR-910: salir cierra **todas** las sesiones de esa persona, también
   * las de otros dispositivos.
   *
   * Y el `redirectTo` es de #211: sin él Auth.js vuelve a `/`, que es la landing pública, y quien
   * acaba de salir del panel se queda mirando su propia web sin señal de que la sesión se cerró.
   */
  async function salir(): Promise<void> {
    'use server';

    await invalidateSessions(usuarioId);
    await signOut({ redirectTo: '/admin/login' });
  }

  return (
    <PanelShell
      rol={session.user.role}
      nombreDeUsuario={session.user.name || session.user.email}
      rutaActual={rutaActual}
      onSalir={salir}
      tema={tema}
      onCambiarDeTema={cambiarDeTema}
      claseDeFuente={fuenteDelPanel.className}
    >
      {children}
    </PanelShell>
  );
}
