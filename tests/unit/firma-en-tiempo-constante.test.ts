import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';
import { sinComentarios } from '../support/codigo';

/**
 * T-A-43: **la comparación de firmas del receptor sigue siendo en tiempo constante** (#291).
 *
 * ## Por qué esto es una guarda estática y no un test de verdad
 *
 * Porque **el test de verdad no existe**. `===` y `timingSafeEqual` devuelven exactamente lo
 * mismo para toda entrada: lo único que cambia es cuánto tardan. Medir eso desde una suite es un
 * test que falla los martes por el ruido de la máquina y que da verde el resto de la semana.
 *
 * Está comprobado, y no de oídas: al cerrar #287 se mutó `timingSafeEqual` por `===` y **los
 * treinta casos del receptor siguieron en verde**. Esa mutación es la que justifica este fichero.
 *
 * ## De dónde sale el peligro, que es lo que hay que saber para no quitar esto
 *
 * `examples/web-remota/lib/aviso.js` compara la firma que llega con la que calcula. Con `===`, la
 * comparación **para en el primer byte distinto**, y ese tiempo se puede medir desde fuera: con
 * suficientes intentos se reconstruye la firma byte a byte **sin conocer el secreto**, y entonces
 * cualquiera puede obligar a esa web a repedirlo todo cuando quiera.
 *
 * Es un ataque viejo y conocido, y por eso el ejemplo lo hace bien. Pero **un ejemplo se copia
 * entero**: quien cambie esa línea por `===` porque le parece más limpia se lleva el agujero a su
 * web, y hasta hoy la suite le habría dado verde.
 *
 * ## Lo que comprueba y lo que no
 *
 * Que la comparación use `timingSafeEqual` y que no haya una comparación directa entre dos
 * firmas. **No puede comprobar que el algoritmo entero sea seguro** — eso es leer el código, y por
 * eso el módulo lo explica en su cabecera. Lo que impide es la clase de regresión que sí se puede
 * detectar: que alguien la sustituya por el operador de siempre.
 */

const RECEPTOR = join(REPO_ROOT, 'examples', 'web-remota', 'lib', 'aviso.js');

/** Sin comentarios: la cabecera del módulo habla de `===` para explicar por qué NO se usa. */
const CODIGO = sinComentarios(readFileSync(RECEPTOR, 'utf8'));

/**
 * Una firma comparada contra otra firma, con un operador que corta en el primer byte distinto.
 *
 * **Los dos lados tienen que ser un identificador de firma**, y eso no es una sutileza: la primera
 * versión de esta guarda buscaba `firmaRecibida\s*[=!]==` a secas y saltó en el acto, sobre el
 * `typeof firmaRecibida !== 'string'` que valida la entrada. Legítimo y necesario.
 *
 * Una guarda que salta por lo que no es acaba silenciada, y entonces no protege de nada.
 */
const UNA_FIRMA_CONTRA_OTRA =
  /\b(esperada|recibida|firmaRecibida|firma)\s*[=!]==\s*(esperada|recibida|firmaRecibida|firma)\b/;

describe('T-A-43 — la firma se compara en tiempo constante', () => {
  it('el receptor importa y usa `timingSafeEqual`', () => {
    expect(CODIGO).toContain("from 'node:crypto'");
    expect(CODIGO, 'la comparación de firmas dejó de ser en tiempo constante').toContain(
      'timingSafeEqual('
    );
  });

  it('y no compara una firma con otra usando `===`', () => {
    expect(
      UNA_FIRMA_CONTRA_OTRA.test(CODIGO),
      'la firma se compara con un operador que para en el primer byte distinto'
    ).toBe(false);
  });

  it('el propio test detecta la regresión que dice detectar', () => {
    // Verificación de la guarda: sin esto, un patrón mal escrito daría verde para siempre — que
    // es exactamente el fallo que este fichero existe para evitar en otro sitio. Y ya ocurrió
    // escribiéndolo: una versión construía el patrón con `new RegExp` sobre una plantilla, donde
    // `\b` es un retroceso y `\s` es una `s`. El caso pasaba **por no encontrar nada**.
    const mutado = CODIGO.replace('return timingSafeEqual(a, b);', 'return esperada === recibida;');

    expect(mutado, 'la mutación no llegó a aplicarse').not.toBe(CODIGO);
    expect(UNA_FIRMA_CONTRA_OTRA.test(mutado)).toBe(true);
  });

  it('y no salta con las comprobaciones de tipo, que son legítimas', () => {
    // El otro lado de la verificación: una guarda que no distingue esto se vuelve ruido.
    expect(UNA_FIRMA_CONTRA_OTRA.test("if (typeof firmaRecibida !== 'string') return X;")).toBe(
      false
    );
    expect(UNA_FIRMA_CONTRA_OTRA.test('if (a.length !== b.length) return false;')).toBe(false);
  });
});
