Vista previa dentro del iframe del panel (SPEC §6.1, §6.2).

Valida el token con `verifyToken` y responde **404 sin detalle** si no vale, está caducado o es
de otro propósito: distinguirlos convertiría la ruta en un comprobador de enlaces ajenos.

Compone **exactamente los mismos componentes** que la landing pública. Si aquí hubiera una
versión distinta, la vista previa dejaría de enseñar la web para enseñar algo parecido — y se
confía en ella para decidir si publicar.

Carga el borrador **solo de la clave que autoriza el token** y lo publicado del resto (ADR-501),
para que un enlace filtrado no sea una llave maestra a todo lo que hay sin publicar.
