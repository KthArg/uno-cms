# 11 — Cristal e iconos: la dirección visual que sustituye a «papel y tinta»

> Escrita **antes** del código. Los casos de la sección 9 son la definición de "hecho".
>
> Sustituye a §1 y §6 de [`10-estetica-del-panel.md`](10-estetica-del-panel.md), que quedan
> derogadas. **Todo lo demás de la spec 10 sigue vigente** —el diagnóstico medido de §2, la
> arquitectura de fichas de §3, el mecanismo de modos de §4, el móvil de §5 y los casos de §8
> salvo los tipográficos—, y conviene decirlo porque es la mitad del documento.
>
> Origen: [#224](https://github.com/KthArg/uno-cms/issues/224). Alcance confirmado con quien lo
> pidió: **solo el panel**. La landing pública sigue fuera, con su presupuesto de 60 KB de
> JavaScript y su listón de Lighthouse.

> **Enmienda del 1 de septiembre de 2026 — §5 queda derogada en un punto, y §2 y §8 en otro.**
>
> Tras entregar esto, la valoración fue que **la referencia visual era otra**: «no solo en la
> estética, sino también en la manera que están acomodados los elementos». La dirección nueva
> está en [`12-bento-y-rail.md`](12-bento-y-rail.md) (issue
> [#229](https://github.com/KthArg/uno-cms/issues/229)).
>
> Lo que decae:
>
> - **§5, en el rail y solo en el rail.** «El icono acompaña al texto, no lo sustituye» sigue
>   valiendo en los botones y las acciones; en la navegación de escritorio el texto deja de
>   pintarse. Se decidió en **ADR-810**, con tres condiciones —nombre accesible, `title`, y el
>   móvil intacto— y un caso que las exige.
> - **Los valores de §2**, que eran azul-noche con latón y pasan a tierra cálido con naranja
>   (ADR-811). La arquitectura de fichas no se toca: es la segunda vez en tres días que cambiar
>   la dirección de color entera cuesta un fichero.
> - **La frase de §8 que dejaba fuera «la estructura de las pantallas»**, para el panel de
>   inicio: ahí sí se reordena. Lo que no cambia es el vocabulario ni lo que `SPEC.md` §9 exige
>   que haya en esa pantalla, y hay un caso nuevo que lo fija (T-216-1).
>
> Lo que **sigue entero**: el material —cristal, profundidad, la tabla de dónde hay cristal y
> dónde no—, la guarda de contraste sobre el color compuesto de ADR-800, la regla de que el
> cristal no se apila, y la librería de iconos de ADR-801.

## 1. Qué se pide, en las palabras de quien lo pidió

Tras entregar las fichas de color y los dos modos (#219, #221), la valoración fue **«todavía no
se ve bien»**, con cuatro peticiones:

1. Un estilo **más único**, tirando a **liquid glass**.
2. Priorizar habilidades de diseño, y no solo la herramienta por defecto.
3. **Iconos antes que descripciones**, sacados de una **librería existente**.
4. Elementos de interfaz **claros a simple vista**.

Y una condición añadida a mitad: **el modo claro tiene que seguir disponible**. No es un detalle
de acabado — decide toda la paleta, porque obliga a que el cristal funcione en dos direcciones
opuestas: oscurece lo que hay detrás en claro y lo aclara en oscuro.

## 2. El idioma visual: cristal sobre luz

Lo que sustituye a «papel y tinta» es **una lámina de vidrio sobre una superficie con luz
propia**. Tres materiales y nada más:

- **La luz de fondo.** Un halo fijo y muy tenue detrás de todo el panel: una mancha cálida y otra
  fría sobre el fondo base. Es lo que le da al cristal algo que refractar — sin ella, translúcido
  y opaco se ven exactamente igual.
- **El cristal.** Las superficies que **flotan**: la cabecera, la navegación, los diálogos, las
  tarjetas. Un tinte claro con muy poca opacidad, desenfoque de lo que hay detrás, y un filo
  luminoso en el borde superior — que es de donde viene la sensación de grosor.
- **La tinta.** El texto y los iconos, siempre por encima, nunca translúcidos.

**Por qué esta dirección y no la anterior.** «Papel y tinta» pedía serenidad editorial y la
consiguió, pero produjo un panel que se parecía a cualquier otro: sin cajas, sin iconos y sin
color, lo único que quedaba para distinguir una zona de otra era el espacio en blanco. El
cristal resuelve justo eso — da **jerarquía por profundidad**, que es una dimensión que el papel
no tiene: lo que flota es lo que actúa, lo que está pegado al fondo es lo que se lee.

**El modo desde el que se diseña es el oscuro**, y conviene decirlo con esas palabras y no con
«el modo por defecto», porque por defecto **manda el sistema operativo** y eso no cambia (spec
10 §4). Lo que cambia es de dónde sale la paleta: se eligió en oscuro y el claro se derivó de
ella, y no al revés.

La razón no es de gusto: el cristal necesita que la luz venga de detrás para leerse como vidrio,
y sobre fondo claro el efecto es casi invisible salvo que se cargue tanto que estorbe al texto.
El panel es además donde alguien escribe el contenido de su web, muchas veces de noche.

**El modo claro existe, está completo y se comprueba con las mismas guardas** — se pidió
explícitamente, y en él la lámina oscurece en vez de aclarar, así que su opacidad es otra: 62 %
frente al 8 % del oscuro. Que las dos estén declaradas y emparejadas lo exige un caso.

## 3. Dónde hay cristal y dónde no

Esta es **la decisión que hace verificable todo lo demás**, y va antes que cualquier CSS.

| Hay cristal en                                         | No lo hay en                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| La cabecera y la navegación                            | Los campos de formulario y el editor de texto                         |
| Los diálogos y lo que se superpone                     | Las miniaturas de la biblioteca y cualquier cosa **sobre una imagen** |
| Las tarjetas de sección y las filas de lista           | Los botones sólidos y las etiquetas de estado                         |
| Las etiquetas y contadores que flotan sobre el armazón | Los bloques de aviso —error, conflicto, resultado de publicar—        |

Las dos exclusiones que importan y por qué:

- **Nada de cristal sobre una imagen.** Es el único fondo que no controlamos: la foto que suba
  alguien puede ser blanca, negra o un degradado, y sobre ella ningún texto tiene contraste
  garantizado. La biblioteca de imágenes usa superficies opacas, y punto.
- **Los avisos no son cristal.** Un error tiene que leerse a la primera y en la peor
  circunstancia. Translucirlo cambia un mensaje que debe ser inequívoco por un efecto.

## 4. El contraste, que es lo que decide si esto se puede hacer bien

`T-212-4` comprobaba parejas de fichas con la fórmula de WCAG. Sobre una superficie translúcida
**esa comprobación se convierte en una mentira**: mide el color nominal de la ficha, y lo que se
ve es la mezcla con lo que haya debajo.

La salida no es relajar la guarda. Es **acotar el fondo hasta que vuelva a ser calculable**:

1. Detrás de cualquier cristal del panel solo puede haber **el fondo de la página**: el color
   base más el halo. Nunca contenido arbitrario, nunca una imagen (§3).
2. Ese fondo tiene por tanto **dos extremos conocidos**: el punto más oscuro —el color base sin
   halo— y el más claro —donde las dos manchas del halo se solapan—. Los dos son fichas.
3. La guarda compone el cristal sobre **los dos extremos** con su opacidad declarada, y exige
   4,5:1 en ambos. No en el caso medio: en el peor.

Lo que esto cuesta, dicho: **la opacidad del cristal y la intensidad del halo dejan de ser
parámetros libres**. Subir cualquiera de los dos aleja los extremos y tumba la guarda, que es
exactamente lo que tiene que pasar. Al diseñar esta paleta, un halo un 40 % más intenso ya
dejaba el texto terciario en 4,31:1 — por debajo de AA, y sin que se notara mirando la pantalla.

## 5. Los iconos

**Lucide** (`lucide-react`), y los criterios por los que se elige sobre Heroicons y Phosphor:

- **Licencia ISC**, permisiva y compatible con lo que este repositorio pueda llegar a ser.
- **Importación individual de verdad**: cada icono es un módulo, y `optimizePackageImports` de
  Next lo reescribe para que no entre el índice completo. Es lo que exige T-215-3.
- **Trazo de 1,5 px**, coherente con un panel donde se escribe. Phosphor tiene más carácter y
  seis pesos; es más de lo que hace falta y pesa más.

Tres reglas de uso, y las tres son de accesibilidad antes que de estética:

- **El icono acompaña al texto, no lo sustituye** en la navegación y en las acciones. «Iconos
  antes que descripciones» es sobre **el orden de lectura y el peso visual** —el icono va
  primero y es lo que se reconoce de un vistazo—, no sobre quitar las palabras. Un panel de
  iconos mudos se aprende a la tercera sesión y se adivina mal en la primera, y `SPEC.md` §9
  fija qué dice cada cosa: quitarlo sería cambiar el vocabulario, que está fuera de alcance.
- **Donde el icono va solo** —un botón de cerrar, un control compacto— lleva su nombre
  accesible y una zona pulsable de 44 px.
- **Los decorativos se ocultan** al lector de pantalla. Un icono junto a una palabra que dice lo
  mismo que la palabra, leído en voz alta, es ruido.

## 6. Tipografía

**§6 de la spec 10 no se llegó a implementar, y se descubrió escribiendo esta.** La ficha
`--font-serif` apunta a `var(--fuente-titulares)`, que **no la define nadie**: cae al `Georgia`
del final de la lista. Y ningún componente usa `font-serif`. O sea que el contraste serif/sans
que la spec 10 describía no existió nunca, en ninguna pantalla.

Esta dirección no lo recupera. El serif editorial era coherente con «papel y tinta» y no lo es
con el cristal, que pide letra de interfaz: geométrica, de asta uniforme, legible a tamaño
pequeño sobre fondo translúcido.

**Una sola familia**, servida con `next/font` desde nuestro propio dominio —la CSP no declara
`font-src` y hereda `default-src 'self'`, así que una fuente de un CDN sencillamente no
cargaría—, con el peso como única variable de jerarquía. La ficha `--font-serif` se retira: una
ficha que apunta a una variable inexistente es peor que no tenerla, porque quien la lea creerá
que hay una fuente puesta.

## 7. El rendimiento, que es la segunda tensión

`backdrop-filter` sobre superficies grandes es de lo más caro que se le puede pedir a un
navegador, y el listón de Lighthouse —rendimiento ≥ 90— va en CI.

Lo que se hace, tomado de las guías de implementación de este efecto en web:

- **Superficies pequeñas y acotadas.** El cristal está en la cabecera, la navegación, las
  tarjetas y los diálogos; ninguno ocupa la ventana entera.
- **`contain` en cada superficie de cristal**, para que el navegador pueda aislar lo que
  recompone.
- **El halo no se mueve.** Es un degradado fijo, no una animación. Un fondo animado detrás de un
  desenfoque obliga a recomponer en cada fotograma.
- **`prefers-reduced-motion` respetado** en las transiciones que se añadan.

## 8. Fuera de alcance

- **La landing pública y `examples/web-remota`.** Confirmado otra vez con quien lo pidió.
- **El vocabulario y la estructura de las pantallas.** `SPEC.md` §9 fija qué dice cada cosa;
  esto cambia cómo se ve y en qué orden se lee, no qué se lee ni qué se puede hacer.
- **El panel en un móvil**, que es [#220](https://github.com/KthArg/uno-cms/issues/220) y es
  funcionalidad medida, no estética. Esta pieza no debe empeorarlo, y por eso la navegación se
  reconstruye ya con el icono como elemento principal — que es lo que permitirá la barra
  inferior sin rediseñarla otra vez.
- **Animaciones más allá de las transiciones de estado.**
- **Personalizar el acento por sitio.**

## 9. Casos

### El cristal y el contraste (los de #224)

- **T-215-1** El contraste del texto cumple AA **sobre el color compuesto** —el cristal con su
  opacidad sobre cada uno de los dos extremos del fondo—, no sobre la ficha nominal, en los dos
  modos.
- **T-215-2** Los iconos vienen de una librería declarada en `package.json`, no de SVG pegados a
  mano en los componentes.
- **T-215-3** Solo entra en el paquete el icono que se usa: importación nombrada, nunca el
  índice entero.
- **T-215-4** Ningún icono llega a la landing pública.
- **T-215-5** Lighthouse sigue en rendimiento ≥ 90 y accesibilidad ≥ 95.
- **T-215-6** Cada icono con significado lleva su texto accesible; los decorativos quedan
  ocultos al lector de pantalla.

### Lo que la spec 10 dejó puesto y sigue en pie

- **T-215-7** Ningún componente del panel escribe un color literal, y no existe **ninguna**
  variante `dark:` (T-212-1 y T-212-2, sin cambios).
- **T-215-8** Toda ficha definida en claro está definida en oscuro y al revés, y los dos bloques
  oscuros son idénticos (T-212-3, sin cambios).
- **T-215-9** Los tres estados del modo siguen funcionando: sin preferencia manda el sistema,
  con preferencia manda ella, y el servidor pinta el modo correcto en el primer HTML (T-212-5 a
  T-212-8, sin cambios).

### Lo que no puede romperse

- **T-215-10** El vocabulario de `SPEC.md` §9 no cambia.
- **T-215-11** El panel sigue sin descargar código en la landing pública, y su presupuesto de
  JavaScript no cambia.
- **T-215-12** No queda ninguna ficha declarada que no use nadie, ni ninguna que se use sin
  declarar. Es la lección de `--font-serif`: una ficha huérfana miente sobre lo que hay puesto.
