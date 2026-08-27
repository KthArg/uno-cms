/**
 * La página, en HTML a secas (issue #195).
 *
 * Sin framework y sin dependencias a propósito: lo que este ejemplo demuestra es que el contrato
 * de `docs/DEVELOPER.md` no necesita nada. Cuanto menos se parezca al CMS, mejor prueba es.
 */

/**
 * Escapa lo que va a acabar dentro del HTML.
 *
 * **Esto no es cortesía, y es la parte de este fichero que hay que leer.** El contenido lo
 * escribe quien edita en el panel, así que en una landing normal no es hostil — pero un ejemplo
 * se copia entero, y quien lo copie lo pegará en una web donde puede que sí lo sea. Un ejemplo
 * que enseña a concatenar HTML sin escapar reparte una inyección a cada persona que lo lea.
 *
 * Se escapan también `'` y `"`, que hacen falta en cuanto un valor va dentro de un atributo — y
 * aquí va: el enlace del botón.
 */
export function escapar(valor) {
  return String(valor ?? '').replace(
    /[&<>"']/g,
    (caracter) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caracter]
  );
}

/**
 * Mete un valor dentro de una etiqueta `<script>` sin que se pueda salir de ella.
 *
 * **`JSON.stringify` no basta, y este es el fallo que casi publico.** Escapa comillas y saltos de
 * línea, que es lo que hace falta para que el JSON sea válido — pero no toca `<`, y el navegador
 * cierra la etiqueta al ver la de cierre **antes** de que ningún analizador de JavaScript mire el
 * contenido. Un título que lleve dentro un cierre de `script` se sale del bloque, y lo que siga
 * se ejecuta.
 *
 * Lo cazó el caso T-194-4 al escribirlo, no releyendo el fichero. Y aquí importa el doble: un
 * ejemplo se copia entero, así que el fallo se habría repartido a quien lo leyera con la
 * confianza de venir del propio proyecto.
 *
 * Van también U+2028 y U+2029, los separadores de línea: JSON los deja pasar tal cual y hay
 * motores que no los aceptan dentro de un literal de cadena.
 *
 * ## Escribir bien esto cuesta más de lo que parece, y de dos formas distintas
 *
 * **Una:** la secuencia de salida se compone con `charCodeAt` en vez de escribirse. Escribirla es
 * fácil de hacer mal — `'<'` en un literal de cadena **es** el carácter `<`, así que sustituirlo
 * por sí mismo no hace nada, y lo que se lee es idéntico a la versión correcta. Escribí esa
 * versión y solo se vio al ejecutarla.
 *
 * **Y dos:** el conjunto de caracteres se construye con `new RegExp` y no con un literal. U+2028
 * es un salto de línea para JavaScript: puesto de verdad dentro de `/[...]/` parte la expresión
 * en dos y el fichero deja de compilar. También me pasó, escribiendo justo esta función.
 */
const PELIGROSOS_EN_SCRIPT = new RegExp('[<>\u2028\u2029]', 'g');

export function jsonParaScript(valor) {
  return JSON.stringify(valor).replace(
    PELIGROSOS_EN_SCRIPT,
    (caracter) => '\\u' + caracter.charCodeAt(0).toString(16).padStart(4, '0')
  );
}

/**
 * Saca el texto de un richtext de Tiptap.
 *
 * El CMS entrega el richtext como el documento de ProseMirror, no como HTML — es ADR-107, y es lo
 * que impide que por ahí entre markup. Esta función se queda con el texto, que es lo que este
 * ejemplo necesita; una web de verdad recorrería los nodos y decidiría cómo pintar cada uno.
 */
export function texto(nodo) {
  if (nodo === null || nodo === undefined) return '';
  if (typeof nodo === 'string') return nodo;
  if (typeof nodo.text === 'string') return nodo.text;
  if (Array.isArray(nodo.content)) return nodo.content.map(texto).join(' ');

  return '';
}

/**
 * El arranque de la vista previa.
 *
 * **Es literalmente el fragmento de `docs/DEVELOPER.md`.** Si aquí hiciera falta una línea más
 * que allí no esté, el documento estaría incompleto — y hay un test que compara los dos, porque
 * la forma en que una documentación se vuelve falsa es que el código evolucione sin ella.
 *
 * Lo que **no** hay aquí, y es igual de importante: ninguna llamada a la ruta de contenido
 * publicado. Eso ya viene puesto desde el servidor, porque esa ruta no manda CORS.
 */
