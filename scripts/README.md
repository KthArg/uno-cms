Utilidades que **no** son parte de la aplicación: miden o preparan.

| Script               | Qué hace                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `presupuesto-js.mjs` | El presupuesto de JavaScript de la landing (SPEC §8, ADR-601). Bloqueante en CI, tras `pnpm build` |
| `seed-demo.mjs`      | Contenido de ejemplo publicado, para que Lighthouse mida contra algo y siempre contra lo mismo     |

Ninguno se importa desde `app/` ni desde `cms/`, y por eso están fuera: `presupuesto-js.mjs` lee
el manifiesto de un build ya hecho y `seed-demo.mjs` escribe directamente en la base de datos,
sin pasar por las actions.

Lo segundo es lo contrario de lo que hacen los tests —que ejercitan el camino real a propósito—
y aquí es lo correcto: esto no prueba nada, prepara el escenario. Pasar por las actions exigiría
una sesión y un servidor levantado antes de haberlo levantado.
