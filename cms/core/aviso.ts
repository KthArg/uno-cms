import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { after } from 'next/server';
import appConfig from '@/cms.config';
import { desc, inArray } from 'drizzle-orm';
import { auditLog, getDb } from '@/cms/db';
import { audit } from '@/cms/security/audit';
import { contentTag } from './content';
import { SETTINGS_TAG } from './settings';

/**
 * El aviso a la web de destino cuando lo publicado cambia (spec 16, issue #283).
 *
 * ## Qué problema resuelve, dicho desde el otro lado
 *
 * `publish` invalida **nuestra** caché con `revalidateTag` y ahí se acababa. Una web que vive
 * fuera (ADR-701) no se enteraba: se enteraba cuando le tocara volver a preguntar. Eso la dejaba
 * con dos opciones y las dos malas — no cachear nada (una petición al CMS por visita) o cachear
 * un rato fijo (publicar parece no hacer nada durante ese rato).
 *
 * Este módulo es la tercera: cachear indefinidamente y revalidar **solo cuando se te avisa**.
 *
 * ## Por qué vive en `cms/core` y no en `cms/security`
 *
 * Firma con HMAC, así que la duda es razonable. Pero lo que decide este módulo es de dominio:
 * **qué cambió y qué hay que volver a pedir por ello**. La firma es cómo se transporta, no lo
 * que se transporta. `cms/security/tokens.ts` responde a "¿este token es nuestro?"; aquí se
 * responde a "¿qué secciones tiene que repedir la web?", que es la misma pregunta que contesta
 * `contentTag` un fichero más allá.
 *
 * ## Por qué audita desde aquí
 *
 * Porque el resultado de la entrega solo existe **después** de responderle al editor, dentro del
 * `after()`. Devolverlo hacia arriba para que audite quien llamó no es posible: quien llamó ya
 * terminó. Si el registro no se escribe aquí, no se escribe.
 */

/** Los eventos que existen. La lista es cerrada a propósito: un evento nuevo se decide, no se cuela. */
export type EventoDeAviso =
  | 'content.published'
  | 'content.deleted'
  | 'content.reordered'
  | 'settings.updated'
  | 'media.uploaded'
  | 'media.deleted';

/**
 * Una entrada tocada.
 *
 * `tipo` distingue los tres casos porque **el tag que sale de cada uno es distinto**, y esa es
 * toda la razón de que este campo exista. Ver `tagsDe`.
 */
export interface ClaveAvisada {
  readonly key: string;
  readonly tipo: 'singleton' | 'item' | 'coleccion';
  /** Solo en `item`: a qué colección pertenece. */
  readonly coleccion?: string;
}

/** Lo que se manda. Es el contrato público de esta fase: cambiarlo rompe a quien lo reciba. */
export interface Sobre {
  readonly id: string;
  readonly evento: EventoDeAviso;
  /** Milisegundos desde la época. Sirve para dos cosas: ver §5.3 y §5.4 de la spec 16. */
  readonly ts: number;
  readonly claves: readonly ClaveAvisada[];
  readonly tags: readonly string[];
  /**
   * Lo que solo tiene sentido para un evento concreto (#285).
   *
   * Hoy solo lo usan los de medios, para decir **qué URL** se subió o dejó de existir. Va aparte
   * y no como un campo suelto del sobre porque el resto de eventos no lo tienen, y un campo que
   * a veces está y a veces no, al mismo nivel que `id` o `ts`, invita a leerlo sin comprobar.
   */
  readonly datos?: Readonly<Record<string, string>>;
}

export interface ConfiguracionDelAviso {
  readonly url: string;
  readonly secreto: string;
}

/** Lo que se sabe de un intento de entrega, y es lo que acaba en la auditoría. */
export interface ResultadoDeEntrega {
  readonly ok: boolean;
  readonly intentos: number;
  /** El código HTTP, cuando hubo respuesta. Ausente si no se llegó a hablar con nadie. */
  readonly estado?: number;
  readonly motivo?: 'red' | 'estado' | 'redirigido';
}

