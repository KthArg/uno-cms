# 20 — Verificación en dos pasos, para todas las cuentas

> Escrita **antes** del código. Los casos de la sección 6 son la definición de "hecho".
>
> Cierra [#10](https://github.com/KthArg/uno-cms/issues/10), que SPEC §10.1 dejó fuera del MVP con
> la columna `totp_secret` ya reservada (ADR-004: «cifrado at-rest con APP_SECRET»). Viene de la
> auditoría de la spec 19: tapó agujeros, pero la contraseña seguía siendo el único factor.

## 1. Qué se pide

Que entrar en el panel exija, además de la contraseña, **un código de seis cifras** de una app de
autenticación (TOTP, RFC 6238). **Para todas las cuentas**, sin excepción de rol. Y que perder el
móvil no deje a nadie fuera para siempre: **diez códigos de recuperación** de un solo uso.

## 2. Las decisiones tomadas antes de diseñar

| Pregunta                             | Respuesta                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿A quién se exige?                   | **A todas las cuentas**, decidido por el dueño del producto (ADR-1400). Quien todavía no la tiene entra con su contraseña a una sesión que **solo** sirve para darla de alta                                                                                              |
| ¿Cómo se recupera el acceso?         | **Diez códigos de recuperación**, enseñados una vez al activarla. Cualquiera vale una vez en lugar del de la app. No hay «un admin te la quita»: decidido así. Si se pierden los dos, quien despliega la quita con `pnpm mfa:quitar <correo>`, que exige la base de datos |
| ¿Dónde se guarda el secreto?         | En `totp_secret`, **cifrado con AES-256-GCM** con una clave derivada de `APP_SECRET` por HKDF (ADR-004). Una copia de la base no basta para generar códigos                                                                                                               |
| ¿Y los códigos de recuperación?      | Solo su SHA-256. Tienen 50 bits al azar cada uno, así que no hace falta un hash lento; el bloqueo de cuenta limita los intentos igualmente                                                                                                                                |
| ¿Se puede repetir un código?         | **No.** Se guarda el último paso de 30 s aceptado y solo vale uno posterior, en una sentencia condicionada (la misma idea que ADR-1301)                                                                                                                                   |
| ¿Cuenta un código mal como un fallo? | **Sí**, en el mismo contador que la contraseña: el intento se reserva antes de verificar nada (ADR-1301). Para quien lo mira desde fuera, contraseña mal y código mal son el mismo fallo                                                                                  |
| ¿Dependencias nuevas?                | **Una:** `uqr`, sin dependencias propias, para pintar el QR como SVG en el servidor. El TOTP, el cifrado y los códigos son `node:crypto`                                                                                                                                  |

## 3. El flujo

1. **Acceso.** El formulario pide correo, contraseña y código. El código va en el mismo envío: un
   segundo paso separado diría «la contraseña era buena» antes de pedir el código, y eso es un
   oráculo de contraseñas.
2. **Cuenta con 2FA.** Sin código válido —de la app o de recuperación—, el mismo fallo de siempre.
3. **Cuenta sin 2FA.** La contraseña basta para entrar, pero a una sesión marcada `mfa: 'alta'`
   que solo abre `/admin/verificacion`. El middleware redirige allí cualquier otra ruta del panel,
   el layout de `(panel)` la rechaza y el pipeline de actions la trata como sin sesión. **Tres
   capas**, porque Next no vuelve a ejecutar un layout en las navegaciones de cliente (#234).
4. **Alta.** Se genera un secreto, se guarda cifrado **sin activar** y se enseña el QR y el texto.
   Con un código válido se activa, se generan los diez de recuperación y se enseñan **una vez**.
   Al pulsar «Ya los he guardado» se cierran todas las sesiones (sube `password_version`) y se
   vuelve a entrar, ya con código.
5. **Después.** En «Tu cuenta», generar códigos de recuperación nuevos (exige un código válido;
   invalida los anteriores).

## 4. Fuera de alcance

- **Quitarse la 2FA desde el panel.** Es obligatoria: no hay botón para apagarla.
- **WebAuthn / llaves físicas.** Otra fase.
- **Recordar el dispositivo.** Cada acceso pide código; la sesión ya dura siete días.

## 5. Contratos

- `cms/segundo-factor.ts` (isomórfico, sin `server-only`, como `cms/routes.ts`: lo importan el
  servidor, la suite e2e y la de humo para calcular códigos): `generarSecreto()`,
  `codigoTotp(secreto, instante)`, `verificarTotp(secreto, codigo, instante)` → el paso aceptado
  o `null`, `cifrarSecreto(secreto, appSecret)`, `descifrarSecreto(cifrado, appSecret)`,
  `generarCodigosDeRecuperacion()`, `huellaDeRecuperacion(codigo)`, `uriOtpauth(secreto, cuenta)`.
- `users` gana `totp_activado_en` (timestamptz), `totp_ultimo_paso` (integer) y
  `codigos_recuperacion` (text[]).
- `authenticate({ email, password, codigo?, ip?, userAgent? })` devuelve además
  `mfa: 'ok' | 'alta'`. El JWT lleva el claim `mfa`, y `session.user.mfa`.
- `RUTAS_DE_ALTA_DEL_SEGUNDO_FACTOR` en `cms/routes.ts`: la única ruta del panel que admite una
  sesión `alta`, con su propio guard.

## 6. Casos

### El algoritmo

- **T-V-1** `codigoTotp` da los códigos de los vectores de prueba del RFC 6238 (SHA-1), y
  `verificarTotp` acepta el paso anterior y el siguiente, y ninguno más.
- **T-V-2** Cifrar y descifrar el secreto lo devuelve igual; con otro `APP_SECRET`, o con un byte
  cambiado, falla en vez de devolver basura.
- **T-V-3** Diez códigos de recuperación distintos, con el formato `XXXXX-XXXXX`, y su huella no
  depende de mayúsculas ni del guion.

### El acceso

- **T-V-4** Una cuenta con 2FA no entra sin código, con un código equivocado ni con uno de hace
  tres pasos; entra con el actual.
- **T-V-5** El mismo código no vale dos veces (ni a la vez: dos intentos concurrentes, entra uno).
- **T-V-6** Un código de recuperación entra una vez, y la segunda no.
- **T-V-7** Un código equivocado cuenta en el bloqueo igual que una contraseña mal.
- **T-V-8** Una cuenta sin 2FA entra con contraseña a una sesión `alta`.

### La sesión a medio entrar

- **T-V-9** Con sesión `alta`, el middleware manda cualquier ruta del panel a
  `/admin/verificacion`, y el layout de `(panel)` también.
- **T-V-10** Con sesión `alta`, ninguna action del pipeline se ejecuta: `UNAUTHORIZED`.
- **T-V-11** `/admin/verificacion` sin sesión lleva al acceso; con sesión `ok`, al panel.

### El alta

- **T-V-12** Activar exige un código válido del secreto pendiente; uno mal no activa nada.
- **T-V-13** Una cuenta que ya la tiene activada no puede darla de alta otra vez (no se pisa el
  secreto).
- **T-V-14** El secreto se guarda cifrado: en la base no aparece en claro.
- **T-V-15** Terminar el alta cierra todas las sesiones de la cuenta.
- **T-V-16** e2e: una cuenta nueva entra, la dan de alta con el QR, vuelve a entrar con código y
  llega al panel.

### Después

- **T-V-17** Generar códigos de recuperación nuevos exige un código válido e invalida los viejos.
- **T-V-18** `pnpm mfa:quitar <correo>` la quita y cierra las sesiones de esa cuenta.
- **T-V-19** La suite de humo entra con el código calculado de `HUMO_TOTP_SECRET`.
