import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Las rutas del panel, leídas del sistema de ficheros (issue #70).
 *
 * Se enumeran en vez de listarse a mano por el motivo de siempre: una lista escrita a mano
 * está completa el día que se escribe. Leyendo el directorio, **una ruta nueva entra sola** en
 * los tests que la usan, que es justo lo que hace falta cuando quedan cuatro pantallas por
 * añadir.
 */

/**
 * La raíz, desde el directorio de trabajo y no desde `import.meta.url`.
 *
 * Este módulo lo usan **dos ejecutores con sistemas de módulos distintos**: Vitest, que corre
 * ESM, y Playwright, que transpila a CommonJS — y allí `import.meta` es un error de sintaxis
 * que tumba el fichero entero antes de ejecutar un solo test. Los dos arrancan desde la raíz
 * del repositorio, así que `cwd` sirve para ambos.
 */
const RAIZ = process.cwd();
const DIRECTORIO_ADMIN = join(RAIZ, 'app', 'admin');

/** Valores de ejemplo para los segmentos dinámicos, para poder pedir la URL de verdad. */
const EJEMPLOS: Record<string, string> = {
  '[key]': 'hero',
};

export interface RutaDelPanel {
  /** Ruta del fichero, relativa a la raíz del repositorio. */
  readonly fichero: string;
  /** La URL que sirve. */
  readonly url: string;
  /** Si vive dentro del grupo `(panel)`, que es de donde cuelga el guard autoritativo. */
  readonly dentroDelGrupo: boolean;
}

/**
 * Las rutas públicas del panel, con su motivo.
 *
 * Que haya que escribir el motivo es parte del diseño: una lista de excepciones sin
 * explicación crece hasta que nadie sabe cuáles siguen teniendo razón de ser, y esta lista
 * decide qué páginas del panel se sirven sin sesión.
 */
export const RUTAS_PUBLICAS: { url: string; motivo: string }[] = [
  {
    url: '/admin/login',
    motivo:
      'Es la página de acceso. Protegerla con el guard la haría redirigir a sí misma, en bucle.',
  },
];

function recorrer(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...recorrer(ruta));
    else if (entrada.name === 'page.tsx' || entrada.name === 'route.ts') salida.push(ruta);
  }
  return salida;
}

/** Convierte la ruta de un fichero en la URL que sirve. */
function urlDesdeFichero(relativa: string): string {
  const segmentos = relativa
    .split(/[\\/]/)
    .slice(1, -1) // fuera `app` y el nombre del fichero
    // Los grupos de rutas —`(panel)`— no aparecen en la URL. Es exactamente el detalle que
    // hace posible la divergencia que este módulo vigila: una página puede estar dentro o
    // fuera del grupo y servir la misma dirección.
    .filter((segmento) => !segmento.startsWith('('))
    .map((segmento) => EJEMPLOS[segmento] ?? segmento);

  return `/${segmentos.join('/')}`;
}

export function rutasDelPanel(): RutaDelPanel[] {
  return recorrer(DIRECTORIO_ADMIN).map((fichero) => {
    const relativa = relative(RAIZ, fichero).replace(/\\/g, '/');

    return {
      fichero: relativa,
      url: urlDesdeFichero(relativa),
      dentroDelGrupo: relativa.includes('/(panel)/'),
    };
  });
}
