Server Actions: la API real del panel (SPEC §3, §5.3).

Todas pasan por el envoltorio de `pipeline.ts` —sesión, rol, límite, validación con Zod,
auditoría— y **todas se exportan desde `index.ts`**. Hay un test (T-75-6) que recorre el barril
exigiendo la marca del envoltorio, y otro que impide esquivarlo dejando una función suelta sin
reexportar. Esa es la forma verificable de cumplir "chequeo de rol en cada action" de §7.1.

Leer no es mutar: las lecturas viven en `cms/core/`, y ese mismo test echó una de aquí en su día.
