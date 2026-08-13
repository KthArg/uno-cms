// T-06-1: rotura deliberada para demostrar que `ci` se pone en rojo.
// SPEC §7.1 "Inyección SQL": la regla no-restricted-syntax debe saltar aquí.
import { sql } from 'drizzle-orm';
export const unsafe = (input: string) => sql.raw(input);
