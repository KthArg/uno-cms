Autenticación (SPEC §7.1, ADR-004). Todo módulo aquí importa `server-only`.

`authenticate.ts` es el núcleo, separado a propósito de la configuración de Auth.js: es lo que
hay que poder ejercitar contra una base de datos real —bloqueo, enumeración, contadores— sin
levantar media librería.

Su regla de oro: **hacia fuera, todos los fallos son iguales**, incluido el tiempo. Por eso el
correo inexistente y la cuenta desactivada verifican igualmente un hash señuelo.

También viven aquí el bootstrap (`setup.ts`) y el canje de invitaciones (`invitations.ts`), que
son flujos **sin sesión** y por eso no pueden ser actions (ADR-412).
