import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificar el aviso que manda el CMS al publicar (issue #287, spec 16 §5.5).
 *
 * ## Por qué esto es lo primero que hay que hacer bien
 *
 * Este endpoint hace trabajo cuando se le llama: invalida la caché y provoca peticiones al CMS.
 * **Sin verificar, es un amplificador**: cualquiera en internet obliga a esta web a repedirlo
 * todo, tantas veces como quiera.
 *
 * Así que no es «validación de entrada», es la puerta.
 *
 * ## Las tres cosas que se comprueban, y por qué las tres
 *
 * 1. **La firma**, en tiempo constante. Es lo que dice que el aviso viene del CMS.
 * 2. **La ventana de tiempo.** Sin ella, quien capture un aviso legítimo lo puede reenviar
 *    cuando quiera, para siempre, y la firma seguirá siendo válida.
 * 3. **Que el cuerpo sea un sobre.** Después de la firma, no antes: analizar lo que todavía no
 *    se sabe si es nuestro es procesar entrada no confiable.
 *
 * ## Y una que NO se comprueba: las cabeceras
 *
 * `X-UnoCMS-Evento` y `X-UnoCMS-Id` **no están firmadas** —la firma cubre `ts` y cuerpo—, así
 * que alterarlas por el camino no invalida nada. Están para enrutar y registrar.
 *
 * Por eso todo lo que decide se lee **del cuerpo**: `sobre.id`, `sobre.tags`, `sobre.evento`.
 * Descartar duplicados por el `id` de la cabecera se puede forzar a que reprocese, y es
 * exactamente el error que se comete al implementar esto deprisa.
 *
 * `ts` es la excepción y sí se usa el de la cabecera: va **dentro** de lo firmado, así que si
 * alguien lo toca la firma deja de cuadrar. Es lo que hace que la ventana sirva de algo.
 */

/** Cuánto se acepta de desfase, en milisegundos. Cinco minutos cubre relojes torcidos sin más. */
const VENTANA_MS = 5 * 60 * 1000;

/**
 * Un solo resultado para todos los fallos: firma mala, cuerpo tocado, fuera de ventana o basura.
 *
 * Sin motivo y sin código. Decir «la firma no cuadra» frente a «el `ts` es viejo» le dice a
 * quien está probando por dónde iba bien. Y a quien lo está montando de verdad se lo dice el
 * registro de su propio servidor, no nuestra respuesta.
 */
const RECHAZADO = { ok: false };

function esSobre(valor) {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof valor.id === 'string' &&
    valor.id !== '' &&
    typeof valor.evento === 'string' &&
    Number.isFinite(valor.ts) &&
    Array.isArray(valor.tags)
  );
}

/**
 * Compara dos firmas sin filtrar por dónde empiezan a diferir.
 *
 * `===` sobre cadenas para en el primer byte distinto, y ese tiempo se puede medir: con
 * suficientes intentos se adivina la firma byte a byte sin conocer el secreto. Es un ataque
 * viejo y conocido, y `timingSafeEqual` lo cierra sin pensar.
 *
 * Las longitudes se comparan antes porque `timingSafeEqual` **lanza** si difieren. Eso sí filtra
 * la longitud, y no importa: la longitud de un HMAC-SHA256 en hexadecimal es siempre 64.
 */
function mismaFirma(esperada, recibida) {
  const a = Buffer.from(esperada, 'utf8');
  const b = Buffer.from(recibida, 'utf8');

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verifica un aviso.
 *
 * `cuerpoCrudo` tiene que ser **el texto tal cual llegó**. Si lo analizas y lo vuelves a
 * serializar antes de pasarlo por aquí, la firma no cuadrará nunca: `JSON.stringify` no promete
 * reproducir el mismo texto. Es por lo que `api/aviso.js` usa la firma Web de Vercel y no la de
 * Node, que entrega el cuerpo ya analizado y sin forma de recuperar el original.
 *
 * `ahora` se puede sustituir para probar la ventana sin depender del reloj de la máquina.
 */
export function verificarAviso({ cuerpoCrudo, cabeceras, secreto, ahora = Date.now }) {
  if (typeof secreto !== 'string' || secreto === '') return RECHAZADO;
  if (typeof cuerpoCrudo !== 'string' || cuerpoCrudo === '') return RECHAZADO;

  const tsCrudo = cabeceras.get('x-unocms-ts');
  const firmaRecibida = cabeceras.get('x-unocms-firma');

  if (typeof tsCrudo !== 'string' || typeof firmaRecibida !== 'string') return RECHAZADO;

  const ts = Number(tsCrudo);
  if (!Number.isFinite(ts)) return RECHAZADO;

  // La firma **primero**. Todo lo demás son datos que solo tienen sentido si el aviso es del
  // CMS; mirarlos antes de saberlo es trabajar sobre lo que manda un desconocido.
  const esperada = `sha256=${createHmac('sha256', secreto).update(`${tsCrudo}.${cuerpoCrudo}`).digest('hex')}`;
  if (!mismaFirma(esperada, firmaRecibida)) return RECHAZADO;

  // La ventana después. En valor absoluto: un `ts` en el futuro es tan sospechoso como uno
  // viejo, y además rompería el `?v=` —pediría con una versión que aún no ha pasado—.
  if (Math.abs(ahora() - ts) > VENTANA_MS) return RECHAZADO;

  let sobre;
  try {
    sobre = JSON.parse(cuerpoCrudo);
  } catch {
    return RECHAZADO;
  }

  if (!esSobre(sobre)) return RECHAZADO;

  // Y el `ts` del cuerpo tiene que ser el que se firmó. Si no coinciden, alguien montó el sobre
  // a mano o algo por el camino lo tocó; en cualquier caso no es lo que el CMS mandó.
  if (sobre.ts !== ts) return RECHAZADO;

  return { ok: true, sobre };
}
