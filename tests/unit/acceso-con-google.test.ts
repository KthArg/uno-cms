import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '@/cms/security/audit';
import {
  type CuentaDelPanel,
  autenticarConGoogle,
  credencialesDeGoogle,
  decidirAcceso,
} from '@/cms/auth/google';

/** Lo que antes preguntaba `googleConfigurado`; ver por qué ya no existe en `cms/auth/google.ts`. */
const configurado = (entorno: Record<string, string | undefined>) =>
  credencialesDeGoogle(entorno) !== null;

/**
 * Los casos de `docs/specs/13-acceso-con-google.md` que no necesitan base de datos.
 *
 * Que sean tantos no es casualidad: la decisión de quién entra está en una función pura a
 * propósito (spec 13 §3), porque una regla de seguridad que solo se puede ejercitar levantando
 * OAuth y Postgres es una regla que se ejercita poco.
 */

const CUENTA: CuentaDelPanel = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@ejemplo.com',
  name: 'Ana',
  role: 'editor',
  passwordVersion: 3,
  active: true,
};

describe('T-233-1 — Google es opcional, y hacen falta las dos variables', () => {
  it('sin ninguna de las dos, no está configurado', () => {
    expect(configurado({})).toBe(false);
  });

  it('con solo el identificador, tampoco', () => {
    expect(configurado({ AUTH_GOOGLE_ID: 'abc.apps.googleusercontent.com' })).toBe(false);
  });

  it('con solo el secreto, tampoco', () => {
    expect(configurado({ AUTH_GOOGLE_SECRET: 'un-secreto' })).toBe(false);
  });

  it('definidas pero vacías cuenta como no definidas', () => {
    // Es exactamente lo que llega de una variable creada en Vercel y sin rellenar. Tratarla
    // como un valor daría un cliente de OAuth con el identificador vacío: el botón aparecería
    // y llevaría a un error de Google, que es peor que no tener botón.
    expect(configurado({ AUTH_GOOGLE_ID: '', AUTH_GOOGLE_SECRET: '' })).toBe(false);
    expect(configurado({ AUTH_GOOGLE_ID: 'abc', AUTH_GOOGLE_SECRET: '' })).toBe(false);
  });

  it('con las dos, sí, y las devuelve tal cual', () => {
    const entorno = { AUTH_GOOGLE_ID: 'abc', AUTH_GOOGLE_SECRET: 'un-secreto' };

    expect(configurado(entorno)).toBe(true);
    expect(credencialesDeGoogle(entorno)).toEqual({ id: 'abc', secreto: 'un-secreto' });
  });
});

describe('T-233-2 y T-233-3 — el proveedor entra en la configuración solo si está configurado', () => {
  /**
   * Se comprueba sobre `authConfig.providers` y **no** sobre la pantalla, que es lo que pide el
   * caso: un botón escondido con un proveedor vivo detrás seguiría siendo una puerta abierta —
   * `/api/auth/signin/google` responde exista o no el botón.
   *
   * Hace falta `resetModules` porque la lista de proveedores se construye al cargar el módulo
   * (ver el comentario de `GOOGLE` en `cms/auth/index.ts`), así que cambiar el entorno después
   * de importarlo no cambiaría nada.
   */
  async function proveedores(entorno: Record<string, string>): Promise<string[]> {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const [clave, valor] of Object.entries(entorno)) vi.stubEnv(clave, valor);

    const { authConfig } = await import('@/cms/auth');

    return authConfig.providers.map((proveedor) =>
      typeof proveedor === 'function' ? 'desconocido' : proveedor.id
    );
  }

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sin las variables, no está', async () => {
    expect(await proveedores({ AUTH_GOOGLE_ID: '', AUTH_GOOGLE_SECRET: '' })).toEqual([
      'credentials',
    ]);
  });

  it('con las dos, está — y el de credenciales sigue', async () => {
    const lista = await proveedores({
      AUTH_GOOGLE_ID: 'abc.apps.googleusercontent.com',
      AUTH_GOOGLE_SECRET: 'un-secreto',
    });

    expect(lista).toContain('google');
    // ADR-900: el acceso por contraseña no se retira nunca. Si algún día alguien lo sustituye
    // en vez de añadirlo, una caída de Google deja a todo el mundo fuera de su propio panel.
    expect(lista).toContain('credentials');
  });
});

