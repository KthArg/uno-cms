Cliente Drizzle y esquema (SPEC §3, §4). Todo módulo aquí importa `server-only`.

El driver se elige por destino (ADR-200): HTTP de Neon en producción, `node-postgres` contra un
Postgres normal. Hacia arriba expone **el mismo tipo**, así que ni el esquema ni las consultas
saben cuál hay debajo.

La contrapartida está escrita y sigue abierta en #43: los tests de integración ejercitan las
consultas y las migraciones, **no el driver de producción**. Eso solo lo puede decir un
despliegue real.
