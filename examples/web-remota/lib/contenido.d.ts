/** Ver `contenido.js`. La declaración existe para que los tests del repositorio lo importen. */
export function pedirPublicado(
  cmsUrl: string,
  buscar?: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
): Promise<Record<string, unknown>>;
