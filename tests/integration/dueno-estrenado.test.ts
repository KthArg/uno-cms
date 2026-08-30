import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authenticate } from '@/cms/auth/authenticate';
import { redeemInvitation } from '@/cms/auth/invitations';
import {
  completeSetup,
  resetSetupCacheForTests,
  resetSetupLimiterForTests,
} from '@/cms/auth/setup';
import { inviteUser } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { getDb, users } from '@/cms/db';
import { listUsers } from '@/cms/core/users';
import { describeIntegration } from './env';

/**
 * T-209-1 a T-209-4: **quién aparece como que todavía no ha entrado** (issue #212).
 *
 * ## De dónde sale este fichero
 *
 * De mirar la pantalla de Personas de un despliegue de verdad. La cuenta del dueño —la que
 * configuró el sitio y entra a diario— salía marcada como «Todavía no ha entrado».
 *
 * La etiqueta se deduce de `passwordVersion === 0`, que significa «tiene una contraseña que no
 * conoce nadie»: lo que deja `inviteUser` hasta que alguien canjea. `completeSetup` no pasa por
 * ahí —la contraseña la elige quien la va a usar— pero dejaba la columna en su valor por
 * defecto, así que el dueño heredaba el estado de una invitación sin canjear.
 *
 * ## Por qué ningún test lo veía
 *
 * Porque los de `listUsers` insertan las cuentas a mano, eligiendo `passwordVersion`. **Ninguno
 * pasaba por `completeSetup`**, que es el único camino que produce el fallo. Aquí se recorren
 * los dos caminos de creación que existen, que es lo que faltaba.
 */

const TOKEN = 'un-token-de-instalacion-con-mas-de-32-caracteres';
const PASSWORD = 'la-contrasena-que-elige-quien-monta-el-sitio';

const DUENO = {
  token: TOKEN,
  email: 'dueno@ejemplo.com',
  name: 'Quien monta el sitio',
  password: PASSWORD,
};

async function crearElSitio() {
  const resultado = await completeSetup(DUENO);
  expect(resultado.ok, 'el bootstrap tenía que funcionar').toBe(true);
}

/** Entra como el dueño recién creado, para poder invitar. */
async function sesionDelDueno() {
  const [fila] = await getDb().select().from(users);

  setSessionProviderForTests(() =>
    Promise.resolve({ userId: fila!.id, email: fila!.email, role: 'admin' as const })
  );
}

/** Cómo aparece una cuenta en la pantalla de Personas. */
async function comoSeVe(correo: string) {
  const fila = (await listUsers()).find((u) => u.correo === correo);
  expect(fila, `no hay ninguna cuenta con ${correo}`).toBeDefined();

  return fila!;
}

describeIntegration('quién aparece como que todavía no ha entrado', () => {
  beforeEach(() => {
    // El caché del bootstrap es de proceso: sin resetearlo, el segundo test de este fichero
    // creería que el sitio ya está configurado y no crearía nada.
    resetSetupCacheForTests();
    resetSetupLimiterForTests('9.9.9.9');
    resetBucketsForTests();
    vi.stubEnv('SETUP_TOKEN', TOKEN);
    // `signToken` lanza sin `APP_SECRET`, y es un contrato deliberado de M2: firmar con un
    // secreto ausente produciría tokens que cualquiera puede fabricar.
    vi.stubEnv('APP_SECRET', 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres');
  });

  afterEach(() => {
    setSessionProviderForTests(null);
    vi.unstubAllEnvs();
  });

  it('T-209-1: el dueño, no — eligió su contraseña al montar el sitio', async () => {
    await crearElSitio();

    expect((await comoSeVe(DUENO.email)).sinEstrenar).toBe(false);
  });

  it('T-209-2 y T-209-3: quien fue invitado, sí — hasta que canjea', async () => {
    // La etiqueta existe para esto: saber a quién falta mandarle su enlace. Si dejara de
    // funcionar aquí, el arreglo del dueño habría roto lo que venía a proteger.
    await crearElSitio();
    await sesionDelDueno();

    const invitacion = await inviteUser({
      email: 'invitada@ejemplo.com',
      name: 'Invitada',
      role: 'editor',
    });
    expect(invitacion.ok, 'la invitación tenía que funcionar').toBe(true);
    if (!invitacion.ok) return;

    expect((await comoSeVe('invitada@ejemplo.com')).sinEstrenar).toBe(true);

    const canje = await redeemInvitation({
      token: invitacion.data.token,
      password: 'otra-contrasena-larga-y-poco-comun',
    });
    expect(canje.ok, 'el canje tenía que funcionar').toBe(true);

    expect((await comoSeVe('invitada@ejemplo.com')).sinEstrenar).toBe(false);
  });

  it('T-209-4: y el dueño puede entrar, que es lo que decide si esto se podía tocar', async () => {
    // `password_version` no es un dato de pantalla: viaja en el claim `pwdV` y se compara contra
    // la base en cada petición (ADR-301). Cambiar su valor inicial mal deja al dueño fuera de su
    // propio sitio, que es un fallo bastante peor que una etiqueta equivocada.
    await crearElSitio();

    const sesion = await authenticate({
      email: DUENO.email,
      password: PASSWORD,
      ip: '9.9.9.9',
    });

    expect(sesion.ok, 'el dueño no pudo entrar tras el arreglo').toBe(true);
    // Y la sesión lleva la versión que tiene la fila: si no coincidiera, la siguiente petición
    // lo expulsaría — el fallo se vería como «entra y se sale solo».
    expect(sesion.ok && sesion.user.passwordVersion).toBe(1);
  });
});
