/**
 * El contrato del script de reconciliación, para que los tests en TypeScript puedan importarlo.
 *
 * Mismo motivo que en `migrar-al-desplegar.d.mts`: el script es `.mjs` porque lo ejecuta `node` a
 * secas, así que sin esta declaración importarlo desde un test sería un `any` implícito y
 * `tsc --noEmit` lo rechaza. Que lo rechace es lo que queremos: lo que no se declara, no se usa
 * por error.
 */

/** Lo que sobra por cada lado, comparando los `pathname` de los dos sitios. */
export function compararMedios(
  enAlmacen: readonly string[],
  enBase: readonly string[]
): { sinFila: string[]; sinFichero: string[] };

/** Los `pathname` que conoce el CMS. Recibe un `Pool` de `pg`. */
export function pathnamesDeLaBase(pool: {
  query: (sql: string) => Promise<{ rows: { pathname: string }[] }>;
}): Promise<string[]>;

/**
 * Los `pathname` del almacén, o `null` si no hay ninguno configurado.
 *
 * `null` y no una lista vacía: sin almacén no se puede concluir nada, y una lista vacía haría que
 * todas las filas salieran como huérfanas.
 */
export function pathnamesDelAlmacen(
  entorno?: Record<string, string | undefined>
): Promise<string[] | null>;

/** El texto que se imprime. No propone nada cuando todo cuadra. */
export function informe(resultado: { sinFila: string[]; sinFichero: string[] }): string;

export const AVISO_SIN_BASE: string;
export const AVISO_SIN_ALMACEN: string;
