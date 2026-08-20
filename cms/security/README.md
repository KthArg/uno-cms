Límite de peticiones, tokens HMAC, auditoría y validación de subidas (SPEC §3, §7). Todo módulo
aquí importa `server-only`.

`tokens.ts` firma con el propósito **dentro** de la firma: un token de vista previa no puede valer
como uno de invitación aunque ambos estén bien firmados. Y comprueba en este orden —firma,
propósito, expiración— porque mirar la fecha antes revelaría si un token manipulado tenía una
válida.

El límite de peticiones es **por instancia**: sin backend distribuido, en un despliegue con varias
se multiplica. Está cerrado como limitación conocida en `docs/SECURITY.md` (#65, ADR-303), con lo
que lo mitiga —el bloqueo de cuenta, que sí es global— y cómo se cerraría.

La validación de enlaces **no** está aquí: vive en `cms/links.ts`, fuera de la frontera, porque el
renderizador de la landing la necesita en el navegador (ADR-500). Una implementación no puede
divergir de sí misma.
