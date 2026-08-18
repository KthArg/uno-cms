import { auth } from '@/cms/auth';

/** Marcador de posición. El dashboard de SPEC §9 se construye en M4. */
export default async function AdminPage() {
  const session = await auth();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Panel</h1>
      <p className="mt-2 text-slate-600">
        Sesión iniciada como {session?.user.email}. El panel se construye en M4.
      </p>
    </main>
  );
}
