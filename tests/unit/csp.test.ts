import { describe, expect, it } from 'vitest';
import { construirCsp } from '@/cms/csp';

/**
 * La política de seguridad de contenido, entera (SPEC §7.2).
 *
 * T-R-2 y T-R-3: **encender la vista previa remota añade una directiva y no toca ninguna otra**
 * (spec 08 §4.4 y §6.1). T-197-1 a T-197-3: **la subida de imágenes necesita salir del origen**
 * (ADR-703).
 *
 * ## Por qué la política se compara entera y no por trozos
 *
 * Porque la forma de romper esto sin enterarse es aflojar la CSP para todo el mundo mientras se
 * añade una directiva para unos pocos: quitar `object-src 'none'`, meter un `'unsafe-inline'` en
 * los scripts, ampliar `connect-src` "ya que estamos". Ninguna de esas tres la ve un
 * `toContain`, y todas las ve una comparación de la cadena completa.
 *
 * ## Lo que estos tests NO comprueban
 *
 * Que la cabecera **salga**. Un test de aquí pasaría igual si el middleware dejara de llamar a
 * `construirCsp` o si el `matcher` no la cubriera. Eso lo comprueban los e2e de §7.2 sobre la
 * respuesta real, y por eso T-R-2 tiene además un caso allí.
 */

/** El nonce no importa aquí, y fijarlo es lo que permite comparar cadenas. */
const NONCE = 'NONCE-DE-PRUEBA';

/**
 * La política de hoy, escrita a mano y carácter a carácter.
 *
 * Es un valor esperado copiado, no calculado, y eso es lo que le da sentido: si se derivara del
 * mismo código que prueba, cualquier cambio se propagaría a los dos lados y el test seguiría en
 * verde diciendo que nada cambió.
 *
 * Que este literal haya que tocarlo a mano para cambiar la CSP es la función, no el coste.
 */
const CSP_DE_HOY =
  "default-src 'self'; " +
  `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'; ` +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com; " +
  "connect-src 'self' https://vercel.com; " +
  "frame-ancestors 'self'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "object-src 'none'";

describe('T-R-2 — sin PREVIEW_ORIGINS la CSP es byte a byte la de antes', () => {
  it('sin orígenes, la política no cambia ni un carácter', () => {
    expect(construirCsp({ nonce: NONCE, desarrollo: false })).toBe(CSP_DE_HOY);
  });

  it('una lista vacía es lo mismo que no haber lista', () => {
    // El estado real de un despliegue con la variable declarada y sin valor, y el de una lista
    // mal escrita: `origenesDeVistaPreviaRemota` devuelve `[]` en los dos casos.
    expect(construirCsp({ nonce: NONCE, desarrollo: false, origenesEmpotrables: [] })).toBe(
      CSP_DE_HOY
    );
  });

  it('no aparece `frame-src` en absoluto, ni siquiera con `self`', () => {
    // `frame-src 'self'` tendría el mismo efecto que no ponerlo —se hereda de `default-src`—
    // pero la cabecera cambiaría, y lo que este caso protege es que no cambie. Una diferencia
    // que "no importa" es la que hace que la próxima sí importe y no se vea.
    expect(construirCsp({ nonce: NONCE, desarrollo: false })).not.toContain('frame-src');
  });

  it('en desarrollo tampoco, y ahí la única diferencia sigue siendo unsafe-eval', () => {
    expect(construirCsp({ nonce: NONCE, desarrollo: true })).toBe(
      CSP_DE_HOY.replace("'strict-dynamic'", "'strict-dynamic' 'unsafe-eval'")
    );
  });
});

