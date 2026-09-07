import { redirect } from 'next/navigation';
import { ACCESO_CON_GOOGLE_DISPONIBLE, auth, signIn } from '@/cms/auth';
import { EnvoltorioDeTema } from '@/app/envoltorio-de-tema';
import { AccesoConGoogle } from '@/cms/ui/AccesoConGoogle';
import { Icono } from '@/cms/ui/iconos';
import { Logotipo } from '@/cms/ui/Logotipo';
import { AVISO_ALARMA, AVISO_PUBLICADO, BOTON_PRINCIPAL, CAMPO } from '@/cms/ui/estilos';

/**
 * Qué se lee cuando el acceso falla.
 *
 * ## Por qué son tres mensajes y no uno, ni dos
 *
 * - **`CredentialsSignin`** es el mensaje único de SPEC §7.1, que no distingue entre correo
 *   inexistente, contraseña incorrecta y cuenta bloqueada. No se toca: es lo que cierra la
 *   enumeración de cuentas.
 * - **`AccessDenied`** es el rechazo de Google, y sí dice lo que pasa (ADR-902): para llegar
 *   aquí hay que haberse autenticado antes **en Google**, así que el único correo que se puede
 *   poner a prueba es uno del que ya se tienen las llaves.
 * - **Todo lo demás** salió de la autorrevisión de #233 y es un arreglo, no una rama de adorno.
 *   Al apuntar `pages.error` a esta pantalla empezaron a caer aquí errores que no son de
 *   credenciales —`Configuration`, que es lo que sale si falta `AUTH_SECRET` o si el secreto de
 *   Google está mal copiado— y todos leían «revisa el correo y la contraseña». Quien lo viera
 *   iba a revisar su contraseña, a cambiarla, y el problema estaría en una variable de entorno.
 *
 * Ese tercer mensaje **no dice qué falló**, a propósito: quien lo lee no puede arreglarlo y
 * nombrar la pieza rota solo sirve a quien esté tanteando.
 */
function mensajeDeError(error: string): string {
  if (error === 'AccessDenied') {
    return 'Esa cuenta de Google no puede entrar aquí. Pide a quien administra el sitio que te invite con ese mismo correo.';
  }

  if (error === 'CredentialsSignin') return 'Revisa el correo y la contraseña.';

  return 'No se ha podido entrar. Vuelve a intentarlo, y si sigue pasando avísale a quien administra el sitio.';
}

