import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Dónde se construye, configurable (issue #170).
   *
   * Existe por un caso concreto: el almacén local de imágenes (ADR-700) **solo funciona en
   * desarrollo**, así que la única forma de ejercitarlo en un navegador es con `next dev`. Y la
   * suite de e2e corre con `next start` sobre `.next`, que es la trampa que `CLAUDE.md` avisa:
   * levantar `next dev` al lado reescribe ese directorio por debajo y el otro servidor empieza a
   * dar `Cannot find module './vendor-chunks/…'`.
   *
   * Con esto, el servidor de desarrollo de esa suite usa su propio directorio y los dos conviven.
   * En todo lo demás la variable no está definida y el comportamiento es exactamente el de antes.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  // No anunciar el framework: reduce la superficie de reconocimiento (SPEC §7).
  poweredByHeader: false,
  // Sin esto, Next infiere la raíz del workspace subiendo hasta el primer lockfile que
  // encuentre, que puede estar fuera del repo (p. ej. un package-lock.json en el home del
  // usuario). El resultado son build traces que arrastran ficheros ajenos al proyecto.
  outputFileTracingRoot: path.join(import.meta.dirname, '.'),
  experimental: {
    /**
     * Que de la librería de iconos entre **solo el icono que se usa** (ADR-801, T-215-3).
     *
     * `lucide-react` publica un módulo por icono y un índice que los reexporta todos. Con una
     * importación con nombre, el empaquetador puede quedarse solo con lo pedido, pero tiene que
     * recorrer el índice entero para saberlo — y en desarrollo eso son miles de módulos que
     * compilar. Esto reescribe la importación para ir directo al fichero de cada icono.
     *
     * Lo que **no** hace es sustituir a la guarda: `import * as Icons` seguiría metiendo el
     * índice completo, y eso lo para T-215-3.
     */
    optimizePackageImports: ['lucide-react'],
  },
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