describe('T-233-4 a T-233-8 — las tres puertas', () => {
  it('T-233-4: correo verificado y cuenta activa entra, con los datos de la fila', () => {
    const resultado = decidirAcceso({ emailVerificado: true, cuenta: CUENTA });

    expect(resultado).toEqual({
      ok: true,
      usuario: {
        id: CUENTA.id,
        email: CUENTA.email,
        name: CUENTA.name,
        role: 'editor',
        passwordVersion: 3,
      },
    });
  });

  it('T-233-5: sin verificar no entra, aunque la cuenta exista y esté activa', () => {
    expect(decidirAcceso({ emailVerificado: false, cuenta: CUENTA })).toEqual({
      ok: false,
      motivo: 'correo-sin-verificar',
    });
  });

  it('T-233-6: un correo que no existe no entra', () => {
    expect(decidirAcceso({ emailVerificado: true, cuenta: undefined })).toEqual({
      ok: false,
      motivo: 'cuenta-inexistente',
    });
  });

  it('T-233-7: una cuenta desactivada no entra', () => {
    expect(decidirAcceso({ emailVerificado: true, cuenta: { ...CUENTA, active: false } })).toEqual({
      ok: false,
      motivo: 'cuenta-desactivada',
    });
  });

  it('T-233-8: el bloqueo por intentos fallidos no cierra esta puerta (ADR-901)', () => {
    // `decidirAcceso` ni siquiera recibe `locked_until`, y esa es la forma fuerte de la
    // decisión: no es que se mire y se ignore, es que no está a mano para mirarlo. El motivo
    // está en ADR-901 — el bloqueo defiende la contraseña, y por aquí no pasa ninguna.
    expect(decidirAcceso({ emailVerificado: true, cuenta: CUENTA })).toMatchObject({ ok: true });
    expect(Object.keys(CUENTA)).not.toContain('lockedUntil');
  });
});

describe('T-233-5 — un correo sin verificar no llega a la base de datos', () => {
  it('no se consulta `users` ni una vez', async () => {
    const buscarCuenta = vi.fn(async () => CUENTA);
    const registrar = vi.fn(async (_evento: AuditEvent) => {});

    const resultado = await autenticarConGoogle(
      { email: 'ana@ejemplo.com', emailVerificado: false },
      { buscarCuenta, registrar }
    );

    expect(resultado).toEqual({ ok: false, motivo: 'correo-sin-verificar' });
    // Contando las llamadas y no leyendo el código: es la diferencia entre comprobarlo y
    // suponerlo. Preguntar por un correo del que no se sabe de quién es no aporta nada y sí
    // convierte esta ruta en algo que consulta `users` con lo que le manden.
    expect(buscarCuenta).not.toHaveBeenCalled();
  });
});

describe('el rastro que deja cada intento (T-233-13, la parte sin base de datos)', () => {
  it('un acierto se registra como `login.success` diciendo que fue por Google', async () => {
    const registrar = vi.fn(async (_evento: AuditEvent) => {});

    await autenticarConGoogle(
      { email: 'ana@ejemplo.com', emailVerificado: true },
      { buscarCuenta: async () => CUENTA, registrar }
    );

    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login.success',
        actorId: CUENTA.id,
        meta: { proveedor: 'google' },
      })
    );
  });

  it('un rechazo se registra con su motivo', async () => {
    const registrar = vi.fn(async (_evento: AuditEvent) => {});

    await autenticarConGoogle(
      { email: 'nadie@ejemplo.com', emailVerificado: true },
      { buscarCuenta: async () => undefined, registrar }
    );

    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login.fail',
        actorEmail: 'nadie@ejemplo.com',
        meta: { proveedor: 'google', motivo: 'cuenta-inexistente' },
      })
    );
  });

  it('y un rechazo sin fila detrás no se inventa un actor', async () => {
    // El identificador del perfil de Google **no** es un `users.id`. Ponerlo aquí dejaría en
    // `audit_log.actor_id` una clave que no corresponde a nadie, y quien lea la tabla más
    // adelante creería que sí.
    const registrar = vi.fn(async (_evento: AuditEvent) => {});

    await autenticarConGoogle(
      { email: 'nadie@ejemplo.com', emailVerificado: true },
      { buscarCuenta: async () => undefined, registrar }
    );

    expect(registrar.mock.calls[0]?.[0]).not.toHaveProperty('actorId');
  });

  it('el correo se normaliza antes de buscarlo y de registrarlo', async () => {
    const buscarCuenta = vi.fn(async () => CUENTA);
    const registrar = vi.fn(async (_evento: AuditEvent) => {});

    await autenticarConGoogle(
      { email: '  ANA@Ejemplo.com  ', emailVerificado: true },
      { buscarCuenta, registrar }
    );

    expect(buscarCuenta).toHaveBeenCalledWith('ana@ejemplo.com');
  });
});

