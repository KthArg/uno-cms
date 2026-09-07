# 13 — El movimiento de las interacciones

> Escrita **antes** del código. Los casos de la sección 6 son la definición de "hecho".
>
> Origen: [#239](https://github.com/KthArg/uno-cms/issues/239). No deroga nada. La
> [spec 11](11-cristal-e-iconos.md) fijó el material y la [spec 12](12-bento-y-rail.md) la
> composición; esto es la tercera capa —**cómo responde**— y es la que faltaba para que el panel
> se sienta acabado en vez de correcto.

## 1. Qué se pide y qué significa

La petición fue: **«pequeñas animaciones con las interacciones del usuario, para que se sienta más
cómodo y premium»**. Las dos palabras piden cosas distintas y conviene separarlas, porque la
segunda es la que suele salir mal.

**Cómodo** es información. Cuando algo se pulsa y no pasa nada durante 300 ms —lo que tarda una
Server Action— quien lo pulsó no sabe si el toque se registró, y vuelve a pulsar. El hundimiento
del botón es la respuesta que llega antes que el servidor. Eso no es adorno: es la diferencia
entre una interfaz que contesta y una que hay que interrogar.

**Premium** es coherencia, no cantidad. Lo que separa una interfaz cara de una barata no es que
tenga más movimiento, es que **todo se mueve igual**: la misma curva, tres duraciones, ninguna
excepción. Una interfaz con quince animaciones distintas se siente desordenada aunque cada una
esté bien hecha por separado.

De ahí sale la decisión que gobierna esta spec: **el movimiento se define una vez y se usa por
nombre**. Antes de #239 había `transition` suelto en veintisiete sitios, cada uno heredando la
duración por defecto de Tailwind; funcionaba y no era un sistema.

## 2. Lo que se puede animar, y por qué la lista es tan corta

Solo **`transform` y `opacity`** (más colores y bordes, que también son baratos).

El motivo no es estético. El navegador resuelve esas dos en el compositor, sin volver a calcular
dónde va cada cosa; cualquier otra —`width`, `height`, `top`, `padding`, `font-size`— le obliga a
rehacer la maqueta de la página **en cada fotograma**.

Y esto importa aquí más que en otros sitios por una razón concreta: **el presupuesto de Lighthouse
va en CI** (rendimiento ≥ 90). Una animación de `height` produce exactamente la misma imagen que
una de `transform`, así que el error no se ve revisando el diff ni mirando la pantalla — aparece
semanas después como una caída de rendimiento que nadie sabe de dónde salió. Por eso hay una
guarda que lee el CSS y falla, en vez de una nota pidiendo cuidado.

## 3. El vocabulario

Tres duraciones y una curva. Que sean pocas es el punto.

| Ficha                 | Valor                            | Para                                               |
| --------------------- | -------------------------------- | -------------------------------------------------- |
| `--duracion-instante` | 90 ms                            | El hundimiento al pulsar: tiene que ir con el dedo |
| `--duracion-corta`    | 140 ms                           | Hover, foco, diálogos                              |
| `--duracion-media`    | 220 ms                           | La entrada de una pantalla al cambiar de sección   |
| `--curva`             | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Todo                                               |

Nada pasa de 220 ms. Por encima de ahí una herramienta de escribir empieza a sentirse lenta en
vez de suave, y este panel se usa durante minutos seguidos, no se visita.

La curva sale rápido y frena al llegar, que es como se mueve algo con peso. **No lleva rebote**:
un rebote en el botón de publicar es un juguete, y esto administra la web de alguien.

Cuatro utilidades, en `app/globals.css`:

- **`pulsable`** — lo que se pulsa para que pase algo. Se hunde un 2 % mientras está pulsado.
- **`transicion`** — lo que cambia de aspecto sin ser un disparador: los campos, y los iconos que
  responden al hover de su fila.
- **`entra`** — el contenido de una pantalla: sube seis píxeles y aparece.
- **`aparece`** / **`se-desvanece`** — un diálogo y su velo.

**La escala es para lo que tiene tamaño de botón o de tarjeta.** En una fila que cruza la
pantalla, un 2 % son veinticinco píxeles: los bordes se meten hacia dentro y la fila se desalinea
de sus vecinas, que se lee como un salto y no como una pulsación. Lo ancho responde con color.
Esto se descubrió **capturando el estado pulsado**, no leyendo el código, y es el motivo de que
las filas del panel de inicio usen `transicion`.

## 4. Movimiento reducido

Quien tiene puesto `prefers-reduced-motion: reduce` no recibe nada de lo anterior.

El bloque que lo corta existía desde el rediseño y **no lo comprobaba nadie**, lo cual era barato
mientras casi nada se movía. Con animaciones de verdad pasa a ser lo que separa una interfaz
agradable de una que marea a quien ha pedido por escrito que no la maree — así que pasa a tener
caso propio, y medido en un navegador.

Que se mida en un navegador no es rigor de más: lo que hay que comprobar es el resultado de la
**cascada** —qué duración gana después de resolver la utilidad, la media query y el `!important`—
y en jsdom no hay cascada que resolver.

## 5. Lo que esto no hace

- **No hay transiciones de página encadenadas.** Ni View Transitions. Un cambio de sección aquí
  es cambiar de herramienta, no pasar una diapositiva.
- **No se anima la aparición de listas elemento a elemento** (el escalonado). Se ve muy bien la
  primera vez y estorba la número cuarenta, que es el número real de veces que alguien abre la
  biblioteca.
- **No se toca la landing pública.** El presupuesto de JavaScript de la landing es el de SPEC §8
  y este trabajo no le añade ni un byte: todo es CSS.

## 6. Casos

| Caso         | Qué comprueba                                                                       | Dónde                           |
| ------------ | ----------------------------------------------------------------------------------- | ------------------------------- |
| **T-237-1**  | El movimiento sale de las fichas; ningún componente fija su duración o su curva     | `tests/unit/movimiento.test.ts` |
| **T-237-2**  | Con `prefers-reduced-motion: reduce` no se mueve nada, medido en un navegador       | `tests/e2e/movimiento.spec.ts`  |
| **T-237-2b** | Sin la preferencia, el panel **sí** se mueve — para que el anterior no pueda mentir | `tests/e2e/movimiento.spec.ts`  |
| **T-237-3**  | No se anima ninguna propiedad que obligue a rehacer la maqueta                      | `tests/unit/movimiento.test.ts` |
| **T-237-3b** | El contenido se remonta al cambiar de sección, así que la entrada se rearma         | `tests/e2e/movimiento.spec.ts`  |
| **T-237-4**  | Lighthouse sigue en rendimiento ≥ 90 y accesibilidad ≥ 95                           | el flujo de CI que ya existía   |
| **T-237-5**  | El presupuesto de JavaScript de la landing no se mueve                              | el flujo de CI que ya existía   |
