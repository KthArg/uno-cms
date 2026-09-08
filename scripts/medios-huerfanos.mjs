import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

/**
 * Reconcilia el almacén de imágenes con la tabla `media` (issue #206, ADR-705).
 *
 * ## Qué problema resuelve
 *
 * ADR-705 dejó **dos** escrituras de la fila de una imagen: la del navegador al terminar la subida
 * y el aviso `blob.upload-completed` que manda Vercel. Las dos pueden fallar —el navegador se
 * cierra entre la subida y el registro, el aviso se pierde por un despliegue en marcha— y si
 * fallan las dos, el fichero está en el almacén y el CMS no lo tiene. Para el CMS esa imagen no
 * existió.
 *
 * Ya hay tres objetos así, del depurado de ese mismo camino.
 *
 * ## La decisión: **enseña, no borra**
 *
 * Este script **no toca nada**. Lista lo que sobra por cada lado y se calla el resto.
 *
 * Borrar automáticamente parece lo cómodo y es lo peligroso por dos motivos distintos:
 *
 * - **Un objeto sin fila puede ser una subida en vuelo.** Entre que el fichero llega al almacén y
 *   que la fila se escribe pasan milisegundos, y este script no puede distinguir eso de un
 *   huérfano de hace un mes. Borrar ahí es destruir la foto de alguien mientras la sube.
 * - **Una fila sin objeto es un rastro, no basura.** Dice que hubo una imagen y ya no está;
 *   borrarla deja el mismo estado que si nunca hubiera existido, que es justo lo que impide
 *   entender qué pasó.
 *
 * Así que decide una persona. Lo que hace falta para eso es verlo, y eso es lo que faltaba.
 *
 * ## Por qué es un `.mjs` y no un módulo de `cms/`
 *
 * Por lo mismo que `migrar-al-desplegar.mjs`: se ejecuta con `node` a secas, fuera de Next, así
 * que no puede importar TypeScript. La lógica que se puede probar —la comparación— se exporta
 * aquí y la ejercitan los tests, igual que en aquel.
 */

/** Lo que se dice cuando no hay a qué conectarse, en vez de fallar. */
export const AVISO_SIN_BASE =
  '[medios] Sin DATABASE_URL no hay nada que reconciliar. Define la variable y vuelve a intentarlo.';

/** Lo que se dice cuando no hay almacén que listar. */
export const AVISO_SIN_ALMACEN =
  '[medios] Sin BLOB_READ_WRITE_TOKEN y sin `.uploads/`, no hay almacén que mirar. En local eso es lo normal.';

/**
 * Compara los dos lados y devuelve lo que sobra en cada uno.
 *
 * Es una función pura sobre dos listas de `pathname`, que es la clave que comparten la fila y el
 * objeto (`media.pathname` existe justo para poder borrar en el almacén). Separarla de la lectura
 * es lo que permite probarla sin almacén y sin base de datos.
 *
 * **Compara conjuntos, no cuenta.** Un test que solo mirara los totales pasaría con dos listas
 * distintas del mismo tamaño, que es exactamente el caso que hay que detectar.
 */
export function compararMedios(enAlmacen, enBase) {
  const almacen = new Set(enAlmacen);
  const base = new Set(enBase);

  return {
    /** Están en el almacén y el CMS no los conoce. */
    sinFila: [...almacen].filter((pathname) => !base.has(pathname)).sort(),
    /** El CMS los conoce y no están en el almacén. */
    sinFichero: [...base].filter((pathname) => !almacen.has(pathname)).sort(),
  };
}

/** Los `pathname` que conoce el CMS. */
export async function pathnamesDeLaBase(pool) {
  const { rows } = await pool.query('select pathname from media');
  return rows.map((fila) => fila.pathname);
}

/**
 * Los `pathname` que hay en el almacén, o `null` si no hay ninguno configurado.
 *
 * `null` y no una lista vacía, y la diferencia es todo el caso T-206-4: una lista vacía diría que
 * el almacén está vacío y **todas** las filas saldrían como huérfanas. Sin almacén no se puede
 * concluir nada, y decirlo es la única respuesta honesta.
 */
export async function pathnamesDelAlmacen(entorno = process.env) {
  const token = entorno['BLOB_READ_WRITE_TOKEN'];

  if (typeof token === 'string' && token.trim() !== '') {
    // Se importa aquí y no arriba: sin token esta dependencia no hace falta, y cargarla igualmente
    // haría que el script fallara en un entorno donde no esté instalada.
    const { list } = await import('@vercel/blob');

    const encontrados = [];
    let cursor;

    // Paginado: `list` devuelve como mucho mil por llamada, y un sitio con años de imágenes tiene
    // más. Sin esto, todo lo que pase de la primera página saldría como fila huérfana.
    do {
      const pagina = await list({ token, ...(cursor === undefined ? {} : { cursor }) });
      encontrados.push(...pagina.blobs.map((blob) => blob.pathname));
      cursor = pagina.hasMore ? pagina.cursor : undefined;
    } while (cursor !== undefined);

    return encontrados;
  }

  // El almacén local de ADR-700: los ficheros están en disco, bajo `.uploads/`.
  try {
    const raiz = join(process.cwd(), '.uploads');
    const entradas = await readdir(raiz, { recursive: true, withFileTypes: true });

    return entradas
      .filter((entrada) => entrada.isFile())
      .map((entrada) => join(entrada.parentPath ?? raiz, entrada.name))
      .map((ruta) =>
        ruta
          .slice(raiz.length + 1)
          .split('\\')
          .join('/')
      );
  } catch {
    return null;
  }
}

/** Compone el informe, sin tocar nada. */
export function informe({ sinFila, sinFichero }) {
  const lineas = [];

  if (sinFila.length === 0 && sinFichero.length === 0) {
    lineas.push('[medios] Todo cuadra: cada fichero tiene su fila y cada fila su fichero.');
    return lineas.join('\n');
  }

  if (sinFila.length > 0) {
    lineas.push(`[medios] ${sinFila.length} en el almacén que el CMS no conoce:`);
    lineas.push(...sinFila.map((pathname) => `  - ${pathname}`));
    lineas.push('  Ocupan sitio y no salen en la biblioteca. Bórralos desde el almacén si sobran.');
  }

  if (sinFichero.length > 0) {
    lineas.push(`[medios] ${sinFichero.length} filas cuyo fichero ya no está:`);
    lineas.push(...sinFichero.map((pathname) => `  - ${pathname}`));
    lineas.push('  Salen en la biblioteca y no se pueden ver. Bórralas desde el panel.');
  }

  lineas.push('[medios] Este comando no ha tocado nada: la decisión es de quien administra.');
  return lineas.join('\n');
}

/* c8 ignore start -- el arranque; lo probado es lo de arriba */
const esEjecucionDirecta = process.argv[1]?.endsWith('medios-huerfanos.mjs') === true;

if (esEjecucionDirecta) {
  const url = process.env['DATABASE_URL'];

  if (url === undefined || url.trim() === '') {
    console.warn(AVISO_SIN_BASE);
    process.exit(0);
  }

  const enAlmacen = await pathnamesDelAlmacen();

  if (enAlmacen === null) {
    console.warn(AVISO_SIN_ALMACEN);
    process.exit(0);
  }

  const pool = new Pool({ connectionString: url });

  try {
    console.log(informe(compararMedios(enAlmacen, await pathnamesDeLaBase(pool))));
  } finally {
    await pool.end();
  }
}
/* c8 ignore stop */
