import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/cms/auth';
import { esPantallaDeAnchoCompleto } from '@/cms/routes';
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

  // La ruta actual se lee de la cabecera que pone el middleware. Un layout de servidor no
  // tiene `usePathname`, y hacer cliente todo el armazón solo para marcar la entrada activa
  // sería descargar el panel entero en el navegador para pintar un fondo gris.
  const rutaActual = (await headers()).get('x-pathname') ?? '/admin';

  /**
   * Cerrar sesión (issue #211).
   *
   * `redirectTo` y no dejar que Auth.js decida: sin él vuelve a `/`, que es la landing
   * pública, y quien acaba de salir del panel se queda mirando su propia web sin señal de
   * que la sesión se cerró. A la pantalla de acceso sí se ve.
   */
  async function salir(): Promise<void> {
    'use server';

    await signOut({ redirectTo: '/admin/login' });
  }

  return (
    <PanelShell
      rol={session.user.role}
      nombreDeUsuario={session.user.name || session.user.email}
      rutaActual={rutaActual}
      onSalir={salir}
      // El editor de una entrada usa el ancho de la ventana: media pantalla es una vista previa
      // de una web de verdad, y el techo de lectura la dejaba al tercio (issue #190).
      anchoCompleto={esPantallaDeAnchoCompleto(rutaActual)}
    >
      {children}
    </PanelShell>
  );
}
