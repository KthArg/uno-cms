Landing pública (SPEC §3, §6.3, §8).

`page.tsx` lee el contenido **publicado** con `getContent`/`getCollection`, lo pasa a
`StaticContentProvider` y compone las secciones de `components/site/`. El visitante no abre
ninguna petición de datos: el contenido viaja dentro del árbol que manda el servidor, y hay un
e2e que cuenta las peticiones para comprobarlo.

Lleva `force-dynamic`, y es una desviación de §8 con su motivo medido en **ADR-502**: la versión
estática responde 3 ms antes y obliga a que `pnpm build` tenga una base de datos accesible, lo
que rompe construir una imagen sin ella. Quitar esa línea es todo lo que hace falta para volver.

Sin usuarios en la base, la página **enseña el camino** a `/setup` en vez de redirigir.
