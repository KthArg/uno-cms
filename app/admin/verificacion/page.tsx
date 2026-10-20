import { redirect } from 'next/navigation';
import { renderSVG } from 'uqr';
import { EnvoltorioDeTema } from '@/app/envoltorio-de-tema';
import { auth, signOut } from '@/cms/auth';
import { invalidateSessions } from '@/cms/auth/authenticate';
import { confirmarAlta, secretoPendiente } from '@/cms/auth/segundo-factor';
import { audit } from '@/cms/security/audit';
import { uriOtpauth } from '@/cms/segundo-factor';
import { AltaDelSegundoFactor } from '@/cms/ui/AltaDelSegundoFactor';
import { BOTON_PRINCIPAL } from '@/cms/ui/estilos';

/**
 * `/admin/verificacion` — dar de alta la verificación en dos pasos (spec 20 §3).
 *
 * ## Por qué fuera del grupo `(panel)`, con su propio guard
 *
 * Es la única página que admite una sesión **a medio entrar** (`mfa: 'alta'`), y el layout de
 * `(panel)` las rechaza todas: meterla dentro obligaría a hacerle una excepción al guard
 * autoritativo. Está declarada en `RUTA_DE_ALTA_DEL_SEGUNDO_FACTOR`, que es lo que le permite
 * vivir fuera del grupo sin que el test estructural de #70 salte.
 *
 * Su guard es este: sin sesión, al acceso; con la verificación ya hecha (`mfa: 'ok'`), al panel.
 * Y todo lo que hace va contra la fila de **la sesión**, nunca contra un usuario que venga del
 * formulario.
 */
export const dynamic = 'force-dynamic';

export default async function VerificacionPage() {
  const session = await auth();
  if (session === null) redirect('/admin/login');
  if (session.user.mfa === 'ok') redirect('/admin');

  const usuarioId = session.user.id;
  const correo = session.user.email;

  async function terminar(): Promise<void> {
    'use server';
    // Cierra todas las sesiones de la cuenta, esta incluida (T-V-15): la sesión `alta` no se
    // convierte en `ok` sola, se vuelve a entrar con código.
    await invalidateSessions(usuarioId);
    await signOut({ redirectTo: '/admin/login?verificada=1' });
  }

  const secreto = await secretoPendiente(usuarioId);

  // Ya la tiene activada —la confirmó en otra pestaña— y esta sesión sigue siendo `alta`: no hay
  // nada que dar de alta, y pisar el secreto dejaría inservible el de su móvil (T-V-13).
  if (secreto === null) {
    return (
      <EnvoltorioDeTema>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 py-12">
          <h1 className="text-2xl font-semibold tracking-tight text-tinta">
            Ya tienes la verificación en dos pasos
          </h1>
          <p className="text-tinta-suave">Vuelve a entrar con el código de tu app.</p>
          <form action={terminar}>
            <button type="submit" className={`${BOTON_PRINCIPAL} w-full`}>
              Volver a entrar
            </button>
          </form>
        </main>
      </EnvoltorioDeTema>
    );
  }

  async function confirmar(
    codigo: string
  ): Promise<{ ok: true; codigos: string[] } | { ok: false }> {
    'use server';
    const sesion = await auth();
    // Se vuelve a leer la sesión: una action es un endpoint, y no se fía de lo que el render
    // dejó en el cierre.
    if (sesion === null || sesion.user.id !== usuarioId || sesion.user.mfa === 'ok') {
      return { ok: false };
    }
    const codigos = await confirmarAlta(usuarioId, codigo);
    await audit({
      action: codigos === null ? 'user.segundoFactor.rechazado' : 'user.segundoFactor.activado',
      actorId: usuarioId,
      actorEmail: correo,
      targetType: 'user',
      targetId: usuarioId,
    });
    return codigos === null ? { ok: false } : { ok: true, codigos };
  }

  const qr = `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(uriOtpauth(secreto, correo)))}`;

  return (
    <EnvoltorioDeTema>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        {/* La misma lámina que la página de acceso: es el paso siguiente a esa pantalla, y sin
            ella el texto quedaba directamente sobre el halo del fondo. */}
        <div className="lamina-tarjeta rounded-3xl p-7">
          <AltaDelSegundoFactor
            correo={correo}
            qr={qr}
            grupos={secreto.match(/.{1,4}/g) ?? [secreto]}
            onConfirmar={confirmar}
            onTerminar={terminar}
          />
        </div>
      </main>
    </EnvoltorioDeTema>
  );
}
