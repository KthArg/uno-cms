import { redirect } from 'next/navigation';
import { auth } from '@/cms/auth';

/**
 * Guard de sesión del panel (SPEC §3, §7.1).
 *
 * **Esta es la comprobación autoritativa**, no la del middleware. El middleware corre en
 * edge y solo puede verificar la firma del JWT; aquí, en el runtime de Node, `auth()` usa la
 * configuración completa, que incluye comprobar el claim `pwdV` contra la base de datos
 * (ADR-301). Es lo que expulsa a quien cambió su contraseña y a las cuentas borradas.
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
 *
 * El shell del panel (barra lateral, cabecera) es de M4. Aquí solo está el guard, que es lo
 * que exige el DoD de M2.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (session === null) redirect('/admin/login');

  return <>{children}</>;
}