describe('T-R-3 — con la variable, solo cambia frame-src', () => {
  const ORIGENES = ['https://mi-web.com', 'http://localhost:3000'];

  const directivas = (csp: string): string[] => csp.split('; ');

  it('la directiva añadida lleva self y esos orígenes', () => {
    const conFase = directivas(
      construirCsp({ nonce: NONCE, desarrollo: false, origenesEmpotrables: ORIGENES })
    );

    expect(conFase).toContain("frame-src 'self' https://mi-web.com http://localhost:3000");
  });

  it('quitando esa directiva queda exactamente la política de antes', () => {
    // El caso que importa del bloque: no basta con mirar lo que se añadió, hay que mirar lo que
    // quedó. Aflojar `script-src` o borrar `object-src` mientras se añade `frame-src` pasaría
    // cualquier comprobación que solo mirase la directiva nueva.
    const conFase = directivas(
      construirCsp({ nonce: NONCE, desarrollo: false, origenesEmpotrables: ORIGENES })
    );
    const sinLaNueva = conFase.filter((directiva) => !directiva.startsWith('frame-src '));

    // Igualdad de lista, no de conjunto: también cazaría un reordenamiento.
    expect(sinLaNueva).toEqual(directivas(CSP_DE_HOY));
  });

  it('se añade una directiva y una sola', () => {
    const sinFase = directivas(construirCsp({ nonce: NONCE, desarrollo: false }));
    const conFase = directivas(
      construirCsp({ nonce: NONCE, desarrollo: false, origenesEmpotrables: ORIGENES })
    );

    expect(conFase.length).toBe(sinFase.length + 1);
  });

  it('frame-ancestors no se toca, que es la que se parece y no es', () => {
    // `frame-src` dice a quién dejamos entrar en nuestra página; `frame-ancestors`, en qué
    // páginas dejamos entrar a la nuestra. Confundirlas aquí abriría el clickjacking a cambio
    // de nada, y la cadena resultante se parecería mucho a la correcta.
    const conFase = construirCsp({
      nonce: NONCE,
      desarrollo: false,
      origenesEmpotrables: ORIGENES,
    });

    expect(conFase).toContain("frame-ancestors 'self';");
    for (const origen of ORIGENES) {
      expect(conFase).not.toContain(`frame-ancestors 'self' ${origen}`);
    }
  });

  it('T-197-3: `connect-src` no gana los orígenes de la vista previa remota', () => {
    // La web de destino nos pide datos a nosotros, no al revés (spec 08 §4.4). Son dos permisos
    // distintos —a quién dejamos entrar en un iframe, y a dónde dejamos que salga el navegador—
    // y confundirlos abriría la salida de datos a una lista pensada para otra cosa.
    const conFase = construirCsp({
      nonce: NONCE,
      desarrollo: false,
      origenesEmpotrables: ORIGENES,
    });
    const connect = conFase.split('; ').find((d) => d.startsWith('connect-src ')) ?? '';

    for (const origen of ORIGENES) {
      expect(connect, `connect-src no debe listar ${origen}`).not.toContain(origen);
    }
  });
});

describe('T-197-1 y T-197-2 — la subida de imágenes puede salir del origen', () => {
  /**
   * El fallo que esto arregla no daba error en ninguna parte.
   *
   * ADR-005 manda el fichero del navegador a Vercel directamente. Con `connect-src 'self'` a
   * secas, el navegador bloqueaba esa conexión: nuestra ruta respondía 200 al emitir el token,
   * el fichero no llegaba a ningún sitio, y la pantalla se quedaba en «Subiendo…» para siempre.
   * Ni un error en el registro del servidor, porque el servidor había hecho su parte.
   *
   * Y no lo cazó nada en dos hitos porque **en local ese camino no existe**: sin token de Blob
   * las subidas van al disco (ADR-700), o sea al propio origen, que `'self'` permite. El camino
   * que se despliega no lo ejercitaba nadie.
   */

  const connectSrc = (csp: string): string =>
    csp.split('; ').find((directiva) => directiva.startsWith('connect-src ')) ?? '';

  it('T-197-1: permite el punto de subida de Vercel Blob', () => {
    const connect = connectSrc(construirCsp({ nonce: NONCE, desarrollo: false }));

    expect(connect).toContain("'self'");
    expect(connect).toContain('https://vercel.com');
  });

  it('T-197-2: y no se ha aflojado nada más por el camino', () => {
    // El mismo criterio que T-R-2: la forma de romper esto sin enterarse es aflojar la política
    // entera mientras se abre un hueco concreto. Se compara la cadena completa.
    expect(construirCsp({ nonce: NONCE, desarrollo: false })).toBe(CSP_DE_HOY);
  });

  it('T-197-2: es un origen concreto, no un comodín', () => {
    // `connect-src 'self' *` o `https:` a secas dejaría al navegador del panel hablar con
    // cualquier sitio, que es lo que una CSP existe para impedir. Hace falta una dirección.
    const connect = connectSrc(construirCsp({ nonce: NONCE, desarrollo: false }));

    expect(connect).not.toContain('*');
    expect(connect.split(' ').filter((f) => f === 'https:')).toEqual([]);
  });
});
