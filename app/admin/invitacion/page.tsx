import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { checkInvitation, redeemInvitation, type DatosDeInvitacion } from '@/cms/auth/invitations';
import { EnvoltorioDeTema } from '@/app/envoltorio-de-tema';
import { AVISO_ALARMA, BOTON_PRINCIPAL, CAMPO, TITULO } from '@/cms/ui/estilos';

/**
 * Canje de la invitación (SPEC §5.3, §10.2; issue #95).
 *
 * ## Por qué esta ruta es pública estando bajo `/admin`
 *
 * Quien llega aquí no tiene cuenta utilizable todavía: `inviteUser` le puso una contraseña
 * aleatoria que no conoce nadie. Si el guard la protegiera, la invitación no se podría canjear
 * nunca — el mismo caso que la pantalla de acceso.
 *
 * Vive bajo `/admin` y **no** dentro del grupo `(panel)`, y está declarada en la lista de rutas
 * públicas del test de guards (#70) con su motivo escrito. Que haya que escribirlo es lo que
 * hace que nadie pueda sacar una pantalla del guard sin dejar constancia.
 *
 * ## Lo que se dice y lo que no
 *
 * Un enlace inválido, caducado, ya usado o de una cuenta desactivada dan **404**, todos igual.
 * Distinguir "caducado" de "no existe" confirmaría que ese enlace fue real, que es lo único que
 * le falta a quien haya encontrado uno viejo en un historial ajeno.
 */

/**
 * El enlace lleva una credencial en la dirección, así que la dirección no debe salir de aquí.
 *
 * `no-referrer` impide que viaje en la cabecera `Referer` de cualquier petición que salga de
 * esta página. Hoy no sale ninguna, porque no hay nada externo; es una protección contra lo que
 * se añada mañana, que es cuando estas cosas se filtran.
 */
export const metadata = { referrer: 'no-referrer' as const };

export const dynamic = 'force-dynamic';

export default async function PantallaDeInvitacion({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; error?: string }>;
}) {
  const params = await searchParams;
  const codigo = params.c ?? '';

  let invitacion: DatosDeInvitacion | null;
  try {
    invitacion = await checkInvitation(codigo);
  } catch {
    // `checkInvitation` lanza si `APP_SECRET` falta o es corto: eso es un despliegue mal
    // configurado, no un enlace inválido. Desde una ruta pública se responde 404 igualmente,
    // porque un 500 con traza confirma que la ruta existe y que algo interno se ha roto
    // (spec de M2, §3.2).
    invitacion = null;
  }

  if (invitacion === null) notFound();

  async function establecer(formData: FormData) {
    'use server';

    const password = String(formData.get('password') ?? '');
    const repetida = String(formData.get('repetida') ?? '');
    const enlace = `/admin/invitacion?c=${encodeURIComponent(codigo)}`;

    // La regla de lint ve una comparación de contraseñas y avisa de un canal por tiempo. Aquí
    // no lo hay: los dos valores los acaba de escribir la misma persona en la misma pantalla, y
    // no hay ningún secreto del servidor en la comparación. Lo que se compara no es "lo que has
    // escrito" contra "lo que vale", sino dos cosas que ya conoce quien las mandó.
    //
    // Y se comprueba en el servidor, no solo en el navegador, para que la página siga
    // funcionando sin JavaScript. Que sea un formulario de toda la vida es a propósito.
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== repetida) redirect(`${enlace}&error=repetida`);

    const cabeceras = await headers();
    const reenviada = cabeceras.get('x-forwarded-for');

    const resultado = await redeemInvitation({
      token: codigo,
      password,
      ...(reenviada === null ? {} : { ip: reenviada.split(',')[0]?.trim() }),
    });

    if (resultado.ok) redirect('/admin/login?lista=1');

    // El motivo va en la dirección y el texto no: los mensajes viven en esta página, y meterlos
    // en la barra del navegador dejaría que cualquiera pusiera ahí el texto que quisiera.
    redirect(`${enlace}&error=${resultado.reason}`);
  }

  return (
    <EnvoltorioDeTema>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div>
          <h1 className={TITULO}>Te damos la bienvenida</h1>
          <p className="mt-2 text-tinta-suave">
            Hola, {invitacion.name}. Elige una contraseña para tu cuenta ({invitacion.email}) y ya
            podrás entrar a administrar la web.
          </p>
        </div>

        {params.error !== undefined && <Aviso motivo={params.error} />}

        <form action={establecer} className="flex flex-col gap-4">
          {/* La ayuda va fuera del `label`: dentro, su texto se sumaría al nombre accesible del
            campo en vez de quedarse como descripción. */}
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-tinta">Tu contraseña</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="new-password"
                aria-describedby="ayuda"
                className={CAMPO}
              />
            </label>
            <span id="ayuda" className="text-sm text-tinta-tenue">
              Al menos 12 caracteres. Una frase que recuerdes vale más que algo corto y raro.
            </span>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-tinta">Repítela</span>
            <input
              name="repetida"
              type="password"
              required
              autoComplete="new-password"
              className={CAMPO}
            />
          </label>

          <button type="submit" className={BOTON_PRINCIPAL}>
            Guardar y entrar
          </button>
        </form>
      </main>
    </EnvoltorioDeTema>
  );
}

/** Los motivos, en texto. Uno solo para todo lo que no sea la contraseña. */
function Aviso({ motivo }: { motivo: string }) {
  const texto =
    motivo === 'repetida'
      ? 'Las dos contraseñas no coinciden.'
      : motivo === 'password'
        ? 'Esa contraseña no vale: necesita al menos 12 caracteres y no puede ser una de las más usadas.'
        : 'Este enlace ya no sirve. Pídele a quien te invitó que te mande uno nuevo.';

  return (
    <p role="alert" className={AVISO_ALARMA}>
      {texto}
    </p>
  );
}
