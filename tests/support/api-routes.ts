import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * El inventario de rutas de `/api` con su nivel de acceso (issue #104).
 *
 * ## El hueco que cierra
 *
 * Los tests de #70 vigilan `/admin`, y el guard del middleware es `path.startsWith('/admin/')`.
 * Una ruta bajo `/api` **no pasa por él**: se protege sola, comprobando la sesión dentro de su
 * manejador.
 *
 * Eso es correcto —`/api/content/:key` es pública a propósito y `/api/health` también— pero
 * significa que el nivel de acceso de cada ruta es una decisión suelta que no vigila nadie. Una
 * ruta nueva es pública por omisión: si a quien la escribe se le olvida comprobar la sesión, no
 * hay nada que lo diga.
 *
 * Aquí cada ruta tiene que estar **declarada**, y una sin declarar hace fallar el test. No se
 * cuela con el valor por defecto de nadie.
 */

const RAIZ = process.cwd();
const DIRECTORIO_API = join(RAIZ, 'app', 'api');

export type NivelDeAcceso = 'publica' | 'con-sesion';

export interface RutaDeApi {
  readonly url: string;
  readonly fichero: string;
}

/**
 * Lo que cada ruta declara ser, **con su motivo**.
 *
 * Que haya que escribir el motivo es parte del diseño: esta lista decide qué partes de la API
 * responden a cualquiera, y una entrada sin explicación es una decisión que nadie recuerda
 * haber tomado.
 */
export const ACCESO_DECLARADO: Record<string, { nivel: NivelDeAcceso; motivo: string }> = {
  '/api/health': {
    nivel: 'publica',
    motivo:
      'Un endpoint de salud es público por definición: lo consulta la plataforma. No devuelve ' +
      'ningún dato, solo si la base de datos responde.',
  },
  '/api/content/[key]': {
    nivel: 'publica',
    motivo:
      'Es la lectura de contenido **publicado** para la landing (SPEC §5.3). Devuelve lo que ' +
      'cualquiera ve en la web, y no expone borradores.',
  },
  '/api/auth/[...nextauth]': {
    nivel: 'publica',
    motivo:
      'Es el propio inicio de sesión: exigir sesión para poder iniciarla no tendría sentido. ' +
      'Sus protecciones son las de Auth.js y el lockout de M2.',
  },
  '/api/media/upload': {
    nivel: 'con-sesion',
    motivo:
      'Emite un permiso de escritura en el almacén de imágenes. Sin sesión sería un almacén ' +
      'de cualquiera.',
  },
  '/api/media/local': {
    nivel: 'con-sesion',
    motivo:
      'Escribe un fichero en el disco. Sin sesión, cualquiera podría llenarlo. Además solo ' +
      'existe en desarrollo: en producción responde 404 sin mirar nada (spec 07 §4.3).',
  },
  '/api/preview/contenido': {
    nivel: 'publica',
    motivo:
      'Es la ruta por la que la web de destino lee borradores (spec 08 §4.3), y no la pide un ' +
      'navegador con sesión: la pide un servidor o un script de otro origen, que no lleva ' +
      'nuestras cookies. Lo que autoriza aquí no es una sesión, son tres cosas a la vez: la ' +
      'variable `PREVIEW_ORIGINS` —sin ella responde 404 sin mirar nada—, que el `Origin` esté ' +
      'en esa lista, y un token firmado de propósito `preview-remoto` con quince minutos de ' +
      'vida. Declararla "con-sesion" sería mentir sobre cómo se protege: quien la llama es un ' +
      'script de otro origen, que no lleva nuestras cookies.',
  },
  '/api/media/local/[...ruta]': {
    nivel: 'publica',
    motivo:
      'Sirve las imágenes que salen en la landing, que la ve cualquiera — el mismo acceso ' +
      'que el `access: public` de Blob. Solo lee, solo rutas con la forma que generamos ' +
      'nosotros, y solo en desarrollo.',
  },
};

function recorrer(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...recorrer(ruta));
    else if (entrada.name === 'route.ts') salida.push(ruta);
  }
  return salida;
}

export function rutasDeApi(): RutaDeApi[] {
  return recorrer(DIRECTORIO_API).map((fichero) => {
    const relativa = relative(RAIZ, fichero).split('\\').join('/');
    const url = `/${relativa.split('/').slice(1, -1).join('/')}`;

    return { url, fichero: relativa };
  });
}

/**
 * Si el manejador de una ruta comprueba la sesión.
 *
 * Se busca la llamada a `auth()`, que es la única forma que hay en este proyecto de saber
 * quién llama. Es análisis de texto: detecta que **se pregunta**, no que se actúe bien con la
 * respuesta. Esa parte la cubren los tests de cada ruta; lo que esto impide es que a alguien
 * se le olvide preguntar.
 */
export function compruebaSesion(fuente: string): boolean {
  return /\bawait auth\(\)/.test(fuente);
}

export function leerFuente(fichero: string): string {
  return readFileSync(join(RAIZ, fichero), 'utf8');
}
