import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { completeSetup, isSetupCompleted } from '@/cms/auth/setup';

/**
 * Configuración inicial (SPEC §7.3).
 *
 * Una vez completado el bootstrap, esta ruta devuelve **404** aunque `SETUP_TOKEN` siga
 * definido en el entorno. Un 404 y no un 403: un 403 confirmaría que la ruta existe y que
 * alguien se configuró ahí, que es información que no le hace falta a nadie.
 *
 * Sin diseño a propósito: el panel es M4. Lo que sí está aquí es el comportamiento.
 */
export const dynamic = 'force-dynamic';

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isSetupCompleted()) notFound();

  const params = await searchParams;

  async function crear(formData: FormData) {
    'use server';

    const cabeceras = await headers();
    const forwarded = cabeceras.get('x-forwarded-for');

    const result = await completeSetup({
      token: String(formData.get('token') ?? ''),
      email: String(formData.get('email') ?? ''),
      name: String(formData.get('name') ?? ''),
      password: String(formData.get('password') ?? ''),
      ...(forwarded === null ? {} : { ip: forwarded.split(',')[0]?.trim() }),
    });

    if (result.ok) redirect('/admin/login');
    redirect(`/setup?error=${result.reason}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">Configura tu sitio</h1>
        <p className="mt-2 text-sm text-slate-600">
          Crea la cuenta con la que administrarás la web. Solo se hace una vez.
        </p>
      </div>

      <form action={crear} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm">Código de instalación</span>
          <input
            name="token"
            required
            autoComplete="off"
            className="rounded border border-slate-300 px-3 py-2"
          />
          <span className="text-xs text-slate-500">
            Es el valor que pusiste en SETUP_TOKEN al desplegar.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm">Tu nombre</span>
          <input name="name" required className="rounded border border-slate-300 px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm">Tu correo</span>
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
            autoComplete="new-password"
            className="rounded border border-slate-300 px-3 py-2"
          />
          <span className="text-xs text-slate-500">Al menos 12 caracteres.</span>
        </label>

        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Crear mi cuenta
        </button>
      </form>

      {params.error !== undefined && (
        <p role="alert" className="text-sm text-red-700">
          {params.error === 'password'
            ? 'Esa contraseña no vale: debe tener al menos 12 caracteres y no aparecer en listas públicas.'
            : 'El código de instalación no es correcto.'}
        </p>
      )}
    </main>
  );
}
