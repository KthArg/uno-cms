# 12 — El panel de inicio en bento, el rail de iconos y la paleta tierra

> Escrita **antes** del código. Los casos de la sección 8 son la definición de "hecho".
>
> Origen: [#229](https://github.com/KthArg/uno-cms/issues/229). Continúa la
> [spec 11](11-cristal-e-iconos.md), que **no se deroga**: el material —cristal, iconos,
> profundidad, la regla de dónde hay cristal, la guarda de contraste de ADR-800— sigue entero.
> Lo que cambia es **la composición** y **los valores de la paleta**.

## 1. Qué falló, dicho con precisión

La spec 11 acertó el material y falló la disposición. La valoración fue: **«no solo en la
estética, sino también en la manera que están acomodados los elementos»**, con una referencia
visual delante — un panel de analítica con rail de iconos, tarjeta grande con foto a sangre,
columna de tarjetas a la derecha y tabla ancha abajo.

Lo entregado en #224 es un layout de barra lateral con texto y contenido en una columna. Con
cristal y con iconos, pero **la misma forma de siempre**. Y la forma es lo que se reconoce antes
que el color: por eso «se ve bien» y «se ve como cualquier otro» pueden ser ciertos a la vez.

## 2. La composición: bento

Cuatro zonas, y el orden de lectura es el que decide dónde va cada cosa.

```
┌──┬──────────────────────────────────────────────────┐
│  │  Contenido                          ◻ ◻ ◐ (av)   │   cabecera
│▣ ├──────────────────────────────┬───────────────────┤
│▤ │                              │  Publicaciones    │   pieza principal
│▥ │   PORTADA · imagen real      │   ▁▃▅▇▅▃▁         │   + columna de apoyo
│▦ │   El título de tu portada    ├───────────────────┤
│▧ │   [ Publicar todo ]          │  Última imagen    │
│  │  ┌─────┬─────┬─────┬─────┐   │  [foto]  nombre   │
│  │  │  5  │  1  │ 12  │  3  │   │                   │   las cifras, dentro
│  │  └─────┴─────┴─────┴─────┘   │                   │   de la pieza grande
│  ├──────────────────────────────┴───────────────────┤
│  │  Tus secciones                       [Estado ▾]  │   la tabla ancha
│  │  Portada           Cambios sin publicar     →    │
│  └──────────────────────────────────────────────────┘
```

- **El rail** es de iconos, sin texto visible, y flota separado del borde.
- **La pieza grande** es la portada del sitio, con su imagen de verdad si la tiene. Es la sección
  que más se edita y la única que trae una imagen que enseñar.
- **Las cifras van dentro de la pieza grande**, no en tarjetas sueltas: en la referencia es lo que
  hace que la zona superior se lea como **un objeto** y no como cinco.
- **La columna derecha** son dos tarjetas apiladas: la actividad de publicación y la última imagen
  subida.
- **La tabla ancha** es lo que `SPEC.md` §9 pide —el estado de cada sección— reordenado en filas.

## 3. Lo que `SPEC.md` §9 fija, y por qué esto no lo contradice

§9 dice que el panel de contenido tiene «tarjeta por sección con estado + botón Publicar todo».

**Las dos cosas siguen**: el estado de cada sección está en la tabla ancha, con las mismas tres
frases de siempre, y «Publicar todo» es la acción de la pieza principal. Lo que cambia es que las
secciones dejan de ser tarjetas en rejilla y pasan a ser filas — y una fila con su estado sigue
siendo «una tarjeta por sección con estado» en todo lo que esa frase promete: que cada sección se
ve, y que se ve en qué estado está.

Se dice aquí y no se da por supuesto porque **es la clase de cambio que se cuela**: reordenar una
pantalla es a un paso de quitarle algo que la spec exigía.

## 4. El rail, y el problema que crea

La spec 11 §5 dice, con estas palabras: «el icono acompaña al texto, no lo sustituye». Un rail de
iconos mudos es exactamente lo contrario, así que hay que decidirlo, no deslizarlo.

**Se acepta el rail, y con tres condiciones que lo hacen sostenible:**

1. **Cada icono conserva su nombre accesible.** Quien usa un lector de pantalla oye «Contenido»,
   no «enlace». El texto no desaparece: deja de estar pintado.
2. **Y lo enseña al pasar por encima**, con el `title` nativo. No es un tooltip propio: uno hecho
   a mano hay que hacerlo accesible por teclado, y el del navegador ya lo está.
3. **En el móvil no hay rail.** La barra inferior de #220 mantiene el texto bajo el icono, que es
   donde de verdad no se puede adivinar — la primera vez, con una mano y andando.

Lo que se pierde, dicho: **la primera vez en escritorio hay que pasar el ratón para saber qué es
cada cosa**. Son cuatro secciones y se aprenden a la segunda sesión; a cambio, la pantalla gana
el ancho que el menú se llevaba y la composición se parece a lo que se pidió.

## 5. La paleta: tierra cálido

El fondo pasa de azul-noche a **tierra oscuro**, y el acento de latón a **naranja**. Es lo que
tiene la referencia y es coherente con lo que ya había: el neutro se tiñe hacia el hue del acento
—no hacia un marrón cualquiera— así que el cristal se lee cálido y el naranja no queda pegado
encima.

**La arquitectura no cambia ni un poco**: las mismas fichas, los mismos dos bloques oscuros, la
misma guarda de contraste sobre el color compuesto de ADR-800. Cambian los valores, que es
exactamente lo que #219 hizo posible.

Y el acento **sigue siendo el mismo color que «pendiente»** (ADR-802): dorado se convierte en
naranja, y el significado —«aquí te toca a ti»— no se toca.

## 6. Las cifras y la gráfica: solo lo que existe

**Este CMS no tiene analítica.** La referencia lleva usuarios activos, ventas y días medios por
vídeo; aquí no hay ninguna de esas series, y rellenar los huecos con números plausibles sería
justo lo que este repositorio persigue.

Lo que sí hay:

| En la pantalla        | De dónde sale                                                |
| --------------------- | ------------------------------------------------------------ |
| Secciones y su estado | `listSections()`, que ya existe                              |
| Imágenes              | `listMedia()`                                                |
| Personas con acceso   | el listado de usuarios                                       |
| Última imagen subida  | `listMedia()`, la primera por fecha                          |
| **Publicaciones/día** | `revisions.published_at`, y **no cuenta lo que parece** (§7) |

## 7. Qué cuenta la gráfica de publicaciones, exactamente

Va aparte porque es lo único que se añade y lo único que puede mentir.

`revisions` es la única tabla con historia, y tiene tres propiedades que hay que tener delante:

1. **La revisión solo se crea si ya había algo publicado** (ADR-402), así que **la primera
   publicación de una entrada no genera ninguna**.
2. Su `published_at` es `defaultNow()`: marca **el momento en que se sustituyó**, no el de lo que
   guarda.
3. **Se podan a 20 por entrada** (`SPEC.md` §4).

De ahí sale que la serie honesta es: **las revisiones de la ventana, más la fecha de publicación
de las entradas que no tienen ninguna** — o sea, las que se publicaron una sola vez.

Y lo que esa serie **no** ve, escrito para que nadie lo descubra creyendo que es un fallo: si una
entrada se publica por primera vez y se republica **dentro de la misma ventana de 14 días**, la
primera publicación no aparece. Su fecha no está registrada en ninguna parte del esquema.

Por eso la tarjeta se titula **«Publicaciones»** y lleva su ventana escrita, no «actividad» ni
nada que prometa completitud.

## 8. Casos

- **T-216-1** El panel de inicio sigue ofreciendo lo que fija `SPEC.md` §9: el estado de cada
  sección, con su vocabulario, y «Publicar todo».
- **T-216-2** Cada entrada del rail conserva su nombre accesible y su `title`.
- **T-216-3** La serie de publicaciones cuenta lo que dice contar, comprobado sobre datos
  conocidos — incluido el caso de la entrada publicada una sola vez, que es el que se sale de
  `revisions`.
- **T-216-4** La paleta nueva cumple AA sobre el color compuesto en los dos modos, con las
  guardas de ADR-800 **sin tocar**.
- **T-216-5** El bento no desborda a 390 ni a 320 px, y ninguna zona pulsable baja de 44 px.
- **T-216-6** Lighthouse sigue en rendimiento ≥ 90 y accesibilidad ≥ 95.
- **T-216-7** El presupuesto de JavaScript de la landing no se mueve.
- **T-216-8** Sigue sin haber colores literales ni variantes `dark:` en el panel, y ninguna ficha
  declarada se queda sin usar.

## 9. Fuera de alcance

- **Las demás pantallas no se reorganizan.** Imágenes, personas y ajustes reciben el rail y la
  paleta, y mantienen su estructura: son listas y formularios, y un bento no les aporta nada.
- **La landing pública**, otra vez y por lo mismo.
- **Analítica de verdad.** Si algún día hace falta saber cuánta gente visita la web, eso es un
  producto distinto y una decisión aparte; lo que hay aquí es lo que el propio CMS registra.
