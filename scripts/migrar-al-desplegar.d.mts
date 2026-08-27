/**
 * El contrato del script de migraciones, para que un test en TypeScript pueda importarlo.
 *
 * El script es `.mjs` porque lo ejecuta `node` a secas desde `pnpm build`, antes de que exista
 * nada compilado. Sin esta declaración, importarlo desde un test sería un `any` implícito y
 * `tsc --noEmit` lo rechaza — que es lo que queremos: lo que no se declara, no se usa por error.
 */

/** Si hay que aplicar migraciones o saltárselas, según el entorno. */
export function decidir(entorno: Record<string, string | undefined>): 'migrar' | 'saltar';

/** El aviso que se lee en el registro de la construcción cuando no hay base de datos. */
export const AVISO_SIN_BASE: string;
