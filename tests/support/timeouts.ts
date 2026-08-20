/**
 * El plazo para los tests unitarios que **cargan un módulo pesado** (issue #140).
 *
 * ## Por qué hace falta un número aquí y no el de por defecto
 *
 * El proyecto `unit` usa el límite de vitest por defecto: 5 s. Está bien para lo que hace la
 * inmensa mayoría de esos tests, que es llamar a una función pura.
 *
 * Un puñado hace otra cosa: su primer acto es un `import` dinámico que arrastra un grafo
 * entero —todas las actions con su base de datos y sus esquemas, la página de la landing, un
 * módulo nativo—, transpilándolo la primera vez. Eso no tarda 5 s casi nunca; tarda 5 s el día
 * que el disco está ocupado, y entonces el test se pone rojo sin que nada se haya roto. Pasó
 * una vez con `T-75-6`, justo después de un `pnpm lint`.
 *
 * ## Por qué no se sube el límite del proyecto entero
 *
 * Porque en un test que **sí** debería ser rápido, agotar el tiempo es información: dice que
 * algo se ha vuelto lento. Subirlo en bloque taparía ese aviso en todos para arreglar tres.
 *
 * ## Cuándo usar esto
 *
 * Cuando el test empiece cargando un módulo grande y **su duración no sea parte de lo que
 * mide**. Si lo que se mide es cuánto tarda algo, este plazo no es el instrumento: mídelo.
 */
export const CARGA_DE_MODULO_MS = 30_000;
