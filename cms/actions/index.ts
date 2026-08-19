import 'server-only';

/**
 * Punto único de entrada a las server actions (SPEC §3, §5.3).
 *
 * **Toda action del proyecto se exporta desde aquí**, y hay un test que recorre este módulo
 * exigiendo que cada función exportada lleve la marca del envoltorio de `pipeline.ts`. Esa
 * es la forma verificable de cumplir "chequeo de rol en cada action" (SPEC §7.1): sin ella,
 * la mitigación depende de que nadie se despiste.
 *
 * Las actions restantes llegan en #78–#82.
 */

export {
  ACTION_MARKER,
  BUCKETS,
  defineAction,
  fail,
  failFields,
  fieldsFromZod,
  ok,
  type Action,
  type ActionErrorCode,
  type ActionFieldError,
  type ActionResult,
  type ActionSession,
  type Role,
} from './pipeline';

export {
  createItem,
  deleteItem,
  publish,
  publishAll,
  reorderItems,
  restoreRevision,
  revertDraft,
  saveDraft,
} from './content.actions';

export { changePassword, deactivateUser, inviteUser, updateUserRole } from './user.actions';

export { createPreviewToken, updateSettings } from './settings.actions';
