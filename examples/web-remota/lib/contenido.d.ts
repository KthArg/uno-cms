/** Ver `contenido.js`. La declaración existe para que los tests del repositorio lo importen. */
import type { Almacen } from './almacen.js';

type Buscar = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export function pedirPublicado(cmsUrl: string, buscar?: Buscar): Promise<Record<string, unknown>>;

export function contenidoParaLaPagina(
  cmsUrl: string,
  almacen: Almacen,
  buscar?: Buscar
): Promise<Record<string, unknown>>;
