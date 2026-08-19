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
  images: {
    /**
     * Solo el dominio de Vercel Blob (SPEC §8).
     *
     * `next/image` optimiza cualquier URL que se le pase, así que sin acotar el origen se
     * convierte en un proxy de imágenes abierto: cualquiera puede pedirle que descargue y
     * sirva una imagen de otro sitio desde nuestro dominio, con nuestro ancho de banda y
     * nuestra factura.
     *
     * El patrón cubre los subdominios de Blob, que es donde acaban nuestras subidas y solo
     * ellas.
     */
    remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
  },
};

export default nextConfig;
