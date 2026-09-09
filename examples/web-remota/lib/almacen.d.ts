/** Ver `almacen.js`. La declaración existe para que los tests del repositorio lo importen. */
export interface SobreDeAviso {
  id: string;
  evento: string;
  ts: number;
  tags: string[];
}

export interface Almacen {
  sirveDeAqui(clave: string): boolean;
  leer(clave: string): unknown;
  versionDe(clave: string): number | undefined;
  guardar(clave: string, valor: unknown, vAlPedir?: number): void;
  /** `false` si el aviso era repetido. */
  aplicarAviso(sobre: SobreDeAviso): boolean;
  estado(): { clave: string; pendiente: boolean; v: number | undefined }[];
}

export function clavesDeTags(tags: unknown): string[];
export function crearAlmacen(): Almacen;
