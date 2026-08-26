// isomorphic-por-ubicación: `cms/preview/` es el único árbol de `cms/` que llega al cliente
// (ADR-106), así que no lleva `server-only` como el resto.

/**
 * El cliente que se carga **en la web de destino** (spec 08 §4.6, ADR-701).
 *
 * ## Por qué esto es una cadena de texto y no un módulo normal
 *
 * Porque no lo ejecutamos nosotros: lo ejecuta una web que no es nuestra, que puede estar hecha
 * con cualquier cosa y que no va a compilar nuestro TypeScript. Lo que sale por
 * `/preview-cliente.js` tiene que ser JavaScript que un navegador entienda tal cual.
 *
 * La alternativa —un fichero suelto en `public/`— parece más simple y no sirve: un `import()`
 * entre orígenes distintos se hace **en modo CORS**, y un fichero estático no lleva
 * `Access-Control-Allow-Origin`. Fallaría en la consola de otra persona, que es donde peor se
 * arregla. Sirviéndolo por una ruta se reutiliza la misma lista de orígenes que todo lo demás.
 *
 * ## Y por qué se prueba esta misma cadena, y no una copia
 *
 * Los tests importan **estos bytes** con una URL `data:`. No hay una segunda versión del cliente
 * escrita en TypeScript "para poder probarla": eso sería probar una cosa y desplegar otra, que
 * es la forma más cara de tener cobertura.
 *
 * ## Lo que el cliente NO hace, y es deliberado
 *
 * No repinta la web de nadie. Entrega el contenido y avisa cuando cambia; qué hacer con eso lo
 * decide esa web. Cualquier otra cosa sería adivinar su arquitectura — y una vista previa que
 * adivina mal es peor que no tenerla.
 */

/**
 * El origen del CMS no se escribe aquí ni se pide por configuración: sale de `import.meta.url`,
 * o sea de **dónde se descargó este módulo**.
 *
 * Es el único dato que no puede estar mal: si el navegador lo cargó de ahí, ahí está el CMS. Lo
 * contrario —pedirle a quien integra que escriba el origen otra vez— crea dos sitios que pueden
 * discrepar, y el día que discrepen el síntoma sería que los mensajes se descartan en silencio.
 *
 * `crearCliente` está exportada aparte para que los tests puedan darle un origen: importando
 * este módulo desde una URL `data:`, `import.meta.url` no tiene origen. Lo que queda sin cubrir
 * por eso es exactamente una línea —la de `conectar`—, y se dice en los tests.
 */
