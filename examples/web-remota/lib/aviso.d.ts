/** Ver `aviso.js`. La declaración existe para que los tests del repositorio lo importen. */
import type { SobreDeAviso } from './almacen.js';

export function verificarAviso(opciones: {
  cuerpoCrudo: unknown;
  cabeceras: { get(nombre: string): string | null };
  secreto: unknown;
  ahora?: () => number;
}): { ok: true; sobre: SobreDeAviso } | { ok: false };
