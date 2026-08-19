import { deactivateUser, inviteUser, updateUserRole } from '@/cms/actions';
import { direccionDelSitio, soloAdmin } from '@/cms/auth/panel';
import { listUsers } from '@/cms/core/users';
import { UsersScreen } from '@/cms/ui/UsersScreen';

/**
 * Personas (SPEC §3, §5.3).
 *
 * `soloAdmin()` es **la puerta**: sin él, un `editor` que escribiera la dirección a mano vería
 * la lista de cuentas y el formulario de invitar, porque el layout de `(panel)` solo comprueba
 * que haya sesión. Ocultar la entrada del menú no cierra nada (T-E-4).
 */
export const dynamic = 'force-dynamic';

export default async function PantallaDePersonas() {
  const yo = await soloAdmin();

  const personas = await listUsers();
  const sitio = await direccionDelSitio();

  async function invitar(datos: {
    nombre: string;
    correo: string;
    rol: 'admin' | 'editor';
  }): Promise<{ ok: boolean; enlace?: string; userId?: string; message?: string }> {
    'use server';

    const resultado = await inviteUser({
      name: datos.nombre,
      email: datos.correo,
      role: datos.rol,
    });

    if (!resultado.ok) return { ok: false, message: resultado.message };

    // El enlace se compone aquí y no en la action: la action no sabe —ni tiene por qué— en qué
    // dirección está publicado el sitio, y devolver una URL desde ahí la metería en el registro
    // de auditoría junto con la credencial que lleva dentro.
    return {
      ok: true,
      userId: resultado.data.userId,
      enlace: `${sitio}/admin/invitacion?c=${encodeURIComponent(resultado.data.token)}`,
    };
  }

  async function cambiarRol(
    userId: string,
    rol: 'admin' | 'editor'
  ): Promise<{ ok: boolean; message?: string }> {
    'use server';

    const resultado = await updateUserRole({ userId, role: rol });
    return resultado.ok ? { ok: true } : { ok: false, message: resultado.message };
  }

  async function quitarAcceso(userId: string): Promise<{ ok: boolean; message?: string }> {
    'use server';

    const resultado = await deactivateUser({ userId });
    return resultado.ok ? { ok: true } : { ok: false, message: resultado.message };
  }

  return (
    <UsersScreen
      personas={personas}
      miId={yo.userId}
      onInvitar={invitar}
      onCambiarRol={cambiarRol}
      onDesactivar={quitarAcceso}
    />
  );
}
