# Seguridad

> **Estado: completo.** La tabla de amenazas de `SPEC.md` §7.1 está cerrada fila por fila, y cada
> una dice **qué test la sostiene** — un test que se ejecuta, no una afirmación. Hay un caso,
> T-N-5, que comprueba que los identificadores citados aquí existen de verdad en la suite: un
> documento no se ejecuta, y una cita rota no se nota.

## Reportar una vulnerabilidad

**No abras un issue público.** Usa el aviso de seguridad privado de GitHub:

<https://github.com/KthArg/uno-cms/security/advisories/new>

Incluye, en la medida de lo posible: versión o commit afectado, pasos para reproducirlo, qué
consigue un atacante con ello, y si ya está siendo explotado.

> **Si has llegado aquí desde un fork, esa URL no es la tuya.** UnoCMS se despliega haciendo fork
> del repositorio (`SPEC.md` §9), y GitHub no reescribe las URL de este fichero al copiarlo. Un
> fallo en **tu** despliegue —una mala configuración, un secreto filtrado, contenido de tus
> usuarios— se reporta en **tu** repositorio:
> `https://github.com/<tu-usuario>/<tu-repo>/security/advisories/new`. Aquí solo tienen sentido
> los fallos del código de UnoCMS, que afectan a todo el que lo haya desplegado.

Al ser un proyecto mantenido por una sola persona, no hay compromiso de tiempo de respuesta. Se
responderá tan pronto como sea posible. Decirlo así es más útil que prometer 72 horas y no
cumplirlas.

## Alcance

UnoCMS se despliega **auto-hospedado**: cada instalación es de quien la despliega. No hay un
servicio central que comprometer. Un fallo aquí afecta a quien haya desplegado el código, no a
una infraestructura compartida.

Entra en alcance todo lo del repositorio. Queda fuera lo que aporta la infraestructura de quien
despliega (Vercel, Neon, Vercel Blob) y las malas configuraciones del propio despliegue, salvo
que la culpa sea de un valor por defecto inseguro del proyecto — en cuyo caso sí es un fallo
nuestro.

## Modelo de amenazas (`SPEC.md` §7.1)

Cada fila con la mitigación **y el test que la sostiene**. Donde no hay test, lo dice.

