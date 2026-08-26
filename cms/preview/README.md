Contrato de contenido del lado cliente (SPEC §6.3; ADR-106). **Único árbol de `cms/` que llega al
navegador**, y por eso el único sin `server-only`.

`useContent` y `useCollection` leen de un contexto que rellenan dos proveedores distintos: el
estático en producción y el reactivo en `/preview`. El componente **no sabe en cuál está**, y esa
es toda la gracia — es lo que hace cierta la promesa de §6.3 de que adaptar el CMS sea escribir la
configuración, las secciones y componer la página.

`RichText` emite elementos de React y **nunca** una cadena de HTML (ADR-107): no es que sanee
bien, es que no hay cadena donde inyectar nada.

`protocolo.ts` define el canal entre el panel y el iframe una sola vez, para que un lado no mande
`cms:update` mientras el otro escucha otra cosa.

`renovacion.ts` decide cuándo pedir el siguiente token de vista previa remota (ADR-701). Está aquí
y no en `cms/security/` porque lo necesita el panel, o sea el navegador — y porque cuenta tiempo
**transcurrido** en vez de mirar el reloj: el del navegador no es el del servidor.

`cliente-remoto.ts` no es código que ejecutemos nosotros: es **el texto** del módulo que descarga
la web de destino por `/preview-cliente.js` (ADR-701). Se prueba importando esa misma cadena con
una URL `data:`, para que lo probado y lo servido no puedan divergir.
