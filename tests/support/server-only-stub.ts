/**
 * Sustituto de `server-only` para los tests (ver `vitest.config.ts`).
 *
 * El paquete real lanza al importarse salvo bajo la condición de exportación
 * `react-server`, que es justo el mecanismo por el que rompe la build cuando un componente
 * de cliente alcanza un módulo de servidor (SPEC §7.1). Bajo esa condición, lo que exporta
 * es un módulo vacío: esto.
 *
 * Se hace con un alias y no cambiando `resolve.conditions` de Vite porque activar
 * `react-server` globalmente altera cómo se resuelve `eslint-config-next` y rompe el test
 * de las reglas de seguridad. Un alias afecta a un solo módulo y no se lleva nada por
 * delante.
 *
 * **Esto no debilita la frontera servidor/cliente.** La barrera real es `next build`, que
 * sigue intacta y verificada (T-06-4). Lo que este fichero permite es escribir tests
 * unitarios de `cms/core`, `cms/db`, `cms/auth` y `cms/security`, que de otro modo serían
 * imposibles.
 */
export {};
