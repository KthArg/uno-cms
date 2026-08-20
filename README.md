# UnoCMS

CMS acoplado 1:1 a una landing page, auto-hospedable en Vercel.
**Un despliegue = una landing = un CMS.**

El desarrollador define el modelo de contenido en código (`cms.config.ts`); el CMS genera
solo el panel de administración, la validación, el versionado y la vista previa en vivo. El
usuario final edita textos e imágenes, ve la página real actualizándose mientras escribe, y
publica con un botón.

## Desplegar tu copia

[![Desplegar con Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FKthArg%2Funo-cms&project-name=mi-web&repository-name=mi-web&env=AUTH_SECRET%2CAPP_SECRET%2CSETUP_TOKEN&envDescription=Tres%20contrase%C3%B1as%20largas%20y%20distintas%20entre%20s%C3%AD&envLink=https%3A%2F%2Fgithub.com%2FKthArg%2Funo-cms%2Fblob%2Fmain%2Fdocs%2FSETUP.md%232-los-tres-c%C3%B3digos-secretos)

La guía paso a paso, pensada para alguien que no programa, está en
[`docs/SETUP.md`](docs/SETUP.md). **No hay usuario ni contraseña por defecto**: la primera
cuenta se crea con un código de un solo uso que defines tú al desplegar.

## Estado

**MVP completo.** Los seis hitos cerrados: fundaciones, datos, seguridad, actions, panel,
landing con vista previa en vivo, y endurecimiento.

Lo que funciona, lo que es frágil y lo que habría que probar a mano —incluido **lo que no está
verificado** y los tres fallos que apareció una pasada de repaso **después** de cerrar el último
hito— está en [`docs/PROGRESS.md`](docs/PROGRESS.md). Lo aplazado, con su motivo, en
[`docs/PENDIENTES.md`](docs/PENDIENTES.md).

## Documentación

| Documento                                  | Para quién                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| [`SPEC.md`](SPEC.md)                       | **Fuente de verdad** del proyecto. Ante cualquier duda, manda esto          |
| [`docs/SETUP.md`](docs/SETUP.md)           | Quien despliega su web. Sin jerga, sin terminal _(esqueleto, M6)_           |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md)   | Quien monta UnoCMS sobre otra landing                                       |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)   | Los ADR: qué se decidió donde la spec callaba, y a cambio de qué            |
| [`docs/PROGRESS.md`](docs/PROGRESS.md)     | Estado real por hito                                                        |
| [`docs/PENDIENTES.md`](docs/PENDIENTES.md) | Todo lo aplazado, con su motivo y su issue. Nada vive solo en un comentario |
| [`docs/SECURITY.md`](docs/SECURITY.md)     | Reporte de vulnerabilidades y modelo de amenazas _(esqueleto, M6)_          |
| [`docs/specs/`](docs/specs/)               | Documentos de fase: alcance, contratos y casos de prueba de cada hito       |

## Levantarlo en local

```sh
pnpm install
cp .env.example .env.local   # rellena los valores; el propio fichero explica cada uno
pnpm dev
```

Node ≥ 22 y pnpm 10. Los comandos, las reglas del repositorio y cómo se trabaja aquí están
en [`docs/DEVELOPER.md`](docs/DEVELOPER.md).

## Seguridad

No abras un issue público para reportar una vulnerabilidad. El procedimiento está en
[`SECURITY.md`](SECURITY.md).
