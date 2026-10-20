import { redirect } from 'next/navigation';
import { changePassword, regenerarCodigosDeRecuperacion } from '@/cms/actions';
import { codigosRestantes } from '@/cms/auth/segundo-factor';
import { auth } from '@/cms/auth';
import { AccountScreen } from '@/cms/ui/AccountScreen';

/**
 * Tu cuenta (SPEC §5.3).
 *
 * Sin `soloAdmin`: cualquiera cambia **la suya**. El objetivo sale de la sesión y no de la
 * entrada, así que no hay forma de tocar la de otra persona (#81).
 */
export const dynamic = 'force-dynamic';

export default async function PantallaDeCuenta() {
  const session = await auth();

  // El layout de `(panel)` ya lo garantiza; esto es para el compilador y para que la página no
  // dependa de que el layout no cambie nunca.
  if (session === null) redirect('/admin/login');

  const correo = session.user.email;

  async function cambiar(
    actual: string,
    nueva: string
  ): Promise<{ ok: boolean; message?: string }> {
    'use server';

    const resultado = await changePassword({ currentPassword: actual, newPassword: nueva });

    if (!resultado.ok) return { ok: false, message: resultado.message };

    // A partir de aquí la sesión de quien está mirando ya no vale (ADR-301), así que se le
    // lleva al acceso en vez de dejarle en una pantalla que va a fallar en cuanto toque algo.
    redirect('/admin/login?cambiada=1');
  }

  async function regenerar(
    codigo: string
  ): Promise<{ ok: true; codigos: string[] } | { ok: false; message?: string }> {
    'use server';

    const resultado = await regenerarCodigosDeRecuperacion({ codigo });
    return resultado.ok
      ? { ok: true, codigos: resultado.data.codigos }
      : { ok: false, message: resultado.message };
  }

  return (
    <AccountScreen
      correo={correo}
      onCambiar={cambiar}
      codigosRestantes={await codigosRestantes(session.user.id)}
      onRegenerar={regenerar}
    />
  );
}
