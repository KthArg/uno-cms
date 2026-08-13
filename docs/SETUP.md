# Poner en marcha tu web

> **Estado: esqueleto.** Esta guía se escribe entera en **M6**, cuando haya algo que
> desplegar. Su meta, según `SPEC.md` §9, es que alguien sin conocimientos técnicos tenga su
> web publicada en **15 minutos y sin abrir una terminal**.
>
> Lo que hay aquí es el índice y las decisiones que ya condicionan cómo se escribirá.
> Cualquier paso que no se pueda hacer con el ratón desde el navegador es un fallo de esta
> guía, no del lector.

## Índice previsto

1. **Antes de empezar** — qué necesitas (una cuenta de GitHub y una de Vercel, ambas
   gratuitas) y cuánto cuesta (nada, en el nivel gratuito).
2. **Copiar el proyecto** — el botón de Deploy y qué hace.
3. **Conectar la base de datos** — la integración de Neon, con capturas.
4. **Conectar el almacén de imágenes** — la integración de Vercel Blob, con capturas.
5. **Los tres códigos secretos** — qué son `AUTH_SECRET`, `APP_SECRET` y `SETUP_TOKEN`
   explicados sin jerga, y de dónde sacarlos sin usar una terminal.
6. **Crear tu usuario** — entrar en `/setup` una sola vez.
7. **Tu primer cambio** — editar el título, ver la vista previa, publicar.
8. **Si algo sale mal** — los cuatro o cinco errores que de verdad ocurren, con su
   solución.

## Decisiones que ya condicionan esta guía

- **No hay contraseñas por defecto**, nunca (`SPEC.md` §7.3). El primer usuario se crea con
  un código de un solo uso que defines tú al desplegar. Es un paso más, y es deliberado.
- **`SETUP_TOKEN` hay que borrarlo después.** La guía lo dirá como un paso más, no como una
  nota al pie: un token que ya no hace falta es superficie de ataque gratis.
- **Vocabulario sin jerga** (`SPEC.md` §9): "guardar borrador", "publicar cambios",
  "volver a una versión anterior". En esta guía no aparecerán las palabras _slug_, _schema_,
  _caché_, _ISR_ ni _token_ sin explicar.
- **Con capturas.** Una guía de despliegue sin imágenes no cumple la meta de 15 minutos.

## Mientras tanto: levantar el proyecto en local

Esto sí es para desarrolladores. Está en [`DEVELOPER.md`](DEVELOPER.md).
