/**
 * La política de seguridad de contenido (SPEC §7.2, spec 08 §4.4).
 *
 * ## Por qué salió del middleware
 *
 * Estaba dentro de `middleware.ts` y allí no se podía probar sin levantar un servidor: los
 * tests de M2 la comprueban sobre la respuesta real en e2e, que es lo correcto para saber que
 * **sale**, y muy caro para comparar dos políticas carácter a carácter.
 *
 * Y eso es justo lo que exige T-R-2: encender la vista previa remota añade una directiva, y la
 * forma de romperlo sin enterarse es aflojar la política para todo el mundo mientras se añade
 * una directiva para unos pocos. Ese caso solo se ve comparando la cadena entera.
 *
 * Los e2e de §7.2 siguen donde estaban: esto no los sustituye. Un test de aquí pasaría igual
 * si el middleware dejara de llamar a esta función.
 *
 * ## Por qué está fuera de la frontera `server-only`
 *
 * Lo mismo que `cms/routes.ts` y `cms/vista-previa-remota.ts`: el middleware corre en edge.
 */

/**
 * A dónde sube el navegador las imágenes (ADR-703).
 *
 * Sale de `getApiUrl()` de `@vercel/blob`, que por omisión apunta aquí. Está escrito como
 * constante y no dentro de la cadena para que se vea que es **un** origen concreto, y para que
 * el día que el SDK cambie de dirección se toque un sitio.
 */
const DESTINO_DE_SUBIDAS = 'https://vercel.com';

export interface OpcionesDeCsp {
  /** El nonce de esta petición. Uno por petición, nunca reutilizado. */
  readonly nonce: string;
  /** `'unsafe-eval'` solo en desarrollo, que es donde Next lo necesita. */
  readonly desarrollo: boolean;
  /**
   * Los orígenes que pueden empotrarse en un iframe, además del nuestro (spec 08 §4.4).
   *
   * Vacío es el estado normal, y entonces **no se emite `frame-src` en absoluto**. No es lo
   * mismo que emitir `frame-src 'self'`: aunque el efecto sea idéntico —sin la directiva se
   * hereda `default-src 'self'`—, la cabecera cambiaría, y lo que T-R-2 exige es que sin la
   * variable la política sea byte a byte la de antes. Una diferencia que "no importa" es la
   * que hace que la próxima sí importe y no se vea.
   */
  readonly origenesEmpotrables?: readonly string[];
}

export function construirCsp({
  nonce,
  desarrollo,
  origenesEmpotrables = [],
}: OpcionesDeCsp): string {
  // SPEC §7.2, literal. `'unsafe-eval'` solo en desarrollo: Next lo necesita para la
  // recarga en caliente, y dejarlo en producción anularía buena parte de la política.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(desarrollo ? ["'unsafe-eval'"] : []),
  ].join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // `'unsafe-inline'` en estilos es lo que fija SPEC §7.2. Tailwind emite una hoja
    // estática, pero Next inyecta estilos en línea durante la hidratación.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com",
    // `'self'` **más el punto de subida de Vercel Blob**, y solo ese (ADR-703, issue #197).
    //
    // ADR-005 manda el fichero del navegador a Vercel directamente, sin pasar por nuestro
    // servidor. Con `connect-src 'self'` a secas, el navegador bloqueaba esa conexión: el token
    // se emitía —200 en nuestra ruta—, el fichero no llegaba a ningún sitio y la pantalla se
    // quedaba en «Subiendo…» para siempre. Sin error en ninguna parte, porque el servidor había
    // hecho su trabajo.
    //
    // **No lo cazó nada en dos hitos** porque en local no existe ese camino: sin token de Blob
    // las subidas van al disco (ADR-700), o sea al propio origen, que `'self'` permite. El
    // camino que se despliega no lo ejercitaba nadie.
    //
    // Es un origen concreto y no un comodín: `https://vercel.com` es a donde sube el SDK
    // —`getApiUrl()` en `@vercel/blob`— y nada más.
    //
    // **No se toca al encender la vista previa remota**, y eso sigue igual: la web de destino
    // nos pide datos a nosotros, no al revés (spec 08 §4.4). Lo que hace falta relajar para eso
    // está en la CSP de esa web.
    `connect-src 'self' ${DESTINO_DE_SUBIDAS}`,
    // Quién puede vivir dentro de nuestros iframes. La única directiva que cambia al
    // encender la vista previa remota, y solo si hay orígenes configurados.
    ...(origenesEmpotrables.length > 0
      ? [`frame-src 'self' ${origenesEmpotrables.join(' ')}`]
      : []),
    // Anti-clickjacking (SPEC §7.1). Permite el iframe de la vista previa, que es
    // same-origin, y bloquea que nadie embeba la landing desde fuera.
    //
    // Es la simétrica de la anterior y no se toca: `frame-src` dice a quién dejamos entrar
    // en nuestra página, `frame-ancestors` en qué páginas dejamos entrar a la nuestra.
    // Confundirlas aquí abriría el clickjacking a cambio de nada.
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