export const FUENTE_DEL_CLIENTE_REMOTO = `/**
 * Cliente de vista previa de UnoCMS.
 *
 * Se carga SOLO en vista previa, con el parámetro 'unocms_preview' en la dirección. Quien
 * visita la web en produccion no descarga nada de esto.
 */

var TIPO_CAMBIO = 'cms:update';
var TIPO_TOKEN = 'cms:token';
var TIPO_LISTO = 'cms:ready';

/**
 * Aplica un cambio sobre el contenido, devolviendo uno nuevo.
 *
 * Un elemento de coleccion se sustituye EN SU SITIO: la lista conserva el orden y el resto de
 * elementos como estaban. La posicion la calcula el servidor y llega en 'objetivo', porque la
 * lista que ve la web no lleva claves.
 */
function aplicar(contenido, objetivo, datos) {
  if (objetivo.coleccion !== undefined && objetivo.indice !== undefined) {
    var lista = contenido[objetivo.coleccion];
    if (!Array.isArray(lista)) return contenido;

    var siguiente = lista.slice();
    siguiente[objetivo.indice] = datos;

    var copia = Object.assign({}, contenido);
    copia[objetivo.coleccion] = siguiente;
    return copia;
  }

  var uno = Object.assign({}, contenido);
  uno[objetivo.key] = datos;
  return uno;
}

export function crearCliente(origenDelCms) {
  return function conectarCon(alCambiar, opciones) {
    var ajustes = opciones || {};
    var alFallar = typeof ajustes.alFallar === 'function' ? ajustes.alFallar : function () {};

    var token = new URLSearchParams(window.location.search).get('token');
    var contenido = null;
    var objetivo = null;
    var ultimoSeq = -1;
    var vivo = true;
    var promesa = Promise.resolve();
    // El ultimo cambio que llego mientras todavia se pedian los borradores. Ver 'procesar'.
    var enEspera = null;

    function pedirContenido() {
      if (token === null || token === '') {
        alFallar('sin-token');
        return Promise.resolve();
      }

      return fetch(origenDelCms + '/api/preview/contenido?token=' + encodeURIComponent(token), {
        // Sin cookies: lo que autoriza es el token, no una sesion. Mandarlas obligaria al
        // servidor a responder con credenciales y no hace falta ninguna.
        credentials: 'omit',
        cache: 'no-store',
      })
        .then(function (respuesta) {
          if (!respuesta.ok) {
            // La ruta responde 404 a todo lo que rechaza y no dice por que. Aqui tampoco se
            // adivina: quien integra recibe un motivo generico y mira sus variables.
            alFallar('sin-acceso');
            return null;
          }
          return respuesta.json();
        })
        .then(function (cuerpo) {
          if (!vivo || cuerpo === null) return;

          contenido = cuerpo.contenido;
          objetivo = cuerpo.objetivo;

          // Si mientras llegaba esto el panel mando un cambio, se aplica ahora en vez de
          // perderse. Ver 'procesar'.
          if (enEspera !== null && procesar(enEspera)) {
            enEspera = null;
            return;
          }

          enEspera = null;
          alCambiar(contenido);
        })
        .catch(function () {
          alFallar('sin-red');
        });
    }

    /**
     * Comprueba un cambio y lo aplica. Devuelve si cambio algo.
     *
     * Esta aparte porque se llama desde dos sitios: al recibir el mensaje y al terminar de
     * cargar los borradores, para el que llego antes de tiempo.
     */
    function procesar(datos) {
      if (objetivo === null || contenido === null) return false;
      if (typeof datos.key !== 'string' || datos.key !== objetivo.key) return false;
      if (typeof datos.data !== 'object' || datos.data === null) return false;
      // 'postMessage' no promete orden entre dos ventanas: sin esto, dos mensajes que se cruzan
      // dejan la vista previa enseñando lo que se escribio ANTES.
      if (typeof datos.seq !== 'number' || !(datos.seq > ultimoSeq)) return false;

      ultimoSeq = datos.seq;
      contenido = aplicar(contenido, objetivo, datos.data);
      alCambiar(contenido);
      return true;
    }

    function alRecibir(evento) {
      // 1. Quien habla. Un mensaje que no venga del CMS se descarta y no se contesta: responder
      //    —aunque fuera para rechazarlo— confirma que hay alguien escuchando aqui.
      if (evento.origin !== origenDelCms) return;

      var datos = evento.data;
      if (typeof datos !== 'object' || datos === null) return;

      // 2. Un relevo de token.
      //
      // Guardarlo y ya estaria si el cliente volviera a pedir algo, y no lo hace: pide una vez
      // al conectar. Escrito asi, el token nuevo no lo leia NADIE y toda la cadena de relevo
      // —el reloj del panel, el mensaje, esto— no cambiaba una sola respuesta.
      //
      // Lo que lo hace util es el reintento: si la primera peticion no trajo contenido, lo mas
      // probable es que el token de la direccion hubiera caducado —la pestaña del panel llevaba
      // rato abierta antes de que este iframe cargara—. Con el token nuevo se vuelve a pedir, y
      // la vista previa arranca en vez de quedarse muerta hasta que alguien recargue.
      if (datos.type === TIPO_TOKEN) {
        if (typeof datos.token !== 'string' || datos.token === '') return;

        token = datos.token;
        if (contenido === null) promesa = pedirContenido();
        return;
      }

      // 3. Un cambio en vivo.
      if (datos.type !== TIPO_CAMBIO) return;

      // Todavia no han llegado los borradores. El aviso de 'listo' sale ANTES de pedirlos —si
      // esperara, el panel no arrancaria su relevo y el reintento del token nuevo no ocurriria
      // nunca—, asi que hay una ventana de una peticion en la que puede llegar un cambio.
      //
      // Se guarda en vez de descartarlo: el panel manda los valores enteros en cada cambio, asi
      // que la siguiente tecla lo arreglaria... salvo que quien escribe pare justo ahi. Ese caso
      // deja la vista previa sin la ultima palabra escrita y sin decir nada.
      if (contenido === null) {
        enEspera = datos;
        return;
      }

      procesar(datos);
    }

    window.addEventListener('message', alRecibir);

    // El panel no manda nada hasta saber que hay alguien escuchando: si mandara el primer
    // cambio antes, se perderia y quien edita veria desaparecer su primera letra.
    //
    // Sin comprobar si hay padre, a proposito. Si esta pagina no esta dentro de un iframe,
    // 'window.parent' es ella misma y el navegador compara el origen de destino con el suyo:
    // como el del CMS es otro, el mensaje no se entrega a nadie. Una comprobacion aqui seria
    // una rama mas que ningun navegador recorre.
    window.parent.postMessage({ type: TIPO_LISTO }, origenDelCms);

    promesa = pedirContenido();

    return function desconectar() {
      vivo = false;
      window.removeEventListener('message', alRecibir);
      return promesa;
    };
  };
}

export function conectar(alCambiar, opciones) {
  return crearCliente(new URL(import.meta.url).origin)(alCambiar, opciones);
}
`;
