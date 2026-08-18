import { redirect } from 'next/navigation';
import { auth, signIn } from '@/cms/auth';

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
  searchParams: Promise<{ next?: string; error?: string }>;
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Entrar</h1>

      <form action={iniciarSesion} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm">Correo</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm">Contraseña</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Entrar
        </button>
      </form>

      {params.error !== undefined && (
        <p role="alert" className="text-sm text-red-700">
          Revisa el correo y la contraseña.
        </p>
      )}
    </main>
  );
}
