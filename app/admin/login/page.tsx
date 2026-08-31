import { redirect } from 'next/navigation';
import { auth, signIn } from '@/cms/auth';
import { EnvoltorioDeTema } from '@/app/envoltorio-de-tema';

/**
 * Página de acceso (SPEC §3).
 *
 * Lo mínimo para que el flujo funcione, sin diseño: el panel es M4. Lo que sí está aquí es
 * el mensaje único de SPEC §7.1 —"revisa el correo y la contraseña"— que no distingue entre
 * correo inexistente, contraseña incorrecta y cuenta bloqueada.
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
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
        <h1 className="text-2xl font-semibold">Entrar</h1>

        {/* Quien llega aquí desde poner su contraseña —por invitación o por cambiarla— no viene a
          "entrar": viene de terminar algo. Sin este aviso se encuentra un formulario mudo y no
          sabe si lo suyo se guardó. Es el mismo motivo por el que cambiar la contraseña avisa
          antes de cerrar la sesión. */}
        {params.lista !== undefined && (
          <p className="rounded-md border border-publicado-linea bg-publicado-fondo px-3 py-2 text-sm text-publicado-tinta">
            Tu contraseña ya está puesta. Entra con ella y tu correo.
          </p>
        )}

        {params.cambiada !== undefined && (
          <p className="rounded-md border border-publicado-linea bg-publicado-fondo px-3 py-2 text-sm text-publicado-tinta">
            Contraseña cambiada. Se han cerrado todas las sesiones, así que entra otra vez con la
            nueva.
          </p>
        )}

        <form action={iniciarSesion} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Correo</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className="rounded border border-linea px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Contraseña</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded border border-linea px-3 py-2"
            />
          </label>

          <button type="submit" className="rounded bg-accion px-4 py-2 text-sobre-accion">
            Entrar
          </button>
        </form>

        {params.error !== undefined && (
          <p role="alert" className="text-sm text-alarma">
            Revisa el correo y la contraseña.
          </p>
        )}
      </main>
    </EnvoltorioDeTema>
  );
}