/** SPEC §7.3 usa el mismo suelo para `APP_SECRET`, y por el mismo motivo. */
const LARGO_MINIMO_DEL_SECRETO = 32;

/** Por intento. Dos segundos: si la web de destino tarda más, el reintento tampoco la va a salvar. */
const PLAZO_MS = 2000;

/**
 * Ya se dijo por consola que la configuración está a medias.
 *
 * Sin esto, un despliegue con la `WEBHOOK_URL` mal escrita escribe la misma línea en cada
 * publicación, y un aviso que se repite mil veces se lee como ruido y deja de mirarse. Se dice
 * una vez por proceso, que es cuando alguien lo puede leer y hacer algo.
 */
let yaSeDijoQueEstaMal = false;

/** Para los tests: el aviso de configuración se dice una vez por proceso, y un test no es un proceso. */
export function reiniciarAvisoParaTests(): void {
  yaSeDijoQueEstaMal = false;
}

function quejarseUnaVez(motivo: string): void {
  if (yaSeDijoQueEstaMal) return;

  yaSeDijoQueEstaMal = true;
  console.error(
    `[aviso] la fase queda apagada: ${motivo}. Ninguna publicación avisará a la web de destino.`
  );
}

/**
 * Si la dirección puede recibir el sobre.
 *
 * **`https`, salvo bucle local.** El sobre lleva qué secciones tiene la web y cuándo se tocan;
 * por `http` eso viaja legible para cualquiera en el camino. El bucle local se exceptúa porque
 * es el caso de probarlo con `examples/web-remota` en la máquina de uno, y porque no sale a la
 * red — el mismo criterio por el que un navegador trata `http://localhost` como contexto seguro.
 *
 * `hostname` viene de `URL`, ya normalizado: no es una comparación de cadenas sobre lo que
 * alguien escribió, así que `https://malo.io/#localhost` no se cuela por aquí.
 */
