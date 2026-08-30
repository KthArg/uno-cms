# 09 — Una suite de humo contra el despliegue

> Escrita **antes** del código. Los casos de la sección 7 son la definición de "hecho".
>
> Sale de [#207](https://github.com/KthArg/uno-cms/issues/207) y de los cinco fallos del primer despliegue, contados en `docs/PROGRESS.md`.

## 1. El problema, dicho con precisión

**Lo que se prueba y lo que se despliega no son el mismo camino.** Y no por descuido:

| En los tests                                 | En el despliegue                                            |
| -------------------------------------------- | ----------------------------------------------------------- |
| Las imágenes van al disco (ADR-700)          | Van a Vercel Blob, subidas por el navegador                 |
| Postgres con `node-postgres`                 | Neon con su driver por WebSocket (ADR-200)                  |
| Nadie manda avisos de terceros               | Vercel manda `blob.upload-completed`                        |
| `next start` a secas, con la CSP sin ejercer | La CSP que compone el middleware, aplicada por un navegador |

Las tres suites corren en la columna izquierda. **Cinco fallos de producción salieron de la derecha en una sola sesión**, y ninguno era visible desde aquí.

## 2. Por qué no vale apuntar la suite e2e a la dirección desplegada

`E2E_BASE_URL` ya existe y hace justo eso. Y no sirve, por tres motivos que conviene dejar escritos porque la tentación va a volver:

1. **La suite e2e es destructiva.** Publica, borra elementos de colecciones, crea y desactiva personas. Contra un sitio con contenido de verdad, lo destroza.
2. **`globalSetup` da por suya la base de datos.** Deja el sitio "ya configurado" escribiendo directamente en Postgres. Contra un despliegue no tiene acceso, y si lo tuviera sería peor.
3. **Da por hecho que empieza limpia.** Varios casos cuentan filas o buscan "el primer elemento". Con datos existentes delante fallarían por el motivo equivocado, que es la peor clase de rojo: enseña a ignorar la suite.

Así que es una suite **aparte**, con su configuración y su comando. No se ejecuta con `pnpm test:e2e` ni por accidente.

## 3. El principio que la gobierna

> **No toca nada que no haya creado ella.**

Un sitio en línea puede tener contenido real de alguien. Una suite de humo que publique, borre o edite lo que encuentre es peor que no tener suite: la primera vez que rompa algo, nadie la vuelve a ejecutar.

De ahí salen tres reglas duras:

- **No publica.** Nunca. Publicar es visible para quien visita la web.
- **No guarda borradores de contenido existente.** Ni siquiera un borrador: `saveDraft` sobre una sección real pisa el trabajo a medias de alguien.
- **Lo único que crea es una imagen**, y la borra al terminar. Si no puede borrarla, **lo dice y falla**, en vez de dejar basura en silencio.

Lo que sí hace es **leer**: entrar, mirar el panel, mirar la biblioteca, pedir la landing.

## 4. Contratos

### 4.1 Cómo se le dice a dónde apuntar

```
HUMO_URL=https://uno-cms.vercel.app        # el despliegue, sin barra final
HUMO_EMAIL=alguien@ejemplo.com             # una cuenta que ya exista allí
HUMO_PASSWORD=...
```

**Sin las tres, la suite se salta con un aviso** — igual que los tests de integración sin `DATABASE_URL`. Una suite de humo que se inventa un entorno da verde sin probar nada, que es exactamente el problema que viene a resolver.

Y **no arranca ningún servidor**. Si `HUMO_URL` apunta a una dirección local, avisa: entonces está probando otra vez la columna izquierda de la tabla de §1. Avisa y no lo prohíbe, porque hay un caso legítimo — depurar la propia suite.

### 4.2 Qué cuenta como "el despliegue funciona"

Cuatro cosas, en este orden, porque cada una necesita la anterior:

1. **`/api/health` responde `ok`.** Eso ya ejercita el driver de Neon contra el esquema real ([#43](https://github.com/KthArg/uno-cms/issues/43)).
2. **Se puede entrar** con una cuenta de verdad. Ejercita Auth.js con `trustHost`, las cookies sobre `https` y la lectura de usuarios.
3. **Se puede subir una imagen** y aparece en la biblioteca. Este vale por varios: pasa por la CSP, por el token del almacén, por el nombre generado y por la escritura de la fila.
4. **Sigue estando tras recargar.** No basta con verla: el estado local del selector la enseña aunque no se haya guardado nada. **Es el fallo de #205 exactamente**, y sin recargar no se ve.

### 4.3 La misma imagen, dos veces

Un caso aparte, porque es como se encontró #199: subir **el mismo fichero dos veces**. Con el nombre del fichero de quien sube, la segunda rebota con `This blob already exists`. Con un UUID no puede pasar.

Es barato y cubre desde fuera una invariante que no mira nada más.

### 4.4 Cuando falla, tiene que decir qué falló

Un rojo de esta suite se lee desde otra máquina, a veces días después. "Expected true, got false" no sirve. Cada paso dice **qué se estaba haciendo y qué se recibió**: el estado HTTP, el texto del aviso del panel, la dirección pedida.

## 5. Qué habría cazado, y qué no

Contra los cinco fallos del primer despliegue:

| Fallo                                        | ¿Lo caza? | Por qué                                                                                  |
| -------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 1. La CSP bloqueaba la subida                | **Sí**    | La subida falla en el navegador                                                          |
| 2. Almacén privado y token equivocado        | **Sí**    | La subida falla al pedir el token                                                        |
| 3. El nombre lo ponía el cliente (#199)      | **Sí**    | Con el caso de §4.3, la segunda subida rebota                                            |
| 4. El aviso de Vercel llegaba con 401 (#201) | **No**    | Desde ADR-705 la fila la escribe el navegador, así que ese 401 ya no se nota desde fuera |
| 5. La fila llegaba tarde (#205)              | **Sí**    | El punto 4 de §4.2, recargando                                                           |

Cuatro de cinco. **El cuarto no es un hueco de esta suite: es lo que dice [#206](https://github.com/KthArg/uno-cms/issues/206)** — que un aviso perdido ya no tiene consecuencia observable, y por eso hace falta reconciliar el almacén con la base. Dos cosas distintas, y las dos abiertas.

## 6. Fuera de alcance

- **Ejecutarla en CI automáticamente.** Hace falta un despliegue de pruebas separado y credenciales en el repositorio; hoy no hay ni lo uno ni lo otro, y GitHub Actions está parado por facturación. Se escribe para poder ejecutarse a mano **hoy** y engancharse a CI cuando eso exista.
- **Medir rendimiento.** §8 tiene sus presupuestos y su issue ([#117](https://github.com/KthArg/uno-cms/issues/117)). Mezclarlo aquí haría que un despliegue lento pareciera un despliegue roto.
- **La vista previa remota.** Necesita una segunda web desplegada. Va cuando exista.
- **Crear la cuenta que usa.** La crea quien despliega. Automatizarlo significaría poner `SETUP_TOKEN` al alcance de la suite.

## 7. Casos

- **T-207-1** La suite corre contra la dirección que le pasan, y **no arranca ningún servidor**.
- **T-207-2** Sin `HUMO_URL`, `HUMO_EMAIL` o `HUMO_PASSWORD`, se salta con un aviso que dice cuál falta. No falla y no se inventa un entorno.
- **T-207-3** Avisa si la dirección es local, porque entonces no está probando lo que dice probar.
- **T-207-4** `/api/health` responde que sí, con su latencia.
- **T-207-5** Se entra con la cuenta dada y el panel se pinta.
- **T-207-6** Se sube una imagen, aparece en la biblioteca, y **sigue apareciendo tras recargar la página**.
- **T-207-7** Subir el mismo fichero dos veces funciona, y deja dos imágenes distintas.
- **T-207-8** Todo lo que la suite sube, lo borra. Si no puede, **falla diciéndolo** en vez de dejarlo.
- **T-207-9** La suite no publica, no guarda borradores y no toca contenido que no haya creado ella — comprobado sobre su propio código, no sobre una promesa en prosa.
- **T-207-10** Un fallo dice qué paso falló y qué se recibió.
