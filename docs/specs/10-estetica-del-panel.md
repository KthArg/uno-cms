# 10 — La estética del panel, y que se pueda usar en cualquier pantalla

> Escrita **antes** del código. Los casos de la sección 8 son la definición de "hecho".
>
> Alcance decidido con quien lo pidió: **solo el panel** (`/admin` y la pantalla de acceso). La landing pública no se toca — tiene un presupuesto de 60 KB de JavaScript y un listón de Lighthouse, y mezclar las dos cosas pondría en riesgo lo que hoy funciona.

## 1. Qué se pide

Que el panel sea **elegante, inspirador y amable de trabajar**, y que se pueda usar desde cualquier dispositivo. Con modo claro y oscuro.

El idioma visual elegido es **papel y tinta**: editorial y sereno. Fondo hueso cálido, tinta en vez de negro puro, titulares con serif, mucho aire, separadores finos en lugar de cajas, y **un solo acento** usado con avaricia.

La razón de esa elección, y no de una más colorida: el panel es donde alguien **escribe** el contenido de su web. Que se parezca a un cuaderno y no a un tablero de control es coherente con lo que se hace en él, aguanta mejor una sesión larga, y deja el color libre para lo único que necesita gritar — el estado de publicación y los errores.

## 2. El estado del que se parte, medido

No es una cuestión de gusto: hay cosas rotas.

| Medido en el despliegue                          | Valor                                       |
| ------------------------------------------------ | ------------------------------------------- |
| Ancho útil del contenido en un móvil de 390 px   | **103 px** — el menú fijo se lleva 192      |
| Desbordamiento horizontal en `/admin`            | **sí**, la página mide 495 px de ancho real |
| Ancho del campo «Título principal» en el editor  | **103 px**                                  |
| Zonas pulsables por debajo de 44 px en el editor | **11 de 14**                                |
| Reglas de modo oscuro                            | **0**                                       |
| Clases de color escritas a mano en componentes   | **~250**                                    |

Esa última fila es la que decide la arquitectura: con el color repartido en doscientas cincuenta clases literales, **un modo oscuro hecho con variantes `dark:` duplicaría cada una**. Sería el doble de sitios donde equivocarse y ninguna forma de comprobar que los dos modos dicen lo mismo.

## 3. La decisión de fondo: fichas, no variantes

El color deja de escribirse en los componentes. Se define **una vez** como fichas semánticas —qué papel cumple cada color, no qué color es— y cada modo les da un valor.

```
--color-papel          el fondo de la página
--color-superficie     lo que se levanta del papel: tarjetas, diálogos
--color-tinta          el texto principal
--color-tinta-suave    lo secundario
--color-linea          los separadores y bordes
--color-acento         el único color con carácter
--color-alarma         lo destructivo y los errores
```

Los componentes escriben `bg-papel`, `text-tinta`, `border-linea`. **Ni una sola clase `dark:`.** El modo oscuro es otro juego de valores para las mismas fichas, y por eso no se puede desincronizar: no hay dos sitios que mantener.

Los nombres van en español porque son nuestros, siguiendo la regla de `CLAUDE.md`: inglés solo lo que fija la spec del producto.

## 4. Cómo se elige el modo, y por qué sin JavaScript

Tres estados, y el orden importa:

1. **Sin preferencia guardada** → manda el sistema operativo, por `prefers-color-scheme`. Sin una línea de JavaScript.
2. **Con preferencia guardada** → manda ella, siempre.
3. El cambio se guarda en una **cookie**, y el servidor pinta el atributo `data-tema` en el `<html>` desde el primer byte.

**Por qué una cookie y no `localStorage`.** Con `localStorage` el servidor no sabe qué modo toca, así que la página llega con el modo equivocado y un script la corrige después: es el parpadeo blanco que da cualquier panel oscuro al abrirlo. Evitarlo obliga a un script **en línea** antes de pintar, y esta aplicación lleva una CSP estricta con nonce por petición — se podría hacer (el nonce llega a los componentes de servidor), pero sería añadir una excepción de seguridad para resolver un problema que la cookie no tiene.

Con cookie, el servidor ya sabe el modo cuando compone el HTML. **Cero parpadeo y cero JavaScript**, que además es lo que hace que esto funcione igual en un móvil viejo.

