import type { Pool } from 'pg';

export declare const USO: string;
export declare function quitarSegundoFactor(pool: Pool, correo: string): Promise<boolean>;
