/** Ver `pagina.js`. Las declaraciones existen para que los tests del repositorio lo importen. */
export function escapar(valor: unknown): string;
export function texto(nodo: unknown): string;
export function jsonParaScript(valor: unknown): string;
export function paginaHtml(contenido: Record<string, unknown>, cmsUrl: string): string;
