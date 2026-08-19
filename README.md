# UnoCMS

CMS acoplado 1:1 a una landing page, auto-hospedable en Vercel.
**Un despliegue = una landing = un CMS.**

El desarrollador define el modelo de contenido en código (`cms.config.ts`); el CMS genera
solo el panel de administración, la validación, el versionado y la vista previa en vivo. El
usuario final edita textos e imágenes, ve la página real actualizándose mientras escribe, y
publica con un botón.

## Estado

**En construcción.** M0, M1 y M2 (fundaciones, datos y seguridad) cerrados; M3 en curso. Todavía no
hay panel ni base de datos: el proyecto arranca con una página provisional.

El detalle honesto de qué funciona, qué es frágil y qué habría que probar a mano está en
[`docs/PROGRESS.md`](docs/PROGRESS.md).

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
