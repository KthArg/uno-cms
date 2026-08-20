SQL generado por drizzle-kit y commiteado (SPEC §2, ADR-002).

Se generan con `pnpm db:generate` y se aplican con `pnpm db:migrate`. Van al repositorio a
propósito: una migración que se genera en el despliegue es una migración que nadie ha leído.

**Cambiar `cms.config.ts` no genera migraciones.** El contenido vive como JSONB validado por
esquema (ADR-003), que es lo que permite añadir un campo sin tocar la base de datos.
