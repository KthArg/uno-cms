import { handlers } from '@/cms/auth';

/**
 * Rutas de Auth.js (SPEC §3, §5.3).
 *
 * Runtime de Node explícito: el proveedor de credenciales verifica con Argon2, que es un
 * módulo nativo y no existe en edge. Sin esta línea, Next podría elegir edge y el login
 * fallaría en producción con un error que no apunta a su causa.
 */
export const runtime = 'nodejs';

export const { GET, POST } = handlers;
