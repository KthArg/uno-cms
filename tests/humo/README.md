# La suite de humo

Corre contra un **despliegue de verdad**, no contra un servidor que arranque ella. Es lo único
del repositorio que ejercita el camino que se despliega: Vercel Blob, Neon y la CSP aplicada por
un navegador.

Su spec es [`docs/specs/09-humo-contra-el-despliegue.md`](../../docs/specs/09-humo-contra-el-despliegue.md)
y sale de [#207](https://github.com/KthArg/uno-cms/issues/207).

## Ejecutarla

```sh
export HUMO_URL=https://uno-cms.vercel.app
export HUMO_EMAIL=tu-cuenta@ejemplo.com
export HUMO_PASSWORD='…'

pnpm test:humo
```

**Sin las tres variables se salta con un aviso**, igual que los tests de integración sin
`DATABASE_URL`. Una suite de humo que se inventa un entorno da verde sin probar nada, que es el
problema que viene a resolver.

La cuenta tiene que ser **de administración**: borrar imágenes lo es, y la suite borra lo que
sube.

## Lo que hace, y lo que no

Sube una imagen de 1×1, comprueba que aparece en la biblioteca **tras recargar**, sube el mismo
fichero dos veces, y borra lo que ha subido.

**No toca nada que no haya creado ella.** No publica, no guarda borradores, no edita contenido.
Un sitio en línea puede tener contenido real de alguien, y una suite que rompa algo una vez es
una suite que nadie vuelve a ejecutar.

Esa regla no vive solo en este README: [`tests/unit/suite-de-humo.test.ts`](../unit/suite-de-humo.test.ts)
la comprueba sobre el código de aquí. Una promesa en prosa dura hasta el siguiente que tenga
prisa.

## Si deja algo sin borrar

Falla diciéndolo, con el nombre del fichero. Hay que quitarlo a mano — `vercel blob list` y
`vercel blob del <url>` — porque no hay reconciliación entre el almacén y la base de datos
todavía ([#206](https://github.com/KthArg/uno-cms/issues/206)).

## Por qué no está en CI

Hace falta un despliegue de pruebas separado del de verdad y credenciales en el repositorio, y
hoy no hay ni lo uno ni lo otro. Está escrita para ejecutarse a mano y engancharse a CI cuando
eso exista; el destino se le pasa por variable justamente para eso.