/**
 * Página de acceso (SPEC §3).
 *
 * Aquí sigue estando el mensaje único de SPEC §7.1 —"revisa el correo y la contraseña"— que no
 * distingue entre correo inexistente, contraseña incorrecta y cuenta bloqueada. **Eso no se
 * toca**: es lo que cierra la enumeración de cuentas, y es una decisión de seguridad, no de
 * redacción.
 *
 * ## El segundo mensaje, que sí distingue (#233)
 *
 * El rechazo de Google dice lo que pasa: "esa cuenta no puede entrar aquí". Parece una grieta en
 * lo de arriba y no lo es, y el motivo está en ADR-902: para llegar a ese mensaje hay que
 * haberse autenticado **en Google** primero, así que el único correo que se puede poner a prueba
 * es uno del que ya se tienen las llaves. La regla del mensaje único protege al formulario de
 * contraseña, que acepta el correo de cualquiera; esta otra puerta no.
 *
 * O sea que son mensajes distintos con razones distintas, y el caso T-233-17 amarra dos de ellos
 * para que a nadie le dé por unificarlos por limpieza. El tercero —el de cualquier otro error—
 * salió de la autorrevisión y está explicado en `mensajeDeError`, aquí arriba.
 *
 * ## Lo que sí cambió (#224)
 *
 * Esta pantalla llevaba desde M2 un comentario que decía "lo mínimo para que el flujo funcione,
 * **sin diseño**: el panel es M4". M4 se cerró hace cinco hitos y la frase se quedó, que es
 * exactamente la forma en que un comentario se convierte en mentira: describía un plan, no el
 * código, y el plan caducó sin que nadie volviera a leerlo.
 *
 * Es además la primera pantalla que ve quien llega, y la única que ve quien no consigue entrar.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; lista?: string; cambiada?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session !== null) redirect(params.next ?? '/admin');

  /**
   * A dónde se vuelve tras entrar, **siempre** una ruta de este sitio.
   *
   * Se rechaza cualquier destino que no empiece por `/`, y también `//host`, que es una URL
   * externa disfrazada de ruta. Sin esto, el `?next=` del enlace decide a dónde va quien acaba
   * de teclear su contraseña, que es una redirección abierta con credenciales de por medio.
   *
   * Estaba escrito dentro de la acción de credenciales y sale aquí porque ahora hay **dos**
   * caminos de entrada. Duplicar la comprobación era dejar que un día una de las dos copias se
   * quedara sin ella.
   */
  const destino =
    typeof params.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : '/admin';

  async function iniciarSesion(formData: FormData) {
    'use server';

    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: destino,
    });
  }

  async function entrarConGoogle() {
    'use server';

    // Esto no devuelve: `signIn` de un proveedor de OAuth lanza la redirección a Google. Lo que
    // vuelve por `/api/auth/callback/google` decide si hay sesión o si se acaba en esta misma
    // pantalla con `?error=AccessDenied` (ADR-902).
    await signIn('google', { redirectTo: destino });
  }

  return (
    <EnvoltorioDeTema>
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-12">
        {/* La lámina de vidrio está aquí y no alrededor de toda la pantalla: es lo único que
            flota, así que es donde va la mirada. Con el halo detrás, este recuadro es lo que
            da la primera impresión de qué clase de herramienta es esto. */}
        <div className="lamina-tarjeta rounded-3xl p-7">
          <div className="flex items-center gap-2.5">
            <Logotipo tamano={26} className="text-acento" />
            <span className="font-semibold text-tinta">Tu sitio</span>
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-tinta">Entrar</h1>

          {/* Quien llega aquí desde poner su contraseña —por invitación o por cambiarla— no viene a
              "entrar": viene de terminar algo. Sin este aviso se encuentra un formulario mudo y no
              sabe si lo suyo se guardó. Es el mismo motivo por el que cambiar la contraseña avisa
              antes de cerrar la sesión. */}
          {params.lista !== undefined && (
            <p className={`${AVISO_PUBLICADO} mt-5`}>
              <Icono de="publicado" tamano={16} className="mt-0.5" />
              Tu contraseña ya está puesta. Entra con ella y tu correo.
            </p>
          )}

          {params.cambiada !== undefined && (
            <p className={`${AVISO_PUBLICADO} mt-5`}>
              <Icono de="publicado" tamano={16} className="mt-0.5" />
              Contraseña cambiada. Se han cerrado todas las sesiones, así que entra otra vez con la
              nueva.
            </p>
          )}

          <form action={iniciarSesion} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-tinta-suave">Correo</span>
              <input name="email" type="email" required autoComplete="username" className={CAMPO} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-tinta-suave">Contraseña</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className={CAMPO}
              />
            </label>

            <button type="submit" className={`${BOTON_PRINCIPAL} mt-1 w-full`}>
              Entrar
            </button>
          </form>

          <AccesoConGoogle disponible={ACCESO_CON_GOOGLE_DISPONIBLE} entrar={entrarConGoogle} />

          {/* `role="alert"` y no un párrafo cualquiera: quien falla al entrar puede estar
              usando un lector de pantalla, y este mensaje aparece **después** de enviar. Sin
              anunciarlo, el formulario se recarga en silencio y parece que no ha pasado nada. */}
          {params.error !== undefined && (
            <p role="alert" className={`${AVISO_ALARMA} mt-5`}>
              <Icono de="alerta" tamano={16} className="mt-0.5" />
              {mensajeDeError(params.error)}
            </p>
          )}
        </div>
      </main>
    </EnvoltorioDeTema>
  );
}
