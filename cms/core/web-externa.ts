import 'server-only';
import appConfig from '@/cms.config';
import { laWebViveFuera } from '@/cms/vista-previa-remota';

/**
 * Si la landing vive fuera de este despliegue: lo que decide a dónde va quien pide `/` y si el
 * sitemap anuncia algo (spec 18, ADR-1200).
 *
 * ## Dos formas de saberlo, y basta con una
 *
 * - **Lo declara `cms.config.ts`** con `webExterna: true`. Es la que no depende de nada más: quien
 *   monta el CMS para una web de fuera lo sabe al escribir ese fichero.
 * - **La vista previa remota está puesta**, que es la condición de la spec 14. Se conserva para
 *   que un despliegue que hoy redirige sin haber declarado nada no deje de hacerlo al actualizar.
 *
 * Solo con la segunda, la raíz dependía de `PREVIEW_URL` y `PREVIEW_ORIGINS`, que son opcionales
 * y que `docs/SETUP.md` invita a dejar para más adelante. En el primer despliegue de verdad la
 * raíz del panel servía la landing de ejemplo con el contenido real dentro (#314).
 *
 * No va en `cms/vista-previa-remota.ts` porque aquel módulo lo importa el middleware, que corre
 * en el edge, y `cms.config.ts` es `server-only`.
 *
 * Los parámetros existen para probarla sin tocar ni la configuración ni el entorno del proceso.
 */
export function webExterna(
  declarada: boolean = appConfig.webExterna,
  valorUrl?: string | undefined,
  valorOrigenes?: string | undefined
): boolean {
  return declarada || laWebViveFuera(valorUrl, valorOrigenes);
}
