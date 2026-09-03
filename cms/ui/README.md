Componentes del panel (SPEC §3, §9). El visitante de la landing nunca descarga este código: vive
en su propio grupo de rutas, y el presupuesto de JavaScript lo comprueba (ADR-601).

El formulario **se genera** desde `cms.config.ts`; añadir un campo a la configuración lo hace
aparecer sin tocar ningún componente.

Dos reglas que se ven en casi todos los ficheros de aquí: el vocabulario de §9 —hay un test que
falla si aparece "slug", "schema" o "token" en la interfaz— y que **toda confirmación destructiva
dice qué se pierde**, con el foco en _Cancelar_, porque confirmar a ciegas pulsando Intro debe ser
el error barato de los dos.

La tercera, desde #233: **los dibujos salen de `iconos.tsx`**, nunca escritos a mano. La única
excepción es `MarcaDeGoogle.tsx` —el logotipo de un tercero, con sus colores fijos, que Lucide no
trae— y está declarada con su motivo en la propia guarda, `tests/unit/iconos-y-fichas.test.ts`.
