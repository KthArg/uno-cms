// isomorphic: solo presentación. Recibe la acción ya construida y decide si se pinta.
import { MarcaDeGoogle } from './MarcaDeGoogle';
import { BOTON_SUAVE } from './estilos';

/**
 * El botón de entrar con Google, en la pantalla de acceso (spec 13 §6).
 *
 * ## Por qué es un componente y no unas líneas dentro de la página
 *
 * Por los casos T-233-15 y T-233-16: hacen falta las dos ramas —con Google y sin él— y la página
 * de acceso es un componente de servidor asíncrono que lee la sesión y las variables de entorno.
 * Probar eso en jsdom obligaría a simular medio Auth.js, y lo que hay que comprobar es de una
 * línea: que sin Google no se pinta nada y con Google se pinta el botón **sin llevarse por
 * delante el formulario**.
 *
 * Así que la decisión llega como un booleano y la acción como una prop. Es también la razón por
 * la que aquí no se importa `cms/auth`: este fichero no sabe qué es OAuth, solo pinta.
 *
 * ## `BOTON_SUAVE` y no `BOTON_PRINCIPAL`
 *
 * La acción principal de esta pantalla sigue siendo el formulario de siempre (ADR-900: el acceso
 * por contraseña no se retira nunca). Dos botones sólidos compitiendo harían dudar de cuál es el
 * camino, y el que no depende de un tercero es el que tiene que ganar esa duda.
 */
export function AccesoConGoogle({
  disponible,
  entrar,
}: {
  readonly disponible: boolean;
  readonly entrar: () => void | Promise<void>;
}) {
  if (!disponible) return null;

  return (
    <>
      {/* Un separador con la palabra en medio, no una línea a secas: sin ella, el botón parece
          otra forma de enviar el formulario de arriba en vez de una alternativa a él. La línea
          es decorativa y por eso `aria-hidden`; quien usa un lector de pantalla oye los dos
          botones seguidos, que ya se distinguen por su texto. */}
      <div aria-hidden="true" className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-linea" />
        <span className="text-xs text-tinta-tenue">o</span>
        <span className="h-px flex-1 bg-linea" />
      </div>

      <form action={entrar} className="mt-6">
        <button type="submit" className={`${BOTON_SUAVE} w-full`}>
          <MarcaDeGoogle />
          Entrar con Google
        </button>
      </form>
    </>
  );
}
