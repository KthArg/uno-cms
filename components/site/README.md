Secciones de la landing del proyecto de ejemplo (SPEC §6.3).

Hero, About, Testimonials y FAQ, cada una con `data-cms-key` —que es lo que permite a la vista
previa desplazarse a lo que se está editando— y cada una tolerando el contenido vacío: el primer
día no hay nada publicado y la página tiene que renderizarse igual.

**Aquí no hay nada de `cms/`**, y es la prueba de que el contrato de §6.3 se sostiene: escribir
esta landing entera no exigió tocar el CMS. Si alguna vez hace falta, eso es un fallo del contrato
y merece un issue.

Cómo escribir las tuyas: [`docs/DEVELOPER.md`](../../docs/DEVELOPER.md).
