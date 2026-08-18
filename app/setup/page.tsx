/**
 * Marcador de posición. El bootstrap del primer administrador es el issue #61.
 *
 * Existe ya porque el middleware declara `/setup` entre las rutas que no deben indexarse
 * (SPEC §7.2) y el e2e comprueba esa cabecera sobre una respuesta real, no sobre un 404.
 */
export default function SetupPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Configuración inicial</h1>
    </main>
  );
}
