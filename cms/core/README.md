Núcleo agnóstico del proyecto (SPEC §3, §5.1). Todo módulo aquí importa `server-only`, salvo
`types.ts`, que solo declara tipos y no emite ni una línea de JavaScript.

`config.ts` y `schema-gen.ts` convierten `cms.config.ts` en esquemas laxos y estrictos; de ahí
salen solos los formularios del panel, la validación y los tipos que consume la landing.

`content.ts` separa **la lectura de verdad** de la cacheada (ADR-405): `readContent` es la que se
prueba, `getContent` la que sirve la landing con su tag de invalidación. La misma separación se
repite en `settings.ts` y en `preview-content.ts`, y por el mismo motivo — `unstable_cache` lanza
fuera de una petición de Next, y un módulo que solo se puede ejecutar dentro de un servidor acaba
sin tests.
