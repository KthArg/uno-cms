import { redirect } from 'next/navigation';
import { auth, signIn } from '@/cms/auth';
import { EnvoltorioDeTema } from '@/app/envoltorio-de-tema';
import { Icono } from '@/cms/ui/iconos';
import { AVISO_ALARMA, AVISO_PUBLICADO, BOTON_PRINCIPAL, CAMPO } from '@/cms/ui/estilos';

/**
 * Página de acceso (SPEC §3).
 *
 * Aquí sigue estando el mensaje único de SPEC §7.1 —"revisa el correo y la contraseña"— que no
 * distingue entre correo inexistente, contraseña incorrecta y cuenta bloqueada. **Eso no se
 * toca**: es lo que cierra la enumeración de cuentas, y es una decisión de seguridad, no de
 * redacción.
 *
 * ## Lo que sí cambió (#224)
 *
 * Esta pantalla llevaba desde M2 un comentario que decía "lo mínimo para que el flujo funcione,
 * **sin diseño**: el panel es M4". M4 se cerró hace cinco hitos y la frase se quedó, que es
 * exactamente la forma en que un comentario se convierte en mentira: describía un plan, no el
 * código, y el plan caducó sin que nadie volviera a leerlo.
 *
 * Es además la primera pantalla que ve quien llega, y la única que ve quien no consigue entrar.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; lista?: string; cambiada?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session !== null) redirect(params.next ?? '/admin');

  async function iniciarSesion(formData: FormData) {
    'use server';

    const destino = typeof params.next === 'string' ? params.next : '/admin';

    // `redirectTo` fijado a una ruta interna: si viniera del formulario sin validar, sería
    // una redirección abierta hacia donde quisiera quien envíe el enlace.
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: destino.startsWith('/') && !destino.startsWith('//') ? destino : '/admin',
    });
  }

  return (
    <EnvoltorioDeTema>
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-12">
        {/* La lámina de vidrio está aquí y no alrededor de toda la pantalla: es lo único que
            flota, así que es donde va la mirada. Con el halo detrás, este recuadro es lo que
            da la primera impresión de qué clase de herramienta es esto. */}
        <div className="lamina-tarjeta rounded-3xl p-7">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-acento" />
            <span className="font-semibold text-tinta">Tu sitio</span>
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-tinta">Entrar</h1>

          {/* Quien llega aquí desde poner su contraseña —por invitación o por cambiarla— no viene a
              "entrar": viene de terminar algo. Sin este aviso se encuentra un formulario mudo y no
              sabe si lo suyo se guardó. Es el mismo motivo por el que cambiar la contraseña avisa
              antes de cerrar la sesión. */}
          {params.lista !== undefined && (
            <p className={`${AVISO_PUBLICADO} mt-5`}>
              <Icono de="publicado" tamano={16} className="mt-0.5" />
              Tu contraseña ya está puesta. Entra con ella y tu correo.
            </p>
          )}

          {params.cambiada !== undefined && (
            <p className={`${AVISO_PUBLICADO} mt-5`}>
              <Icono de="publicado" tamano={16} className="mt-0.5" />
              Contraseña cambiada. Se han cerrado todas las sesiones, así que entra otra vez con la
              nueva.
            </p>
          )}

          <form action={iniciarSesion} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-tinta-suave">Correo</span>
              <input name="email" type="email" required autoComplete="username" className={CAMPO} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-tinta-suave">Contraseña</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className={CAMPO}
              />
            </label>

            <button type="submit" className={`${BOTON_PRINCIPAL} mt-1 w-full`}>
              Entrar
            </button>
          </form>

          {/* `role="alert"` y no un párrafo cualquiera: quien falla al entrar puede estar
              usando un lector de pantalla, y este mensaje aparece **después** de enviar. Sin
              anunciarlo, el formulario se recarga en silencio y parece que no ha pasado nada. */}
          {params.error !== undefined && (
            <p role="alert" className={`${AVISO_ALARMA} mt-5`}>
              <Icono de="alerta" tamano={16} className="mt-0.5" />
              Revisa el correo y la contraseña.
            </p>
          )}
        </div>
      </main>
    </EnvoltorioDeTema>
  );
}
