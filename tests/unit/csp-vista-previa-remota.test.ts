import { describe, expect, it } from 'vitest';
import { construirCsp } from '@/cms/csp';

/**
 * T-R-2 y T-R-3: **encender la vista previa remota añade una directiva y no toca ninguna otra**
 * (spec 08 §4.4 y §6.1).
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
  "connect-src 'self'; " +
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

  it('connect-src sigue siendo solo nuestro', () => {
    // La web de destino nos pide datos a nosotros, no al revés (spec 08 §4.4). Lo que hay que
    // relajar está en la CSP de esa web.
    const conFase = construirCsp({
      nonce: NONCE,
      desarrollo: false,
      origenesEmpotrables: ORIGENES,
    });

    expect(conFase).toContain("connect-src 'self';");
  });
});
