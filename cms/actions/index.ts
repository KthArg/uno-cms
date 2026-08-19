import 'server-only';

/**
 * Punto único de entrada a las server actions (SPEC §3, §5.3).
 *
 * **Toda action del proyecto se exporta desde aquí**, y hay un test que recorre este módulo
 * exigiendo que cada función exportada lleve la marca del envoltorio de `pipeline.ts`. Esa
 * es la forma verificable de cumplir "chequeo de rol en cada action" (SPEC §7.1): sin ella,
 * la mitigación depende de que nadie se despiste.
 *
 * Las actions llegan en #77–#82. Hoy este fichero solo publica el contrato.
 */

export {
  ACTION_MARKER,
  BUCKETS,
  defineAction,
  fail,
  ok,
  type Action,
  type ActionErrorCode,
  type ActionFieldError,
  type ActionResult,
  type ActionSession,
  type Role,
} from './pipeline';