La contrapartida, dicha: cambiar de modo cuesta una ida y vuelta al servidor, como «Salir». Cambiar de modo se hace una vez y luego casi nunca; el parpadeo se ve **cada vez que se abre el panel**. El intercambio está claro en qué dirección va.

Y `color-scheme` en el `<html>` además del color, para que los controles de formulario, las barras de desplazamiento y el cursor de texto que pinta el navegador acompañen. Sin eso el modo oscuro tiene una barra blanca al lado.

## 5. Cualquier pantalla, de verdad

**Móvil primero, y no como adorno**: hoy el panel no se puede usar en un teléfono, así que esto es funcionalidad, no acabado.

- **El menú lateral desaparece en pantallas estrechas** y pasa a una barra inferior con las secciones. Abajo y no arriba: es donde llega el pulgar.
- **Ninguna zona pulsable baja de 44 px** de alto. Es el mínimo de las guías de accesibilidad de las dos plataformas, y hoy lo incumplen 11 de 14 en el editor.
- **Cero desbordamiento horizontal** en ninguna pantalla ni en ningún ancho desde 320 px.
- **El editor deja de ser dos columnas** por debajo del ancho en que caben: pasa a formulario y vista previa en dos pestañas, y el divisor arrastrable de #190 solo existe donde hay sitio para arrastrarlo.

## 6. Tipografía

Un serif para los titulares y la interfaz en el sans del sistema. El contraste entre los dos es lo que da el aire editorial sin cargar la página.

El serif se sirve **desde nuestro propio dominio** con `next/font`, no desde un CDN: la CSP no declara `font-src`, así que hereda `default-src 'self'` y una fuente externa sencillamente no cargaría. Autoalojarla también evita una petición a un tercero desde el panel de alguien.

## 7. Fuera de alcance

- **La landing pública y `examples/web-remota`.** Decisión de quien lo pidió, y la buena: la landing tiene presupuesto de JavaScript y listón de Lighthouse propios.
- **Cambiar el vocabulario o la estructura de las pantallas.** `SPEC.md` §9 fija qué dice cada cosa y qué hay en el panel; esto cambia cómo se ve, no qué se lee ni qué se puede hacer.
- **Animaciones más allá de las transiciones de estado.** Un panel que se mueve mucho cansa antes de la tercera sesión.
- **Personalizar el acento.** Un ajuste por sitio es otra fase y otra decisión.

## 8. Casos

### Las fichas y los dos modos

- **T-212-1** Ningún componente del panel escribe un color literal: las clases de color son de fichas, no de la paleta de Tailwind.
- **T-212-2** No existe **ninguna** variante `dark:` en el panel — el modo oscuro sale de las fichas.
- **T-212-3** Toda ficha definida en claro está definida en oscuro, y al revés. Ninguna se queda sin su pareja.
- **T-212-4** Cada pareja de texto sobre fondo que use el panel cumple el contraste **4,5:1** de AA, en los dos modos. Comprobado calculando, no mirando.
- **T-212-5** Sin preferencia guardada, manda el sistema operativo.
- **T-212-6** Con preferencia guardada, manda ella y sobrevive a recargar.
- **T-212-7** El servidor pinta el modo correcto en el primer HTML: no hay parpadeo ni script que corrija después.
- **T-212-8** El `<html>` declara `color-scheme` acorde, para que lo que pinta el navegador acompañe.

### En cualquier pantalla

- **T-213-1** Desde 320 px no hay desbordamiento horizontal en ninguna pantalla del panel.
- **T-213-2** En un móvil, el contenido dispone de al menos el 85 % del ancho de la ventana.
- **T-213-3** Ninguna zona pulsable mide menos de 44 px de alto.
- **T-213-4** Se llega a las cuatro secciones desde un móvil, sin menú lateral.
- **T-213-5** El editor apila formulario y vista previa por debajo del ancho de dos columnas, y el divisor de #190 no se ofrece donde no cabe.

### Lo que no puede romperse

- **T-214-1** El vocabulario de `SPEC.md` §9 no cambia: los textos siguen siendo los mismos.
- **T-214-2** Lighthouse sigue por encima del listón: accesibilidad ≥ 95.
- **T-214-3** El panel sigue sin descargar código en la landing pública, y su presupuesto de JavaScript no cambia.
