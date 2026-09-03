# 13 — Entrar con Google

> Escrita **antes** del código. Los casos de la sección 8 son la definición de "hecho".
>
> Origen: [#233](https://github.com/KthArg/uno-cms/issues/233). Toca la decisión más antigua del
> proyecto —ADR-004— así que lo primero de este documento es decir en qué la toca y en qué no.

## 1. Lo que ADR-004 decidió, y por qué esto no lo deroga

`SPEC.md` ADR-004 se titula, literalmente, «Auth.js v5 (credentials) + Argon2id, **sin proveedor
externo**», y su primera línea da el motivo:

> Un CMS auto-hospedado por un principiante no puede depender de configurar OAuth de Google.

Ese motivo sigue siendo bueno, **y solo se sostiene sobre la palabra «depender»**. Lo que no se
puede es _obligar_ a quien despliega esto a crear un cliente de OAuth en la consola de Google
para que su panel arranque. Ofrecerlo a quien quiera no rompe nada de eso.

Así que la desviación es acotada y se decide en ADR-900: **Google es opcional y aditivo**. Sin
sus dos variables de entorno, este hito no existe — ni proveedor, ni botón, ni comportamiento
distinto en ninguna ruta. El formulario de correo y contraseña **no se retira nunca**, ni
siquiera con Google configurado: es el único camino que funciona sin depender de un tercero, y
retirarlo convertiría una caída de Google en quedarse fuera del propio panel.

## 2. La regla que lo hace seguro: Google no crea cuentas

Esta es la parte que no es de comodidad.

`SPEC.md` §7.3 promete dos cosas: que **nunca existen credenciales por defecto** y que el primer
administrador sale del `SETUP_TOKEN`. A partir de ahí, las cuentas nacen por invitación
(ADR-412), con su rol puesto por un administrador.

Un proveedor externo que creara la cuenta al entrar rompería las dos: cualquiera con una cuenta
de Google entraría al panel de cualquiera, y el rol lo decidiría el código en vez de una persona.

**Decisión: entrar con Google autentica, no autoriza.** Sustituye a la contraseña, no a la
invitación. El correo que devuelve Google tiene que corresponder a una fila de `users` que ya
exista y esté activa; si no, no se entra y **no se escribe nada**.

Lo que se pierde, dicho: un equipo con Google Workspace no puede dar de alta a los suyos de
golpe. Se acepta — el panel de personas ya existe y es donde se decide quién entra.

## 3. Las tres puertas que tiene que pasar

En este orden, y el orden importa porque cada una se puede comprobar sin la siguiente:

1. **Google dice que el correo está verificado** (`email_verified`). Sin esto, un proveedor de
   OpenID mal configurado —o una cuenta de Workspace cuyo dominio no se ha validado— podría
   afirmar un correo que quien entra no controla. Es una comprobación de una línea y es la que
   sostiene a las otras dos: si el correo no es de quien dice, buscarlo en `users` es peor que
   inútil.
2. **Ese correo existe en `users`**, comparado sin distinguir mayúsculas, que es el índice de
   ADR-201.
3. **La cuenta está activa** (ADR-409). Desactivar a alguien tiene que cerrarle también esta
   puerta, o `deactivateUser` sería una promesa a medias.

Lo que **no** es una puerta: el bloqueo por intentos fallidos. Está decidido en ADR-901 y el
resumen es que el bloqueo defiende la contraseña, y aquí no hay contraseña que defender.

## 4. La identidad que acaba en la sesión

Este es el detalle que más fácil se hace mal, y hace falta decirlo con precisión.

Auth.js, para un proveedor de OAuth, **descarta el `id` que devuelve `profile()` y pone un UUID
aleatorio en su lugar**. Está en `@auth/core`, en `getUserAndAccount`, con su comentario al lado:
el usuario debe ser independiente del proveedor. Es una decisión razonable de la librería y para
nosotros es una trampa, porque nuestro `id` **es** el de la fila de `users` y de él cuelgan la
auditoría, `updated_by`, `uploaded_by` y los guards de rol.

Así que el identificador de la fila viaja en un campo propio y el callback `jwt` lo pone en
`token.sub` a mano. La regla, escrita para que no se pierda:

> **De Google salen el correo y su verificación. Todo lo demás —identificador, nombre, rol,
> versión de contraseña— sale de la fila de `users`.**

## 5. Lo que NO cambia, y por qué conviene enumerarlo

- **El claim `pwdV` de ADR-301.** El callback `jwt` que comprueba la sesión en cada petición es
  el mismo, así que cambiar la contraseña o desactivar la cuenta echa igual a quien entró con
  Google. No hay una segunda ruta de sesión: hay dos formas de conseguir el mismo token.
- **El esquema de base de datos.** No hace falta tabla `accounts`: la sesión es JWT y no hay
  adaptador, así que no se persiste nada del proveedor. Cero migraciones.
- **`cms/auth/authenticate.ts`.** No se toca ni una línea. Google entra por otro fichero.
- **El middleware.** Su configuración de Auth.js no tiene proveedores a propósito —solo verifica
  la firma en edge—, así que no se entera de nada de esto.

## 6. La pantalla

El botón va **debajo** del formulario, separado por una línea con la palabra «o», y dice «Entrar
con Google» con el logotipo de Google al lado.

Dos cosas que no son decoración:

- **El logotipo es el de Google y no un dibujo de Lucide**, porque no hay ninguno: ADR-801 manda
  sobre los iconos de interfaz, y la marca de un tercero no es eso. Va en su propio fichero, con
  la excepción declarada y motivada en la guarda T-215-2.
- **El mensaje de rechazo dice lo que pasa.** «Esa cuenta de Google no puede entrar aquí» y no el
  mensaje único de §7.1. Está decidido en ADR-902: para llegar a ese mensaje hay que haberse
  autenticado antes en Google, así que el único correo sobre el que se puede preguntar es el
  propio.

## 7. Configuración

Dos variables, las dos opcionales y las dos hay que definirlas juntas:

```
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

Con una sola definida, **Google se queda apagado entero**. Es la misma regla que `PREVIEW_ORIGINS`
de ADR-701 y por el mismo motivo: media configuración que funciona a medias es peor que ninguna,
porque el fallo aparece al pulsar el botón y no al arrancar.

La dirección de retorno que hay que dar de alta en la consola de Google es
`https://<tu-dominio>/api/auth/callback/google`.

## 8. Casos de prueba

### Que sea opcional de verdad

- **T-233-1** — `googleConfigurado` es falso si falta cualquiera de las dos variables, y también
  si están definidas pero vacías.
- **T-233-2** — Sin las variables, `authConfig.providers` **no contiene** el proveedor de Google.
  La comprobación es sobre la configuración, no sobre la pantalla: un botón escondido con un
  proveedor vivo detrás seguiría siendo una puerta abierta.
- **T-233-3** — Con las dos, sí lo contiene, y el proveedor de credenciales sigue estando.

### Quién entra

- **T-233-4** — Correo verificado y cuenta activa: entra, con el identificador, el rol y la
  versión de contraseña **de la fila**.
- **T-233-5** — Correo que Google no da por verificado: no entra, y **no se llega a consultar la
  base de datos**. Se afirma contando las consultas, no leyendo el código.
- **T-233-6** — Correo que no existe en `users`: no entra.
- **T-233-7** — Cuenta desactivada: no entra.
- **T-233-8** — Cuenta con el bloqueo por intentos fallidos vigente: **sí entra** (ADR-901).

### La identidad

- **T-233-9** — El `sub` del token es el `id` de `users`, **no** el UUID que Auth.js genera para
  el perfil de OAuth.
- **T-233-10** — El rol del token sale de la fila y no del perfil: un perfil que traiga un rol
  inventado entra con el que dice la fila.

### Contra base de datos real

- **T-233-11** — `ANA@Ejemplo.com` encuentra la fila de `ana@ejemplo.com` (ADR-201).
- **T-233-12** — Un intento denegado no crea ninguna fila en `users`: la cuenta sigue sin existir
  después.
- **T-233-13** — Cada intento deja su rastro en `audit_log`: `login.success` con el proveedor
  anotado, y `login.fail` con el motivo (`correo-sin-verificar`, `cuenta-inexistente`,
  `cuenta-desactivada`).
- **T-233-14** — Después de `invalidateSessions`, la sesión que se abrió con Google deja de ser
  válida. ADR-301 no se salta por entrar por otra puerta.

### La pantalla

- **T-233-15** — Sin Google, la pantalla de acceso no ofrece el botón y el formulario sigue
  entero.
- **T-233-16** — Con Google, aparece el botón **y** el formulario sigue entero.
- **T-233-17** — `?error=AccessDenied` dice que esa cuenta no puede entrar; cualquier otro error
  sigue diciendo el mensaje único de §7.1.

### De extremo a extremo

- **T-233-18** — Pulsar «Entrar con Google» acaba en una petición a `accounts.google.com` con
  nuestro identificador de cliente y nuestra dirección de retorno. Es lo que demuestra que la CSP
  de §7.2 —`form-action 'self'`— no bloquea el viaje, que es la parte que ningún test unitario
  puede ver.

## 9. Lo que este hito no hace

- **No vincula cuentas.** No hay pantalla de «conectar mi Google»; la correspondencia es por
  correo y nada más. Si alguien cambia su correo en el panel, cambia con qué cuenta de Google
  entra, y eso es lo esperable.
- **No trae otros proveedores.** La estructura los admitiría casi igual, pero cada uno tiene sus
  reglas sobre la verificación del correo y darlas por equivalentes es la clase de suposición que
  se paga cara.
- **No sustituye a la invitación.** Ver §2.
