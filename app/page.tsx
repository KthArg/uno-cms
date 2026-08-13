/**
 * Página raíz provisional del scaffold (issue #2).
 *
 * En el issue #3 se mueve a `app/(site)/page.tsx` junto con el resto de la
 * estructura de SPEC §3, y en M5 pasa a componer las secciones reales de la
 * landing leyendo contenido publicado.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">UnoCMS</h1>
      <p className="text-slate-600">
        Scaffold en pie. La landing se construye en M5; el panel, en M4.
      </p>
    </main>
  );
}