function direccionAceptable(url: URL): boolean {
  if (url.protocol === 'https:') return true;

  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

/**
 * La configuración, o `null` si la fase está apagada.
 *
 * **Las dos variables o ninguna.** Media configuración funcionando y la otra media callada es
 * peor que nada: es el mismo criterio con el que la lista de `PREVIEW_ORIGINS` se descarta entera
 * si una entrada está mal (spec 08 §4.1). Con una sola variable puesta se apaga **y se dice**,
 * porque quien la puso creía estar encendiendo algo.
 */
export function configuracionDelAviso(): ConfiguracionDelAviso | null {
  const url = process.env['WEBHOOK_URL'];
  const secreto = process.env['WEBHOOK_SECRET'];

  const hayUrl = url !== undefined && url !== '';
  const haySecreto = secreto !== undefined && secreto !== '';

  // Ninguna de las dos es el caso normal: la inmensa mayoría de despliegues no usa esto. No se
  // queja, porque no hay nada que arreglar.
  if (!hayUrl && !haySecreto) return null;

  if (!hayUrl || !haySecreto) {
    quejarseUnaVez('hace falta WEBHOOK_URL y WEBHOOK_SECRET, y solo hay una de las dos');
    return null;
  }

  if (secreto.length < LARGO_MINIMO_DEL_SECRETO) {
    // Sin decir cuánto mide el que hay. Es un secreto: su longitud es información sobre él.
    quejarseUnaVez(`WEBHOOK_SECRET necesita ${LARGO_MINIMO_DEL_SECRETO} caracteres o más`);
    return null;
  }

  let analizada: URL;
  try {
    analizada = new URL(url);
  } catch {
    quejarseUnaVez('WEBHOOK_URL no es una dirección absoluta');
    return null;
  }

  if (!direccionAceptable(analizada)) {
    quejarseUnaVez('WEBHOOK_URL tiene que ser https, salvo en el bucle local');
    return null;
  }

  return { url: analizada.toString(), secreto };
}

/**
 * Si `/api/content/:key` contestaría a esa clave.
 *
 * Es **la misma pregunta que hace la ruta**, y por eso se hace igual: sobre `cms.config.ts` y
 * con `Object.hasOwn`, no con `in` —que subiría por la cadena de prototipos y diría que sí a
 * `constructor`—.
 */
function estaDeclarada(key: string): boolean {
  return Object.hasOwn(appConfig.singletons, key) || Object.hasOwn(appConfig.collections, key);
}

/**
 * De lo que se tocó a **lo que hay que volver a pedir**, que no es lo mismo.
 *
 * ## El fallo de #116, en su versión hacia fuera
 *
 * Un elemento de colección se publica solo, con la clave `coleccion.id`. Pero la web no puede
 * pedir `/api/content/testimonials.a1b2`: esa clave no está declarada en `cms.config.ts` y la
 * ruta responde 404. Lo único que puede pedir es la colección entera.
 *
 * Así que mandar el tag del elemento sería mandar algo **inservible**: quien lo recibiera
 * revalidaría una dirección que no existe y su lista seguiría enseñando el texto viejo, sin un
 * solo error por medio. Es literalmente lo que pasaba dentro de casa antes de #116, y se
 * resuelve donde se resolvió aquello — al componer, no en quien lo recibe.
 *
 * Por eso `tags` no es `claves` traducida una a una: es **la lista de lo que se puede pedir**,
 * elevada al nivel de la colección y sin repetidos.
 *
 * ## Y por eso se filtra por `cms.config.ts`
 *
 * Una fila puede tener un `type` que la configuración ya no declara: es el caso de ADR-404 —se
 * quita una sección del código y sus filas siguen en la base de datos—. Su tag saldría hacia
 * fuera igual, y la web pediría una clave a la que `/api/content/:key` responde 404. Se filtra
 * por la misma pregunta que hace esa ruta, para que no puedan discrepar.
 */
export function tagsDe(evento: EventoDeAviso, claves: readonly ClaveAvisada[]): string[] {
  if (evento === 'settings.updated') return [SETTINGS_TAG];

  // Los medios van sin tags a propósito: subir una imagen no cambia ni una respuesta de la API
  // pública —nada la referencia hasta que alguien la use y publique, y eso ya manda
  // `content.published`—. Ver spec 16 §5.6 e issue #285.
  if (evento === 'media.uploaded' || evento === 'media.deleted') return [];

  const tags = new Set<string>();

  for (const clave of claves) {
    // Sin `coleccion` no hay nada que la web pueda pedir, así que se descarta en vez de
    // inventar un tag a partir de la clave. Un tag mal formado es peor que uno ausente: el
    // ausente se nota, el mal formado revalida algo que no es.
    const pedible = clave.tipo === 'item' ? clave.coleccion : clave.key;

    if (pedible !== undefined && estaDeclarada(pedible)) tags.add(contentTag(pedible));
  }

  return [...tags];
}

/**
 * El sobre, ya listo para firmar.
 *
 * `ahora` se puede sustituir para probar esto sin depender del reloj de la máquina. No es una
 * concesión al test: es lo que permite comprobar que el `ts` que se firma es el que viaja.
 */
export function componerSobre(
  evento: EventoDeAviso,
  claves: readonly ClaveAvisada[],
  ahora: () => number = Date.now,
  datos?: Readonly<Record<string, string>>
): Sobre {
  return {
    id: randomUUID(),
    evento,
    ts: ahora(),
    claves,
    tags: tagsDe(evento, claves),
    ...(datos === undefined ? {} : { datos }),
  };
}

/**
 * `HMAC-SHA256(secreto, "<ts>.<cuerpo>")`, en hexadecimal.
 *
 * ## Por qué el `ts` va dentro de lo firmado
 *
 * Para que quien recibe pueda rechazar un aviso reproducido. Si el `ts` viajara solo en la
 * cabecera, se podría reenviar un aviso capturado cambiándole la fecha y la firma seguiría
 * cuadrando: la ventana anti-replay del receptor no protegería de nada.
 *
 * ## Y por qué el secreto es propio y no `APP_SECRET` (ADR-1001)
 *
 * Porque este secreto **sale de casa por diseño**: la web de destino lo necesita para verificar.
 * `APP_SECRET` firma los tokens de vista previa, los de bootstrap y los de reinicio de contraseña
 * (`cms/security/tokens.ts`). Dárselo a un tercero para que compruebe avisos le regalaría, de
 * paso, la capacidad de fabricarse un token de setup y crear el primer administrador.
 */
export function firmar(secreto: string, ts: number, cuerpo: string): string {
  return `sha256=${createHmac('sha256', secreto).update(`${ts}.${cuerpo}`).digest('hex')}`;
}

/** Si el fallo puede pasarse solo. Un 4xx no: su configuración está mal y repetir no la arregla. */
function mereceReintento(estado: number): boolean {
  return estado >= 500;
}

/**
 * Manda el sobre. Un intento, y un reintento solo si el fallo puede ser transitorio.
 *
 * `buscar` se puede sustituir para probar esto sin red, igual que en `examples/web-remota`.
 *
 * ## `redirect: 'manual'`, y esto es seguridad y no una manía
 *
 * `fetch` sigue las redirecciones por omisión, y una redirección en un `POST` firmado mandaría
 * la cabecera `X-UnoCMS-Firma` **y el cuerpo entero** al destino nuevo, que puede ser de
 * cualquiera. Quien controle un redirector abierto en el dominio configurado se lleva un sobre
 * firmado válido. Así que un 3xx se trata como fallo, y sin reintento: la dirección está mal
 * puesta y repetirla lleva al mismo sitio.
 */
export async function entregar(
  config: ConfiguracionDelAviso,
  sobre: Sobre,
  buscar: typeof fetch = fetch
): Promise<ResultadoDeEntrega> {
  // Se serializa **una vez** y se manda ese mismo string. Volver a serializar para firmar
  // abriría la puerta a que lo firmado y lo enviado difieran en un byte, y entonces la firma
  // sería válida para algo que nadie mandó.
  const cuerpo = JSON.stringify(sobre);
  const firma = firmar(config.secreto, sobre.ts, cuerpo);

  // `evento` e `id` van **también** en cabecera, por comodidad de quien enruta o registra sin
  // analizar el cuerpo. Pero quedan **fuera de la firma**, que cubre `ts` y cuerpo: alterarlas
  // por el camino no invalida nada. `ts` sí está cubierto —va dentro de lo firmado— y por eso
  // la ventana anti-replay del receptor sí es de fiar.
  //
  // O sea que el receptor tiene que decidir con **los campos del cuerpo**, y usar estas dos
  // solo para mirar. Está dicho en `docs/DEVELOPER.md`, porque es la clase de detalle que se
  // hace mal justo cuando se implementa deprisa: descartar duplicados por el `id` de la
  // cabecera se puede forzar a que reprocese.
  const cabeceras = {
    'Content-Type': 'application/json',
    'User-Agent': 'UnoCMS/1 (aviso)',
    'X-UnoCMS-Evento': sobre.evento,
    'X-UnoCMS-Id': sobre.id,
    'X-UnoCMS-Ts': String(sobre.ts),
    'X-UnoCMS-Firma': firma,
  };

  let ultimo: ResultadoDeEntrega = { ok: false, intentos: 0, motivo: 'red' };

  // Dos vueltas como mucho: el intento y su reintento. El reintento manda **el mismo sobre**,
  // así que lleva el mismo `id` y quien lo reciba puede descartarlo en vez de revalidar dos veces.
  for (let intento = 1; intento <= 2; intento += 1) {
    try {
      const respuesta = await buscar(config.url, {
        method: 'POST',
        headers: cabeceras,
        body: cuerpo,
        redirect: 'manual',
        signal: AbortSignal.timeout(PLAZO_MS),
      });

      if (respuesta.ok) return { ok: true, intentos: intento, estado: respuesta.status };

      if (respuesta.status >= 300 && respuesta.status < 400) {
        return { ok: false, intentos: intento, estado: respuesta.status, motivo: 'redirigido' };
      }

      ultimo = { ok: false, intentos: intento, estado: respuesta.status, motivo: 'estado' };

      if (!mereceReintento(respuesta.status)) return ultimo;
    } catch {
      // No se mira **qué** excepción fue. Un timeout, un DNS que no resuelve y un certificado
      // que no valida son el mismo hecho desde aquí: no se pudo hablar con el destino. Y el
      // mensaje de la excepción puede traer la dirección completa, que acabaría en la auditoría.
      ultimo = { ok: false, intentos: intento, motivo: 'red' };
    }
  }

  return ultimo;
}

/**
 * Compone, manda y registra. Es lo único que llaman las actions.
 *
 * ## Por qué no devuelve nada, y por qué eso está bien
 *
 * Porque va dentro de `after()`: corre **después** de haberle respondido al editor. Publicar ya
 * está escrito y confirmado cuando esto empieza, así que no hay resultado que devolver ni a quién
 * devolvérselo. Que el aviso falle no puede convertir una publicación buena en un error (ADR-1003).
 *
 * El precio es que el fallo no lo ve nadie mirando la pantalla, y por eso **se audita siempre** y
 * por eso existe el issue #286: un `after()` que falla en silencio es un fallo silencioso, que es
 * justo lo que este repositorio persigue en todo lo demás.
 *
 * ## Con la fase apagada no se programa nada
 *
 * La comprobación va **antes** del `after`, no dentro. Así un despliegue sin esto configurado
 * —la inmensa mayoría— no arrastra una tarea diferida por cada publicación.
 */
export function avisar(
  evento: EventoDeAviso,
  claves: readonly ClaveAvisada[],
  actor?: { readonly userId: string; readonly email: string },
  datos?: Readonly<Record<string, string>>
): void {
  const config = configuracionDelAviso();
  if (config === null) return;

  const sobre = componerSobre(evento, claves, Date.now, datos);

  const tarea = async (): Promise<void> => {
    const resultado = await entregar(config, sobre);

    // Lo que se registra es **el sobre y el resultado**, nunca la firma ni el secreto. `audit`
    // redacta por su cuenta toda clave que contenga "secret" o "token", pero no se le pasan de
    // todas formas: fiar esto a un filtro es fiarlo a una lista que alguien puede acortar.
    //
    // Y va `tags` y no `claves` por un motivo que sorprende: `audit` redacta toda clave que
    // contenga "clave", así que un campo llamado `claves` llegaría a la tabla como
    // "[redactado]" — un registro que parece completo y no dice nada. `tags` es además lo
    // accionable: es lo que la web tenía que repedir.
    await audit({
      action: resultado.ok ? 'webhook.enviado' : 'webhook.fallido',
      ...(actor === undefined ? {} : { actorId: actor.userId, actorEmail: actor.email }),
      meta: {
        evento: sobre.evento,
        avisoId: sobre.id,
        tags: sobre.tags,
        intentos: resultado.intentos,
        ...(resultado.estado === undefined ? {} : { estado: resultado.estado }),
        ...(resultado.motivo === undefined ? {} : { motivo: resultado.motivo }),
      },
    });
  };

  // `after` **lanza** fuera del contexto de una petición: «`after` was called outside a request
  // scope». Está comprobado ejecutándolo, no deducido.
  //
  // Sin este `try`, ese throw sube por el handler de la action, `defineAction` lo captura y
  // devuelve `INTERNAL` — y el editor vería «algo ha fallado por nuestra parte» sobre una
  // publicación **que ya está escrita y confirmada**. Es exactamente la inversión que ADR-1003
  // prohíbe, colándose por la puerta de las excepciones en vez de por la del resultado.
  //
  // Hoy toda action corre dentro de una petición, así que esto no debería pasar nunca. «No
  // debería» es la palabra: el coste de equivocarse es un error falso en la cara de quien
  // publica, y el de protegerse son cuatro líneas.
  try {
    after(tarea);
  } catch (error) {
    console.error('[aviso] no se pudo programar el envío; la operación no se ve afectada', error);
  }
}

/** Lo que el panel enseña del último aviso (#286). `null` si la fase está apagada o no hay ninguno. */
export interface UltimoAviso {
  readonly ok: boolean;
  readonly cuando: Date;
  readonly evento: string;
  /** Solo cuando falló: `red`, `estado` o `redirigido`. Para saber a quién preguntar. */
  readonly motivo?: string;
  /** Solo cuando falló y hubo respuesta. */
  readonly estado?: number;
}

/**
 * El último aviso que se intentó, para el panel (#286).
 *
 * ## Por qué esta pantalla tiene que existir
 *
 * Porque el aviso se manda con `after()`, **después** de responderle al editor. Si falla, no lo
 * ve nadie mirando. Queda auditado, sí — y una fila de auditoría que solo se lee consultando la
 * base de datos a mano es, en la práctica, un fallo silencioso con papeleo.
 *
 * Alguien podría estar publicando durante semanas contra un destino caído, viendo «Publicado ✓»
 * cada vez.
 *
 * ## Por qué se lee de `audit_log` y no de una tabla propia
 *
 * Porque la auditoría ya guarda la acción, el instante y los metadatos, ya redacta lo sensible y
 * ya se poda a los 90 días. Una tabla nueva para «el último estado de una cosa» sería una segunda
 * fuente de verdad que se puede desincronizar de la primera.
 *
 * **El precio, dicho:** con la poda, un despliegue que no publique en tres meses pierde su último
 * aviso y vuelve a «todavía no se ha mandado ninguno». Eso es distinto de «falló», y el panel los
 * distingue.
 *
 * ## Y «el último» es el último **auditado**, que con dos publicaciones solapadas puede no ser el
 * último ocurrido
 *
 * Los avisos van en `after()` y no se esperan entre sí: uno que falla hace dos intentos y escribe
 * su fila **después** que uno posterior que fue a la primera. Así que dos publicaciones muy
 * seguidas pueden dejar el panel diciendo «falló» cuando la segunda sí llegó.
 *
 * Se descubrió escribiendo los tests de #286 —el caso pasaba o no según cuál terminara antes— y
 * se deja así a propósito: ordenar esto de verdad exige un número de secuencia y una tabla propia,
 * que es justo lo que se decidió no construir (ADR-1003). El error es transitorio y de un lado
 * seguro: dice «falló» de más, nunca «llegó» de más.
 *
 * ## Y por qué vive aquí y no en un módulo de lectura aparte
 *
 * Contra la costumbre de `portada.ts` y `publicaciones.ts`, que son lectores sueltos. Este
 * necesita `configuracionDelAviso()` para contestar `null` cuando la fase está apagada — que no
 * es «no hay datos», es «esto no existe en este despliegue»— y sacarlo de aquí obligaría a
 * exportar esa decisión o a duplicarla.
 */
export async function ultimoAviso(): Promise<UltimoAviso | null> {
  // Con la fase apagada no hay nada que enseñar, y **no se consulta la base de datos**. Un
  // despliegue que no usa esto no debe pagar una consulta por cada vez que se abre el panel.
  if (configuracionDelAviso() === null) return null;

  const [fila] = await getDb()
    .select({ action: auditLog.action, meta: auditLog.meta, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(inArray(auditLog.action, ['webhook.enviado', 'webhook.fallido']))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  if (fila === undefined) return null;

  // El `meta` lo escribimos nosotros, pero se lee con cuidado igual: es una columna `jsonb` y
  // una fila vieja puede venir de una versión que guardaba otra cosa. Un panel que reviente al
  // pintar el estado de un aviso sería peor que el aviso que no llegó.
  const meta = (fila.meta ?? {}) as Record<string, unknown>;

  return {
    ok: fila.action === 'webhook.enviado',
    cuando: fila.createdAt,
    evento: typeof meta['evento'] === 'string' ? meta['evento'] : 'desconocido',
    ...(typeof meta['motivo'] === 'string' ? { motivo: meta['motivo'] } : {}),
    ...(typeof meta['estado'] === 'number' ? { estado: meta['estado'] } : {}),
  };
}
