Panel de administración (SPEC §3, §9).

El grupo `(panel)` es lo que lleva el guard autoritativo: su layout llama a `auth()` en el
runtime de Node, que es donde se comprueba el claim `pwdV` contra la base de datos (ADR-301). Lo
que queda **fuera** de ese grupo —`login` e `invitacion`— se sirve sin sesión, está declarado en
`cms/routes.ts` con su motivo y hay un test que lo exige (#70).

Pantallas: contenido y su editor, colecciones, historial, imágenes, personas, ajustes y la
cuenta propia. El rol se comprueba **en cada página** con `soloAdmin()`, no en el menú: esconder
un enlace no cierra una ruta.
