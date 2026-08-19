import type { ActionFieldError } from '@/cms/actions/pipeline';

/**
 * Traduce el fallo de una publicación a una frase que el editor entienda.
 *
 * ## Por qué vive aquí y no en el componente que lo usa
 *
 * Estaba exportado desde `PublishAllButton.tsx`, que lleva `'use client'`. El dashboard lo
 * llamaba **desde una Server Action** para traducir el resultado de `publishAll`, y eso
 * revienta con "Attempted to call motivoLegible() from the server but motivoLegible is on the
 * client".
 *
 * No lo vio nadie durante semanas porque solo ocurre cuando `publishAll` devuelve **fallos**:
 * con todo publicable, la rama no se ejecuta. Lo destapó un e2e que dejó una sección sin poder
 * publicarse a propósito.
 *
 * Este módulo no lleva directiva: es lógica pura, sin estado ni efectos, y por eso puede
 * usarse desde los dos lados. Es la segunda vez en M4 que la frontera servidor/cliente muerde
 * de una forma que `typecheck` y `build` no ven — la primera fue pasar una flecha como Server
 * Action (#108).
 */
export function motivoLegible(codigo: string, campos?: readonly ActionFieldError[]): string {
  if (codigo === 'VALIDATION_FAILED' && campos !== undefined && campos.length > 0) {
    return campos.map((campo) => campo.message).join(' ');
  }
  if (codigo === 'VERSION_CONFLICT') return 'Alguien la modificó mientras publicabas.';
  return 'No se ha podido publicar. Vuelve a intentarlo.';
}
