# Cómo se trabaja en este repositorio

Este fichero existe porque **el producto estaba documentado y el proceso no**. Todo lo de aquí
se venía cumpliendo desde M0; lo que faltaba era que sobreviviera a un cambio de sesión.

Si vas a escribir código aquí, esto va antes que el código.

---

## Lo que no se negocia

**1. La spec va antes que el código.** Cada unidad de trabajo tiene su documento en
[`docs/specs/`](docs/specs/) con alcance, contratos y **casos de prueba numerados** que son la
definición de "hecho". Si un caso no se puede escribir, el diseño está mal y se cambia el diseño,
no el caso.

**2. Un issue por unidad de trabajo, una rama por issue.** El issue explica el problema y los
casos que lo cierran, no la solución.

**3. `main` está protegida.** No se empuja directamente; todo entra por PR con **squash merge**.

**4. Cada PR lleva una autorevisión escrita.** `gh pr review <n> --comment`, en prosa, con
hallazgos de verdad — y los hallazgos se arreglan en commits nuevos del mismo PR, no se dejan
apuntados. Una autorevisión que dice "todo bien" es peor que no escribirla: enseña a no leerlas.

**5. Nada vive solo en un comentario.** Lo aplazado va a
[`docs/PENDIENTES.md`](docs/PENDIENTES.md) con su motivo y su issue. Un pendiente que se escribe
en una autorevisión y no se sigue vale lo mismo que no escribirlo — ya pasó una vez (#162 → #164).

**6. Las contradicciones de la spec no se resuelven en silencio.** Van a un issue con la etiqueta
`spec-question` y se deciden en un ADR de [`docs/DECISIONS.md`](docs/DECISIONS.md). Si el ADR
deja desactualizado a `SPEC.md`, **se enmienda `SPEC.md`** — no se deja que el código lo
contradiga por su cuenta.

**7. Todo en español.** Comentarios, documentación, commits, issues, PR. El código —nombres de
símbolos— también, salvo lo que impone el framework.

---

## La mutación es la disciplina central

**Escribir el test no basta: hay que comprobar que puede fallar.** Se rompe la línea que el test
dice proteger y se mira si muere. Si sobrevive, el test no probaba nada — y eso ha pasado
**cinco veces** en este proyecto, siempre en código correcto con tests de adorno.

Dos reglas que salieron de equivocarse:

- **Muta el comportamiento, no la forma.** Quitar un `finally` dejando la línea justo después es
  equivalente si hay `catch`: los ocho tests pasaron y casi se escribe "comprobado por mutación".
  Tres de los cinco fallos fueron por esto.
- **Muta una copia y restaura desde la copia.** `cp` antes, `cp` de vuelta después. Un
  `git checkout` para deshacer una mutación **destruyó un documento sin commitear**.

Ejemplos reales de lo que la mutación cazó, para calibrar: un test de recorrido de directorios
que pasaba con la defensa quitada (acertaba por la extensión del fichero, no por la comprobación
que decía probar), y una validación de tamaño escrita "por seguridad" que no comprobaba nada
porque partía de una premisa falsa sobre `request.formData()`.

---

## Los comentarios

Explican **por qué**, no qué. Y hay una regla dura:

**Un comentario que promete lo que el código no hace es peor que no tener comentario.** Al
releerlo desactiva la sospecha justo en la línea donde hacía falta. Pasó en `/api/media/upload`:
decía "no sale nada que venga de dentro de Vercel" mientras devolvía `error.message` sin mirar, y
por ahí llegó `Vercel Blob: Failed to retrieve the client token` a la pantalla de alguien que
quería subir una foto.

Cuando un comentario justifica una decisión de seguridad, tiene que decir **de dónde sale** el
dato que la hace segura, para que el día que eso cambie el comentario se lea como la mentira que
sería.

---

## Comandos

```sh
pnpm dev                                    # http://localhost:3000
pnpm lint                                   # eslint --max-warnings=0
pnpm typecheck
pnpm vitest run --project unit --project ui # rápidos, sin base de datos
pnpm vitest run --project integration       # necesita DATABASE_URL
pnpm test:e2e                               # Playwright; construye y arranca `next start`
```

Las bases de datos en Docker (`unocms-db`), con `unocms:unocms`:

| Base          | Para                                  |
| ------------- | ------------------------------------- |
| `unocms_dev`  | `pnpm dev` en local, vía `.env.local` |
| `unocms_test` | los tests de integración              |
| `unocms_e2e`  | Playwright                            |

Los de integración y e2e **no inventan una base**: sin `DATABASE_URL` se saltan con un aviso. Un
test de integración que pasa sin base de datos no es un test de integración.

Para e2e en local hace falta exportar el entorno a mano, como en CI:

```sh
export DATABASE_URL="postgres://unocms:unocms@localhost:5432/unocms_e2e"
export AUTH_SECRET="...más de treinta y dos caracteres..."
export APP_SECRET="...otro distinto, también largo..."
```

### Dos trampas del entorno local

**No construyas nada mientras el servidor de desarrollo está levantado.** `pnpm build` y
`pnpm test:e2e` reescriben `.next` por debajo y el servidor empieza a dar
`Cannot find module './vendor-chunks/…'`. Parece un fallo de la aplicación y no lo es. Ha pasado
dos veces y las dos confundieron a quien estaba probando: para la suite e2e, para el servidor
antes.

**`.env.local` está en `.gitignore` y no se versiona.** Sin `BLOB_READ_WRITE_TOKEN`, las
imágenes van al disco en `.uploads/` (ADR-700), que es lo normal en local.

---

## Guardas automáticas que van a saltar

No son burocracia: cada una existe porque algo se coló.

| Guarda                                             | Qué impide                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `tests/unit/panel-espera-al-servidor.test.ts`      | Un `await` en `cms/ui` fuera de un `try`. Deja la pantalla bloqueada si cae la red |
| `tests/support/api-routes.ts`                      | Una ruta de `/api` sin declarar su nivel de acceso **y su motivo**                 |
| `tests/unit/readmes-de-directorio.test.ts`         | Un directorio con código sin README, o uno que promete un hito ya cerrado          |
| `tests/unit/modelo-de-amenazas.test.ts`            | Que `docs/SECURITY.md` cite tests que no existen                                   |
| `security/detect-non-literal-fs-filename` (eslint) | Operaciones de disco con ruta variable. **No cubre `rm`** — comprobado             |
| `import 'server-only'`                             | Que `cms/{core,db,auth,security}` llegue al navegador                              |

Si una salta, casi siempre tiene razón. Si de verdad no la tiene, se declara la excepción **con
su motivo escrito**, nunca se silencia a secas.

---

## Dónde está cada cosa

| Documento                                  | Qué contesta                                                |
| ------------------------------------------ | ----------------------------------------------------------- |
| [`SPEC.md`](SPEC.md)                       | Qué es el producto. Tiene enmiendas: léelas                 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)   | Qué se decidió donde la spec callaba, y **a cambio de qué** |
| [`docs/specs/`](docs/specs/)               | Alcance, contratos y casos de cada fase                     |
| [`docs/PROGRESS.md`](docs/PROGRESS.md)     | Estado real, y **qué toca ahora**                           |
| [`docs/PENDIENTES.md`](docs/PENDIENTES.md) | Lo aplazado y la deuda aceptada, con su motivo              |
| [`docs/SECURITY.md`](docs/SECURITY.md)     | Modelo de amenazas, cada fila citando sus tests             |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md)   | Levantar el proyecto y montarlo sobre otra landing          |

---

## Cómo se reporta

Distingue siempre **lo verificado** de **lo supuesto**, y dilo. En `docs/PROGRESS.md` hay dos
criterios de §11 marcados como _no verificados_ a propósito, porque nadie los ha ejecutado.

Dos frases que han costado caro aquí y conviene tener presentes:

- **"Arreglado" y "ha dejado de verse" no son lo mismo.** Se tapó una fuga en el cliente y se dio
  por cerrada; el servidor la seguía mandando en cada respuesta.
- **Una explicación plausible no es una explicación.** Un flake se cerró con un razonamiento
  convincente y equivocado (#134). Cuando algo no se pueda reproducir, se escribe que no se pudo
  — se registró así en #167.