function arranqueDeVistaPrevia(cmsUrl) {
  return `
    if (new URLSearchParams(location.search).has('unocms_preview')) {
      const { conectar } = await import('${cmsUrl}/preview-cliente.js');

      conectar(
        (contenido) => {
          ultimo = contenido;
          pintar(contenido);
          avisar('vista previa en vivo · ' + new Date().toLocaleTimeString());
        },
        {
          alFallar: (motivo) => {
            avisar('vista previa no disponible: ' + motivo);
          },
        }
      );
    }`;
}

/** La página entera, con el contenido publicado ya dentro. */
export function paginaHtml(contenido, cmsUrl) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(contenido.seo?.title ?? 'Mi web')}</title>
<meta name="description" content="${escapar(contenido.seo?.description ?? '')}">
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0; line-height: 1.6; }
  header { background: #0f172a; color: #fff; padding: 5rem 1.5rem; }
  header h1 { font-size: clamp(2rem, 6vw, 3.5rem); margin: 0 0 .5rem; max-width: 20ch; }
  header p { margin: 0 0 1.5rem; opacity: .85; font-size: 1.15rem; max-width: 50ch; }
  a.cta { display: inline-block; background: #38bdf8; color: #0f172a; padding: .7rem 1.4rem;
          border-radius: .4rem; font-weight: 600; text-decoration: none; }
  section { padding: 3rem 1.5rem; border-bottom: 1px solid #94a3b833; }
  section h2 { margin-top: 0; }
  .tarjeta { border: 1px solid #94a3b855; border-radius: .5rem; padding: 1rem;
             margin-bottom: .75rem; max-width: 60ch; }
  .aviso { position: fixed; inset: auto 1rem 1rem auto; background: #fef3c7; color: #78350f;
           padding: .6rem 1rem; border-radius: .4rem; font-size: .85rem; }
</style>
</head>
<body>
  <div id="raiz"></div>
  <div id="estado" aria-live="polite"></div>

  <script type="module">
    // Lo publicado llega del servidor de esta web, ya dentro del HTML. No se pide desde el
    // navegador: la ruta pública del CMS no manda cabeceras CORS y no se podría leer.
    let ultimo = ${jsonParaScript(contenido)};

    const raiz = document.getElementById('raiz');
    const estado = document.getElementById('estado');

    const escapar = (valor) =>
      String(valor ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      );

    const texto = (nodo) => {
      if (!nodo) return '';
      if (typeof nodo === 'string') return nodo;
      if (typeof nodo.text === 'string') return nodo.text;
      if (Array.isArray(nodo.content)) return nodo.content.map(texto).join(' ');
      return '';
    };

    const avisar = (mensaje) => {
      estado.innerHTML = '<div class="aviso">' + escapar(mensaje) + '</div>';
    };

    function pintar(contenido) {
      const hero = contenido.hero ?? {};
      const about = contenido.about ?? {};
      const testimonios = contenido.testimonials ?? [];
      const faqs = contenido.faqs ?? [];

      // \`data-cms-key\` en cada sección: es lo que el CMS busca para desplazarse a la que se
      // está editando (SPEC §6.1 paso 5). Sin él la vista previa funciona igual, pero quien
      // edita tiene que buscar a mano lo que acaba de escribir.
      raiz.innerHTML = [
        '<header data-cms-key="hero">',
        '<h1>' + escapar(hero.title) + '</h1>',
        '<p>' + escapar(hero.subtitle) + '</p>',
        hero.ctaLabel
          ? '<a class="cta" href="' + escapar(hero.ctaHref ?? '#') + '">' +
            escapar(hero.ctaLabel) + '</a>'
          : '',
        '</header>',

        about.visible === false
          ? ''
          : [
              '<section data-cms-key="about">',
              '<h2>' + escapar(about.heading) + '</h2>',
              '<p>' + escapar(texto(about.body)) + '</p>',
              '</section>',
            ].join(''),

        '<section data-cms-key="testimonials"><h2>Testimonios</h2>',
        testimonios.length === 0
          ? '<p>Todavía no hay.</p>'
          : testimonios
              .map(
                (t) =>
                  '<div class="tarjeta"><strong>' + escapar(t.author) + '</strong><p>' +
                  escapar(t.quote) + '</p></div>'
              )
              .join(''),
        '</section>',

        '<section data-cms-key="faqs"><h2>Preguntas frecuentes</h2>',
        faqs.length === 0
          ? '<p>Todavía no hay.</p>'
          : faqs
              .map(
                (f) =>
                  '<div class="tarjeta"><strong>' + escapar(f.question) + '</strong><p>' +
                  escapar(texto(f.answer)) + '</p></div>'
              )
              .join(''),
        '</section>',
      ].join('');
    }

    pintar(ultimo);
${arranqueDeVistaPrevia(cmsUrl)}
  </script>
</body>
</html>`;
}