| Amenaza                     | Qué la mitiga                                                                                                                                                                                                                                                                                                                                                                                                       | Evidencia                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuerza bruta en login**   | Límite por IP+correo, bloqueo incremental (5 fallos → 15 min, exponencial), Argon2id con parámetros OWASP y **un solo mensaje** para todos los fallos. El intento se **reserva antes de verificar**, así que intentos en paralelo no lo esquivan (ADR-1301); cambiar la contraseña cuenta igual; y la IP del límite es la que añade el proxy, no la que escribe el cliente (ADR-1302)                               | T-59-5 y T-59-7 (el bloqueo, y que un intento no lo alargue), T-57-1 (el limitador), T-59-2 y T-59-3 (mensaje único), T-S-3 (veinte intentos a la vez), T-S-6 (desde «Cambiar contraseña»), T-S-9 (la IP)                 |
| **XSS vía contenido**       | El render **no sanea una cadena: no construye ninguna**. `<RichText>` emite elementos de React según la allowlist de §6.3 (ADR-107), y los enlaces se validan al guardar **y al pintarlos** (ADR-500). Una imagen solo acepta `https` o el almacén local, y las allowlist no aceptan lo heredado (`constructor`, `__proto__`)                                                                                       | T-H-1 a T-H-5, y el test de la regla de lint que prohíbe `dangerouslySetInnerHTML` sin excepciones, T-S-16 y T-S-18                                                                                                       |
| **CSRF**                    | Las Server Actions comprueban `Origin`/`Host`; además el middleware rechaza mutaciones con `Origin` ajeno; cookies `SameSite=Lax`                                                                                                                                                                                                                                                                                   | T-60-7, en los dos sentidos: una mutación con origen ajeno se rechaza y un GET no                                                                                                                                         |
| **Clickjacking**            | CSP `frame-ancestors 'self'`. **No hay `X-Frame-Options`**, y es deliberado: `DENY` bloquearía el iframe de la vista previa, que es del mismo origen y es la razón de ser del producto                                                                                                                                                                                                                              | T-60-3 y T-N-1                                                                                                                                                                                                            |
| **Redirección abierta**     | Tras entrar solo se va a `/admin`, por una función que usan las dos ramas de la página de acceso: la de quien ya tenía sesión redirigía a cualquier URL (spec 19). Los enlaces del contenido rechazan `\`, que el navegador lee como `/`                                                                                                                                                                            | T-S-1 y T-S-2                                                                                                                                                                                                             |
| **Inyección SQL**           | Drizzle parametriza todo; una regla de ESLint prohíbe `sql.raw` con entrada de usuario                                                                                                                                                                                                                                                                                                                              | El test de las reglas de seguridad de ESLint, que comprueba que **fallan** cuando deben                                                                                                                                   |
| **Escalada de privilegios** | Rol comprobado en el servidor y **desde la sesión**, nunca desde la entrada; guard `LAST_ADMIN`; y el rol también en cada página de administración. Borrar elementos de colección es de administración en el servidor, no solo en la interfaz (ADR-1300)                                                                                                                                                            | T-75-6 (ninguna action se salta el envoltorio) y T-E-4 (la ruta cierra, no solo el menú), T-S-17                                                                                                                          |
| **Robo de sesión**          | Cookie `httpOnly Secure SameSite=Lax`, JWT firmado, 7 días, e invalidación al cambiar la contraseña por el claim `pwdV` (ADR-301). Los 7 días valen **también** en la cookie que reemite el middleware, que antes ponía 30, y hay vida absoluta: 7 días desde que se entra, se use o no. Sin un `AUTH_SECRET` de 32 caracteres no hay sesión                                                                        | T-59-10 y T-60-2, T-S-7, T-S-8 y T-S-10                                                                                                                                                                                   |
| **Abuso de uploads**        | Sesión para emitir el token, allowlist de tipos, 10 MB, nombre generado y **SVG rechazado**; todo decidido en el servidor al emitir el token, no en el `accept` del formulario. El tamaño va **firmado dentro del token** (`maximumSizeInBytes`) y lo aplica Vercel; y solo se registra o se optimiza lo que viene del almacén de **este** despliegue, no de cualquiera de Vercel                                   | T-D-1 a T-D-6, T-S-11, T-S-13 y T-S-14                                                                                                                                                                                    |
| **Enumeración**             | Un solo resultado para todos los fallos de acceso, y 404 uniforme donde responder distinto confirmaría que algo existe. La cuenta bloqueada también paga el señuelo                                                                                                                                                                                                                                                 | T-59-3, T-59-4 (el señuelo, afirmado contando la llamada), T-59-12 (cuenta desactivada), T-E-6 (invitación ya usada), T-I-2 (vista previa), T-S-4                                                                         |
| **Secretos en cliente**     | `server-only` sobre `cms/{core,db,auth,security}`, en dos capas: un test estático sobre las cabeceras y el error de compilación, este último demostrado con una fuga deliberada                                                                                                                                                                                                                                     | El test de la frontera y el de la exención `// isomorphic:`, que comprueba que el módulo exento no emite JavaScript                                                                                                       |
| **Salida hacia un tercero** | El aviso al publicar (spec 16) es la primera petición que **sale** de este CMS. Se acota por todos los lados: destino y secreto **solo por entorno** —no hay formulario que apunte nuestro servidor a donde alguien quiera—, `https` obligatorio fuera del bucle local, secreto **propio** y no `APP_SECRET`, y **sin seguir redirecciones**, que llevarían la firma y el cuerpo a un host que no es el configurado | T-A-3 y T-A-3b (`https`, y que no se cuela un host disfrazado de `localhost`), T-A-9 (la firma no sale con `APP_SECRET`), T-A-10 (ni secreto ni firma llegan a la auditoría), y el caso de la redirección que no se sigue |
| **Dependencias**            | `pnpm audit --audit-level=high` bloqueante en CI y Dependabot mensual (#307). Las acciones de terceros de CI, ancladas por SHA; el token, fuera de `.git/config`                                                                                                                                                                                                                                                    | El propio job de `audit`. Puso en rojo el PR de Lighthouse al añadir una herramienta con tres vulnerabilidades altas transitivas, que es exactamente su trabajo; T-S-21                                                   |

## Limitaciones conocidas

Lo que **no** está cubierto, dicho aquí en vez de omitido. Un modelo de amenazas incompleto que
parece completo es peor que no tenerlo.

### El límite de intentos es por instancia, no global

`SPEC.md` §2 contempla Upstash "(opcional) con fallback in-memory". Está implementado **solo el
fallback**, y en serverless cada instancia tiene su contador: el límite efectivo se multiplica
por el número de instancias vivas.

**Por qué no se implementó** (issue #65, ADR-303): no hay ninguna instancia de Upstash contra la
que ejercitarlo, ni en local ni en CI. Añadir código de seguridad sin un solo test que lo
ejecute —en el módulo que decide cuántas veces se puede intentar adivinar una contraseña— tiene
un modo de fallo peor que no tenerlo: si la integración estuviera mal —una clave mal formada, un
error de red tratado como "permitido"— el límite dejaría de aplicarse y el sistema **seguiría
pareciendo protegido**.

**Qué lo mitiga mientras tanto:** el bloqueo de cuenta vive en la base de datos, es global y no
depende de esto. Es la defensa que de verdad sostiene el caso. Y el limitador **avisa de su
propia degradación** al arrancar, con un mensaje que dice qué implica.

**Cómo se cerraría:** implementar la misma interfaz `RateLimiter` con Upstash, con tests contra
una instancia real. La interfaz existe justo para eso, y quien la consume no cambia.

### Un enlace de vista previa no exige sesión

Vale dos horas y enseña el borrador de **una** sección (ADR-501). Quien lo tenga puede verlo sin
iniciar sesión: es lo que permite enseñarle un borrador a alguien sin darle cuenta, y también lo
que hace que compartirlo por error tenga consecuencias.

### Y desde ADR-701 hay un segundo token, que además sale de nuestro origen

El de la vista previa remota **viaja a un tercero**: aparece en la barra de direcciones de la web
de destino, y de ahí pasa a su historial y con toda probabilidad a los registros de su servidor.
Asumir que se filtra no es pesimismo, es el modo normal de fallo de algo escrito en un historial
ajeno.

Lo que se elige, entonces, no es si se filtra: es cuánto dura el daño y hasta dónde llega.

- **Propósito propio, `preview-remoto`.** Un token remoto no vale en `/preview` ni al revés, así
  que filtrar el que se le manda a la web de destino no entrega además la vista previa completa
  de este CMS (T-R-9, T-R-10).
- **Quince minutos, contra las dos horas del otro** (T-R-12), con un tope vigilado por un test
  para que no crezca sin que nadie lo note.
- **Y no existe sin `PREVIEW_ORIGINS`**, que además es una variable de entorno y no un ajuste del
  panel: la lista de quién puede leer borradores solo la cambia quien despliega (T-R-1, T-R-2).

Lo que **no** cubre: quien tenga el token dentro de su ventana de vida ve ese borrador. Es la
misma propiedad que el enlace de arriba, con quince minutos en vez de dos horas.

### Y qué protege de verdad la lista de orígenes, que no es lo que parece

La spec §4.1 dice que `PREVIEW_ORIGINS` "decide quién puede leer contenido sin publicar". Es
cierto a medias y conviene tenerlo claro antes de apoyarse en ella.

**La cabecera `Origin` la escribe quien hace la petición.** Un cliente que no sea un navegador
—`curl`, un script, un servidor— puede poner la que quiera, así que la lista no le impide nada:
con un token válido lee ese borrador. **El token es la credencial**, y por eso dura quince
minutos y no dos horas.

**Lo que la lista sí decide es qué páginas web pueden leer la respuesta**, y eso lo impone el
navegador, no nosotros: sin `Access-Control-Allow-Origin` con el origen exacto, el `fetch` de
otra web falla aunque el servidor haya respondido. La diferencia es entre "un token filtrado se
puede usar" —inevitable— y "cualquier página que visite quien edita puede leer sus borradores en
silencio", que es lo que pasaría con `*`.

Por eso `*` no aparece en ningún camino, y hay un test que lo comprueba (T-R-5).

### Publicar todo depende de que la pestaña siga abierta

El bucle que encadena las llamadas vive en el cliente (ADR-600). Cerrar la pestaña a mitad deja
el sitio publicado a medias: **sin perder nada**, porque cada entrada se confirma por separado,
pero sin terminar.

### Las acciones de GitHub se referencian por etiqueta, no por SHA

`actions/checkout@v7` es una etiqueta mutable: si el repositorio de esa acción se comprometiera,
pasaría a ejecutar otra cosa en el runner —con el checkout delante y con red— sin que ningún
diff nuestro cambiara.

**Decisión, revisada en la spec 19:** se mantiene **para las de `actions/`**, que son de GitHub.
Aquí decía antes «las cuatro acciones son oficiales de GitHub», y eran cinco: `pnpm/action-setup`
es de terceros y corría en todos los jobs. Esa va ahora anclada por SHA, y un test exige lo mismo
a cualquier acción de terceros que se añada (T-S-21). El workflow corre con
`permissions: contents: read`, **ningún job tiene secretos del repositorio** —los de CI son de
usar y tirar y están escritos en el propio fichero— y el checkout ya no deja el token en
`.git/config`. Anclar también las oficiales convierte cada actualización en un commit a mano, y
con Dependabot vigilándolas el coste supera al riesgo **en este proyecto**. En uno con secretos de
despliegue en CI, la respuesta sería la contraria.

**Lo que queda suelto:** el job de Lighthouse ejecuta `pnpm dlx @lhci/cli@0.15.1`, con la versión
fijada pero sus dependencias no, porque no pasan por nuestro `pnpm-lock.yaml`. Corre sin secretos
y solo lee la build; se acepta así.

### La IP no es fiable si `next start` se expone sin nada delante

El límite de intentos usa la IP que añade el proxy de delante (ADR-1302). Con `next start`
publicado directamente en internet no hay proxy: todo lo que llega en `X-Forwarded-For` lo escribe
el cliente, y Next no deja leer la dirección de la conexión. En ese montaje el límite por IP se
puede esquivar; **el bloqueo de cuenta no**, que es global y no depende de la IP. Está en
`.env.example`.

### Una imagen de otro almacén de Blob pasa la CSP

`img-src` admite `https://*.public.blob.vercel-storage.com`, que son todos los almacenes de todos
los clientes de Vercel. No se acota al nuestro a propósito (spec 19 §2): la CSP se construye en el
middleware, en edge, y leer allí `BLOB_READ_WRITE_TOKEN` arriesga que el empaquetador lo incruste
en su código. Con `script-src` cerrado, una imagen ajena no ejecuta nada. Lo que sí estaba abierto
—registrarla en la biblioteca y procesarla con nuestro optimizador— está cerrado (T-S-13, T-S-14).

### No se miran los bytes de lo que se sube

`allowedContentTypes` restringe el tipo **declarado**, no el contenido. Un fichero que dice ser
PNG y no lo es se sube igual. En producción se sirve desde el origen de Blob, no desde el nuestro,
así que un políglota no ejecuta en nuestro origen; el almacén local deduce el tipo de la extensión
y manda `nosniff`. Si algún día las imágenes se sirvieran desde nuestro propio origen, esto pasaría
a ser un hallazgo.

### `pnpm install` ejecuta scripts de instalación en algunos jobs

`sharp` y `esbuild` los necesitan. En los jobs que no, se pasa `--ignore-scripts` (#23).
Reducirlo más exigiría prescindir de uno de los dos.

## Cabeceras (`SPEC.md` §7.2)

Verificadas sobre **respuestas reales** de todas las clases de ruta —landing, panel con sesión,
vista previa, API pública, subida de imágenes y `/setup`— y no sobre lo que el middleware cree
que devuelve: un test unitario del middleware pasaría igual si el `matcher` estuviera mal y no
se ejecutara nunca.

Casos: T-60-2 a T-60-6 y T-N-1.

Además de las de §7.2, `Cross-Origin-Opener-Policy: same-origin` en todas (T-S-22): otra pestaña
no se queda con una referencia a esta ventana. Y la CSP se le pasa a Next en la **petición**, que
es de donde saca el nonce para sus propios `<script>`; un caso comprueba que cada uno lo lleva.

`X-Robots-Tag: noindex` va **solo** en `/admin`, `/preview`, `/api` y `/setup`. En la landing
sería un error caro: costaría el posicionamiento del sitio entero y nadie lo notaría hasta
semanas después. La misma lista la usa el sitemap para dejar esas rutas fuera (T-L-2), porque
`X-Robots-Tag` le dice al buscador que no indexe **después de haber ido a mirar**.

## Bootstrap y secretos (`SPEC.md` §7.3, §7.4)

- Sin usuarios, la landing **enseña el camino** a `/setup` en vez de redirigir (ADR-502). Se
  llega igual y la página sigue siendo cacheable.
- `/setup` exige un `SETUP_TOKEN` de al menos 32 caracteres, lo compara en tiempo constante,
  tiene su propio límite de intentos y **deja de existir** —404— una vez completado el
  bootstrap. Casos T-61-1 a T-61-7.
- Los tres secretos (`AUTH_SECRET`, `APP_SECRET`, `SETUP_TOKEN`) están documentados en
  `.env.example` con qué pasa si se filtra cada uno, y los tres exigen 32 caracteres **en el
  código**, no solo en la documentación: `AUTH_SECRET` no lo exigía hasta la spec 19 (T-S-10).

## Las barreras de proceso que sostienen todo esto (desde M0)

No son el modelo de amenazas; son lo que impide que se erosione.

- `main` protegida: sin PR con el check `ci` en verde no se escribe, ni siquiera siendo dueño del
  repositorio (ADR-105, verificado).
- ESLint prohíbe `dangerouslySetInnerHTML` sin excepciones (ADR-107) y `sql.raw`, con tests que
  comprueban que las reglas **fallan** cuando deben.
- Frontera `server-only` sobre `cms/{core,db,auth,security}`, en dos capas: un test estático
  sobre las cabeceras y el error de compilación de `server-only`, este último demostrado con una
  fuga deliberada.
- `pnpm audit --audit-level=high` bloqueante en CI, hoy limpio.
- Dependabot mensual para npm y para las acciones de GitHub (#307). Los avisos de seguridad no
  esperan a esa frecuencia: `pnpm audit` corre en el CI de cada PR.
