import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No anunciar el framework: reduce la superficie de reconocimiento (SPEC §7).
  poweredByHeader: false,
  // Sin esto, Next infiere la raíz del workspace subiendo hasta el primer lockfile que
  // encuentre, que puede estar fuera del repo (p. ej. un package-lock.json en el home del
  // usuario). El resultado son build traces que arrastran ficheros ajenos al proyecto.
  outputFileTracingRoot: path.join(import.meta.dirname, '.'),
};

export default nextConfig;
