/**
 * A dónde apunta la suite de humo, y si tiene con qué (spec 09 §4.1).
 *
 * Separado del fichero de casos para que se pueda probar sin navegador: T-207-2 y T-207-3 son
 * sobre esta decisión, no sobre el despliegue.
 */

export interface Destino {
  readonly url: string;
  readonly email: string;
  readonly password: string;
}

export type Lectura =
  | { readonly hay: true; readonly destino: Destino; readonly avisos: readonly string[] }
  | { readonly hay: false; readonly motivo: string };

const VARIABLES = ['HUMO_URL', 'HUMO_EMAIL', 'HUMO_PASSWORD'] as const;

/** Las direcciones que **no** son un despliegue, por mucho que sean una URL válida. */
function esLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;

    return (
      host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

/**
 * Lee el entorno y decide si hay contra qué correr.
 *
 * **Saltarse no es lo mismo que dar verde**, y el motivo va escrito: es lo que separa esta
 * suite de una que se inventa un entorno. La forma es la de los tests de integración sin
 * `DATABASE_URL`, y por el mismo motivo — uno que pasa sin base de datos no es un test de
 * integración, y uno de humo que pasa sin despliegue no prueba nada de lo que dice probar.
 */
export function leerDestino(env: Record<string, string | undefined> = process.env): Lectura {
  const faltan = VARIABLES.filter((nombre) => (env[nombre] ?? '').trim() === '');

  if (faltan.length > 0) {
    return {
      hay: false,
      motivo:
        `La suite de humo necesita ${faltan.join(', ')}. Se salta. ` +
        'Está en docs/specs/09-humo-contra-el-despliegue.md §4.1.',
    };
  }

  // La barra final produciría `https://sitio.com//admin/login`, que Next redirige y hace que
  // cada navegación cueste una vuelta de más. Se quita aquí y no en cada caso.
  const url = (env['HUMO_URL'] ?? '').trim().replace(/\/+$/, '');
  const avisos: string[] = [];

  if (esLocal(url)) {
    // Avisa y sigue: depurar la propia suite contra un `next start` es legítimo. Lo que no
    // puede pasar es que alguien lea un verde de esto y crea que el despliegue está probado.
    avisos.push(
      `HUMO_URL apunta a ${url}, que es local. La suite corre, pero NO está probando ` +
        'el camino desplegado: en local las imágenes van al disco y la base es Postgres a secas.'
    );
  }

  if (!url.startsWith('https://') && !esLocal(url)) {
    avisos.push(`HUMO_URL no es https (${url}). Las cookies de sesión pueden no viajar.`);
  }

  return {
    hay: true,
    destino: {
      url,
      email: (env['HUMO_EMAIL'] ?? '').trim(),
      password: env['HUMO_PASSWORD'] ?? '',
    },
    avisos,
  };
}
