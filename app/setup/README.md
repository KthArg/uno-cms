Creación del primer administrador (SPEC §7.3).

Exige el `SETUP_TOKEN` del entorno, de al menos 32 caracteres y comparado en tiempo constante,
con su propio límite de intentos. Una vez completado el bootstrap **devuelve 404** aunque la
variable siga definida: un 403 confirmaría que la ruta existe y que alguien se configuró ahí.

La contraseña se valida **antes** que el token, y es deliberado: al revés, recibir "contraseña
débil" en vez de "código incorrecto" confirmaría haber acertado el código.
