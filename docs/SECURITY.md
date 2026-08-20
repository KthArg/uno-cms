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

| Amenaza                     | Qué la mitiga                                                                                                                                                                                         | Evidencia                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuerza bruta en login**   | Límite por IP+correo, bloqueo incremental (5 fallos → 15 min, exponencial), Argon2id con parámetros OWASP y **un solo mensaje** para todos los fallos                                                 | T-59-5 y T-59-7 (el bloqueo, y que un intento no lo alargue), T-57-1 (el limitador), T-59-2 y T-59-3 (mensaje único)                                            |
| **XSS vía contenido**       | El render **no sanea una cadena: no construye ninguna**. `<RichText>` emite elementos de React según la allowlist de §6.3 (ADR-107), y los enlaces se validan al guardar **y al pintarlos** (ADR-500) | T-H-1 a T-H-5, y el test de la regla de lint que prohíbe `dangerouslySetInnerHTML` sin excepciones                                                              |
| **CSRF**                    | Las Server Actions comprueban `Origin`/`Host`; además el middleware rechaza mutaciones con `Origin` ajeno; cookies `SameSite=Lax`                                                                     | T-60-7, en los dos sentidos: una mutación con origen ajeno se rechaza y un GET no                                                                               |
| **Clickjacking**            | CSP `frame-ancestors 'self'`. **No hay `X-Frame-Options`**, y es deliberado: `DENY` bloquearía el iframe de la vista previa, que es del mismo origen y es la razón de ser del producto                | T-60-3 y T-N-1                                                                                                                                                  |
| **Inyección SQL**           | Drizzle parametriza todo; una regla de ESLint prohíbe `sql.raw` con entrada de usuario                                                                                                                | El test de las reglas de seguridad de ESLint, que comprueba que **fallan** cuando deben                                                                         |
| **Escalada de privilegios** | Rol comprobado en el servidor y **desde la sesión**, nunca desde la entrada; guard `LAST_ADMIN`; y el rol también en cada página de administración                                                    | T-75-6 (ninguna action se salta el envoltorio) y T-E-4 (la ruta cierra, no solo el menú)                                                                        |
| **Robo de sesión**          | Cookie `httpOnly Secure SameSite=Lax`, JWT firmado, 7 días, e invalidación al cambiar la contraseña por el claim `pwdV` (ADR-301)                                                                     | T-59-10 y T-60-2                                                                                                                                                |
| **Abuso de uploads**        | Sesión para emitir el token, allowlist de tipos, 10 MB, nombre generado y **SVG rechazado**; todo decidido en el servidor al emitir el token, no en el `accept` del formulario                        | T-D-1 a T-D-6                                                                                                                                                   |
| **Enumeración**             | Un solo resultado para todos los fallos de acceso, y 404 uniforme donde responder distinto confirmaría que algo existe                                                                                | T-59-3, T-59-4 (el señuelo, afirmado contando la llamada), T-59-12 (cuenta desactivada), T-E-6 (invitación ya usada), T-I-2 (vista previa)                      |
| **Secretos en cliente**     | `server-only` sobre `cms/{core,db,auth,security}`, en dos capas: un test estático sobre las cabeceras y el error de compilación, este último demostrado con una fuga deliberada                       | El test de la frontera y el de la exención `// isomorphic:`, que comprueba que el módulo exento no emite JavaScript                                             |
| **Dependencias**            | `pnpm audit --audit-level=high` bloqueante en CI y Dependabot semanal                                                                                                                                 | El propio job de `audit`. Puso en rojo el PR de Lighthouse al añadir una herramienta con tres vulnerabilidades altas transitivas, que es exactamente su trabajo |

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

### Publicar todo depende de que la pestaña siga abierta

El bucle que encadena las llamadas vive en el cliente (ADR-600). Cerrar la pestaña a mitad deja
el sitio publicado a medias: **sin perder nada**, porque cada entrada se confirma por separado,
pero sin terminar.

### Las acciones de GitHub se referencian por etiqueta, no por SHA

`actions/checkout@v7` es una etiqueta mutable: si el repositorio de esa acción se comprometiera,
pasaría a ejecutar otra cosa en el runner —con el checkout delante y con red— sin que ningún
diff nuestro cambiara.

**Decisión, revisada en M6 y no heredada de M0:** se mantiene. Las cuatro acciones son oficiales
de GitHub, el workflow corre con `permissions: contents: read`, y **ningún job tiene secretos del
repositorio**: los de CI son de usar y tirar y están escritos en el propio fichero. Anclar por
SHA convierte cada actualización en un commit a mano, y con Dependabot vigilando las acciones el
coste supera al riesgo **en este proyecto**. En uno con secretos de despliegue en CI, la
respuesta sería la contraria.

### `pnpm install` ejecuta scripts de instalación en algunos jobs

`sharp` y `esbuild` los necesitan. En los jobs que no, se pasa `--ignore-scripts` (#23).
Reducirlo más exigiría prescindir de uno de los dos.

## Cabeceras (`SPEC.md` §7.2)

Verificadas sobre **respuestas reales** de todas las clases de ruta —landing, panel con sesión,
vista previa, API pública, subida de imágenes y `/setup`— y no sobre lo que el middleware cree
que devuelve: un test unitario del middleware pasaría igual si el `matcher` estuviera mal y no
se ejecutara nunca.

Casos: T-60-2 a T-60-6 y T-N-1.

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
  `.env.example` con qué pasa si se filtra cada uno.

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
- Dependabot semanal para npm y para las acciones de GitHub.
