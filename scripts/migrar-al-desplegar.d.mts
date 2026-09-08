/**
 * El contrato del script de migraciones, para que un test en TypeScript pueda importarlo.
 *
 * El script es `.mjs` porque lo ejecuta `node` a secas desde `pnpm build`, antes de que exista
 * nada compilado. Sin esta declaración, importarlo desde un test sería un `any` implícito y
 * `tsc --noEmit` lo rechaza — que es lo que queremos: lo que no se declara, no se usa por error.
 */

/**
 * Si hay que aplicar migraciones o saltárselas, según el entorno.
 *
 * `'saltar'` es «no hay base a la que migrar»; `'saltar-vista-previa'` es «la hay y no se toca»
 * (#254). Son dos valores y no uno porque el aviso que se imprime tiene que decir cosas
 * distintas: el primero significa que la base **no está preparada** y el segundo que está
 * intacta a propósito.
 */
export function decidir(
  entorno: Record<string, string | undefined>
): 'migrar' | 'saltar' | 'saltar-vista-previa';

/** El aviso que se lee en el registro de la construcción cuando no hay base de datos. */
export const AVISO_SIN_BASE: string;

/** El aviso cuando se salta por ser una vista previa. */
export const AVISO_VISTA_PREVIA: string;