describe('T-233-9 y T-233-10 — la identidad de la sesión sale de `users`, no de Google', () => {
  /**
   * Se ejercitan los callbacks reales de `authConfig`, no una copia.
   *
   * El montaje imita lo que hace Auth.js: `profile()` ya ha corrido y ha dejado su decisión
   * dentro del usuario, y **el `id` que llega ya no es el nuestro** — `getUserAndAccount` de
   * `@auth/core` lo sustituye por un UUID aleatorio antes de este punto. Reproducirlo es lo que
   * hace que el caso valga: sin ese `id` falso, la prueba pasaría aunque el código copiara
   * `user.id` a `token.sub`.
   */
  const ID_QUE_INVENTA_AUTHJS = '99999999-9999-4999-8999-999999999999';

  async function jwtDeGoogle(acceso: unknown) {
    vi.resetModules();
    const { authConfig } = await import('@/cms/auth');

    // Los tipos de los callbacks de Auth.js describen la unión de todos sus flujos; aquí se
    // arma uno concreto. El `as never` es para el parámetro, no para el resultado.
    return authConfig.callbacks.jwt({
      token: { sub: ID_QUE_INVENTA_AUTHJS, email: 'ana@ejemplo.com', name: 'Ana' },
      user: { id: ID_QUE_INVENTA_AUTHJS, email: 'ana@ejemplo.com', name: 'Ana', acceso },
      account: { provider: 'google', providerAccountId: 'sub-de-google', type: 'oidc' },
    } as never);
  }

  it('T-233-9: el `sub` del token es el `id` de la fila', async () => {
    const token = await jwtDeGoogle({
      ok: true,
      usuario: { ...CUENTA, passwordVersion: 3 },
    });

    expect(token?.sub).toBe(CUENTA.id);
    expect(token?.sub).not.toBe(ID_QUE_INVENTA_AUTHJS);
    expect(token?.['pwdV']).toBe(3);
  });

  it('T-233-10: el rol sale de la fila, no de lo que traiga el perfil', async () => {
    const token = await jwtDeGoogle({
      ok: true,
      usuario: { ...CUENTA, role: 'editor' },
    });

    expect(token?.['role']).toBe('editor');
  });

  it('un acceso rechazado no llega a emitir token, aunque `signIn` fallara', async () => {
    // La segunda cerradura de `cms/auth/index.ts`. La primera es el callback `signIn` de abajo;
    // esta existe porque la primera vive en otra función y podría dejar de hacer su trabajo.
    expect(await jwtDeGoogle({ ok: false, motivo: 'cuenta-inexistente' })).toBeNull();
  });

  it('y un usuario de Google sin decisión dentro tampoco', async () => {
    expect(await jwtDeGoogle(undefined)).toBeNull();
  });
});

describe('el callback `signIn` es la puerta que devuelve el mensaje de ADR-902', () => {
  async function permite(user: unknown, provider: string): Promise<unknown> {
    vi.resetModules();
    const { authConfig } = await import('@/cms/auth');

    return authConfig.callbacks.signIn({
      user,
      account: { provider, providerAccountId: 'x', type: 'oidc' },
    } as never);
  }

  it('deja pasar un acceso aceptado', async () => {
    expect(await permite({ acceso: { ok: true, usuario: CUENTA } }, 'google')).toBe(true);
  });

  it('rechaza uno denegado', async () => {
    expect(await permite({ acceso: { ok: false, motivo: 'cuenta-desactivada' } }, 'google')).toBe(
      false
    );
  });

  it('no toca al proveedor de credenciales, que decide en otro sitio', async () => {
    // `authenticate()` ya devolvió `null` y el flujo ni llega aquí. Si este callback tratara a
    // credentials como a Google, **ningún acceso por contraseña funcionaría**: no traen
    // `acceso` dentro.
    expect(await permite({ id: 'x', email: 'ana@ejemplo.com' }, 'credentials')).toBe(true);
  });
});

describe('la pantalla y el proveedor salen de la misma decisión', () => {
  /**
   * El hallazgo 2 de la autorrevisión de #233.
   *
   * La pantalla llamaba a una función que leía `process.env` en cada petición, mientras la lista
   * de proveedores se congela al cargar el módulo. Podían discrepar, y en la dirección mala:
   * quien definiera las variables sin reiniciar veía **el botón pintado y el proveedor
   * inexistente** — una puerta que no está.
   *
   * El arreglo no fue sincronizar las dos lecturas: fue **quitar la segunda**. Lo que este caso
   * protege es que la constante que consulta la pantalla diga siempre lo mismo que la lista, en
   * los dos estados. Un `ACCESO_CON_GOOGLE_DISPONIBLE` que se quedara fijo en `true` —o que
   * volviera a leer el entorno por su cuenta— lo pondría en rojo.
   */
  async function estado(entorno: Record<string, string>) {
    vi.unstubAllEnvs();
    vi.resetModules();
    for (const [clave, valor] of Object.entries(entorno)) vi.stubEnv(clave, valor);

    const { ACCESO_CON_GOOGLE_DISPONIBLE, authConfig } = await import('@/cms/auth');

    return {
      loQueDiceLaPantalla: ACCESO_CON_GOOGLE_DISPONIBLE,
      hayProveedor: authConfig.providers.some((p) => 'id' in p && p.id === 'google'),
    };
  }

  it('sin Google, las dos dicen que no', async () => {
    const { loQueDiceLaPantalla, hayProveedor } = await estado({
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
    });

    expect(hayProveedor).toBe(false);
    expect(loQueDiceLaPantalla).toBe(hayProveedor);
  });

  it('con Google, las dos dicen que sí', async () => {
    const { loQueDiceLaPantalla, hayProveedor } = await estado({
      AUTH_GOOGLE_ID: 'abc.apps.googleusercontent.com',
      AUTH_GOOGLE_SECRET: 'un-secreto',
    });

    expect(hayProveedor).toBe(true);
    expect(loQueDiceLaPantalla).toBe(hayProveedor);
  });
});
