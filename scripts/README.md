Utilidades que **no** son parte de la aplicación: miden o preparan.

| Script                 | Qué hace                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `presupuesto-js.mjs`   | El presupuesto de JavaScript de la landing (SPEC §8, ADR-601). Bloqueante en CI, tras `pnpm build`                |
| `seed-demo.mjs`        | Contenido de ejemplo publicado, para que Lighthouse mida contra algo y siempre contra lo mismo                    |
| `medios-huerfanos.mjs` | Compara el almacén de imágenes con la tabla `media` y **enseña** lo que sobra por cada lado (#206). No borra nada |

`migrar-al-desplegar.mjs` no está en la tabla porque no es una utilidad: lo ejecuta `pnpm build`.

Ninguno se importa desde `app/` ni desde `cms/`, y por eso están fuera: `presupuesto-js.mjs` lee
el manifiesto de un build ya hecho y `seed-demo.mjs` escribe directamente en la base de datos,
sin pasar por las actions.

Lo segundo es lo contrario de lo que hacen los tests —que ejercitan el camino real a propósito—
y aquí es lo correcto: esto no prueba nada, prepara el escenario. Pasar por las actions exigiría
una sesión y un servidor levantado antes de haberlo levantado.

`medios-huerfanos.mjs` sigue además el patrón de `migrar-al-desplegar.mjs`: **exporta su lógica y
la ejercitan los tests**. Un script que solo se puede probar ejecutándolo entero acaba sin probar,
y este decide qué es un huérfano — que es justo lo que no conviene dejar sin comprobar.
