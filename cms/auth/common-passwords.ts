import 'server-only';

/**
 * Contraseñas comunes rechazadas por la política (SPEC §5.3: "chequeo contra lista de
 * comunes").
 *
 * **Embebida en el repositorio, no descargada.** Una comprobación de seguridad que depende
 * de la red falla abierta el día que la red falla, y ese día nadie se entera: la contraseña
 * se acepta y todo parece normal.
 *
 * La lista incluye español porque el panel es para hispanohablantes (SPEC §9) y las listas
 * publicadas más conocidas están sesgadas al inglés. Se guarda en minúsculas y sin acentos;
 * la comparación normaliza la entrada igual, para que `Contraseña123` no se cuele por ser
 * la misma palabra escrita distinto.
 *
 * **Limitación conocida (ADR-302):** una lista finita envejece y no cubre las contraseñas
 * malas que no son comunes. `abcdefghijklm` tiene doce caracteres, no está aquí, y es mala.
 * Un medidor de entropía haría más trabajo y es post-MVP.
 */
const COMMON_PASSWORDS: readonly string[] = [
  // Las universales.
  'password',
  'passw0rd',
  'password1',
  'password123',
  'password1234',
  'passwordpassword',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '12345678910',
  '111111111111',
  '000000000000',
  'qwertyuiop',
  'qwertyuiopasdfgh',
  'qwerty123456',
  'asdfghjkl',
  'zxcvbnm',
  '1q2w3e4r5t6y',
  'iloveyou',
  'iloveyou123',
  'letmein',
  'letmein123',
  'welcome',
  'welcome123',
  'welcometoyou',
  'admin',
  'administrator',
  'admin123456',
  'administrador',
  'superadmin',
  'root',
  'rootpassword',
  'changeme',
  'changeme123',
  'default',
  'defaultpassword',
  'secret',
  'secretpassword',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'starwars',
  'trustno1',
  'whatever',
  'qazwsxedc',
  'abcd1234',
  'abcd123456',
  'abc123456789',
  'test1234',
  'testtesttest',
  'temporal',
  'temporary1',

  // Español, que es el idioma del panel.
  'contrasena',
  'contrasena1',
  'contrasena123',
  'contrasenia',
  'micontrasena',
  'clave',
  'clave123',
  'claveclave',
  'usuario',
  'usuario123',
  'bienvenido',
  'bienvenido1',
  'hola12345678',
  'holaquetal',
  'teamo123456',
  'teamomucho',
  'mivida12345',
  'familia1234',
  'estrella123',
  'primavera123',
  'verano12345',
  'invierno123',
  'barcelona123',
  'realmadrid1',
  'madrid12345',
  'espana12345',
  'mexico12345',
  'argentina12',
  'colombia123',
  'venezuela12',
  'santiago123',
  'sevilla1234',
  'valencia123',
  'jugador1234',
  'futbol12345',
  'cumpleanos1',
  'administrar',
  'empresa1234',
  'miempresa12',
  'trabajo1234',
  'oficina1234',
];

const NORMALIZED = new Set(COMMON_PASSWORDS.map(normalizePassword));

/**
 * Normaliza para comparar: minúsculas y sin diacríticos.
 *
 * Sin esto, `Contraseña123` no coincidiría con `contrasena123` y la lista dejaría pasar la
 * misma palabra escrita de otra forma — que es exactamente lo que hace la gente cuando un
 * formulario le rechaza una contraseña.
 */
export function normalizePassword(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function isCommonPassword(value: string): boolean {
  return NORMALIZED.has(normalizePassword(value));
}

/** Solo para tests: comprobar que la lista no se ha quedado vacía por accidente. */
export const commonPasswordCount = COMMON_PASSWORDS.length;
