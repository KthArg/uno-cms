import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARGEN_DE_RENOVACION_SEGUNDOS, estadoDelTokenRemoto } from '@/cms/preview/renovacion';
import { TOKEN_TTL, signToken, verifyToken } from '@/cms/security/tokens';

/**
 * T-R-9 a T-R-12: **el token que viaja a un tercero** (spec 08 §4.2 y §6.3, ADR-701).
 *
 * Lo que separa a este token del de `/preview` no es la duración: es que este **sale de
 * nuestro origen**. Acaba en la barra de direcciones de una web que no es nuestra, en su
 * historial y con toda probabilidad en los registros de su servidor.
 */

beforeEach(() => {
  // Los tokens se firman con `APP_SECRET`, que **lanza** si falta o es corto (M2). Es un
  // contrato deliberado, no un descuido: un despliegue sin secreto no debe arrancar callado.
  vi.stubEnv('APP_SECRET', 'un-secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('T-R-9 y T-R-10 — los dos propósitos no se cruzan', () => {
  it('un token de `preview` no vale en la ruta remota', () => {
    // Si valiera, quien consiguiera un enlace de vista previa de este CMS podría leer
    // borradores desde fuera, con CORS y sin sesión.
    const local = signToken('preview', { key: 'hero' });

    expect(verifyToken('preview-remoto', local)).toEqual({ ok: false });
  });

  it('un token remoto no vale en `/preview`', () => {
    // Y este es el que importa de los dos, porque es el que se filtra: el remoto viaja a un
    // tercero. Si sirviera en `/preview`, filtrarlo entregaría además la vista previa
    // completa de este CMS, que es una página nuestra y no un JSON.
    const remoto = signToken('preview-remoto', { key: 'hero' });

    expect(verifyToken('preview', remoto)).toEqual({ ok: false });
  });

  it('los dos están igual de bien firmados: lo único que los separa es el propósito', () => {
    // El caso que explica por qué el propósito va **dentro** de la firma. Las dos cadenas son
    // indistinguibles para cualquiera que no tenga `APP_SECRET`, y cada una vale exactamente
    // en su sitio.
    const remoto = signToken('preview-remoto', { key: 'hero' });

    expect(verifyToken('preview-remoto', remoto)).toEqual({ ok: true, data: { key: 'hero' } });
    expect(verifyToken('setup', remoto)).toEqual({ ok: false });
    expect(verifyToken('password-reset', remoto)).toEqual({ ok: false });
  });
});

describe('T-R-11 — caducado, mal firmado y ausente responden igual', () => {
  it('los cuatro fallos son la misma respuesta, sin motivo', () => {
    const caducado = signToken('preview-remoto', { key: 'hero' }, -1);
    const otroProposito = signToken('preview', { key: 'hero' });
    const [payload] = signToken('preview-remoto', { key: 'hero' }).split('.');
    const manipulado = `${payload}.${'A'.repeat(43)}`;

    const resultados = [
      verifyToken('preview-remoto', caducado),
      verifyToken('preview-remoto', otroProposito),
      verifyToken('preview-remoto', manipulado),
      verifyToken('preview-remoto', undefined),
    ];

    for (const resultado of resultados) {
      // Distinguir "caducado" de "mal firmado" le dice a quien prueba tokens que iba por buen
      // camino (SPEC §7.1, enumeración). Y ni una clave de más en el objeto: si algún día
      // alguien añade un `motivo` "para depurar", esto se pone rojo.
      expect(resultado).toEqual({ ok: false });
      expect(Object.keys(resultado)).toEqual(['ok']);
    }
  });
});

describe('T-R-12 — un token remoto recién emitido caduca al pasar su TTL', () => {
  const VIDA = TOKEN_TTL['preview-remoto'];

  it('vale un segundo antes de su hora y no vale un segundo después', () => {
    // Con el reloj fijado, que es lo que hace que esto ejercite `verifyToken` en vez de
    // comparar una constante contra un rango. La versión anterior de este caso decía "el TTL
    // es de minutos, no de horas" y habría pasado con cualquier número entre uno y cincuenta
    // y nueve, sin ejecutar una sola línea de la verificación.
    vi.useFakeTimers();

    const token = signToken('preview-remoto', { key: 'hero' });

    vi.advanceTimersByTime((VIDA - 1) * 1000);
    expect(verifyToken('preview-remoto', token)).toMatchObject({ ok: true });

    vi.advanceTimersByTime(2 * 1000);
    expect(verifyToken('preview-remoto', token)).toEqual({ ok: false });
  });

  it('la vida del remoto tiene un techo, y el techo es lo que se puede comprobar', () => {
    // Un tope y no una igualdad. Acortarlo nunca es un problema de seguridad —solo de
    // comodidad, y de eso ya se ocupa el invariante del margen de renovación—, así que lo
    // único que hace falta vigilar es que **no crezca**.
    //
    // ADR-701 fija quince minutos, y el motivo es que este token acaba en el historial y en
    // los registros de un tercero: lo que se elige no es si se filtra, es cuánto dura el daño
    // cuando pase. Sin este tope, subirlo a dos horas "porque se cae la vista previa" sería un
    // cambio de una línea que ningún caso pondría en rojo.
    expect(VIDA).toBeLessThanOrEqual(15 * 60);
  });

  it('el de `/preview`, a esa misma hora, sigue vivo', () => {
    // La comparación que da sentido al número: lo que se eligió no es "quince minutos", es
    // "mucho menos que el que no sale de casa". Si alguien igualara los dos TTL, esto se pone
    // rojo aunque el token remoto siga caducando correctamente.
    vi.useFakeTimers();

    const local = signToken('preview', { key: 'hero' });

    vi.advanceTimersByTime((VIDA + 60) * 1000);

    expect(verifyToken('preview', local)).toMatchObject({ ok: true });
  });
});

describe('cuándo se pide el siguiente', () => {
  const VIDA = TOKEN_TTL['preview-remoto'];

  it('recién emitido vale, y no pide otro inmediatamente', () => {
    // El invariante que impide un bucle: si el margen llegara a ser mayor que el TTL, cada
    // token nuevo nacería pidiendo su relevo y el panel renovaría sin parar.
    expect(estadoDelTokenRemoto(VIDA, 0)).toBe('vale');
  });

  it('toca renovar cuando entra en el margen, no cuando ya se ha muerto', () => {
    expect(estadoDelTokenRemoto(VIDA, VIDA - MARGEN_DE_RENOVACION_SEGUNDOS - 1)).toBe('vale');
    expect(estadoDelTokenRemoto(VIDA, VIDA - MARGEN_DE_RENOVACION_SEGUNDOS)).toBe('toca-renovar');
    expect(estadoDelTokenRemoto(VIDA, VIDA - 1)).toBe('toca-renovar');
  });

  it('pasada la vida entera, dice que caducó', () => {
    // No es un matiz de nombres: es lo que obliga al panel a decir algo. Sin este estado, un
    // token muerto y uno vivo se parecen desde el lado del panel, y la vista previa seguiría
    // enseñando lo último que recibió como si estuviera al día.
    expect(estadoDelTokenRemoto(VIDA, VIDA)).toBe('caducado');
    expect(estadoDelTokenRemoto(VIDA, VIDA + 600)).toBe('caducado');
  });

  it('un desfase del reloj del navegador no lo mueve, porque no se mira el reloj', () => {
    // Entra lo transcurrido, no una hora. Dos paneles con relojes distintos y el mismo token
    // recién recibido llegan a la misma conclusión, que es justo lo que no pasaría comparando
    // contra un `exp` absoluto.
    expect(estadoDelTokenRemoto(VIDA, 10)).toBe('vale');
  });
});

describe('el panel y el verificador no pueden discrepar en el instante de la caducidad', () => {
  it('en el segundo exacto en que expira, los dos dicen que está muerto', () => {
    // La frontera escrita dos veces —`exp <= ahora` allí, `restante <= 0` aquí— es una
    // discrepancia esperando a ocurrir: el panel daría el token por bueno durante un segundo
    // en el que la ruta remota ya responde 404. Este caso ata las dos funciones.
    vi.useFakeTimers();

    const vida = TOKEN_TTL['preview-remoto'];
    const token = signToken('preview-remoto', { key: 'hero' });

    vi.advanceTimersByTime(vida * 1000);

    expect(verifyToken('preview-remoto', token)).toEqual({ ok: false });
    expect(estadoDelTokenRemoto(vida, vida)).toBe('caducado');
  });
});

describe('`/preview` sigue pidiendo su propio propósito', () => {
  it('la página verifica con `preview` y no acepta el remoto', async () => {
    // **Mira el código fuente, no el comportamiento**, y es el mismo trato que el test de
    // `timingSafeEqual` de M2: se elige entre vigilar la implementación o no vigilar nada.
    //
    // Lo que protege no lo cubre ningún otro caso. Que la página use hoy `preview` lo sostiene
    // el e2e T-J-1 —si pasara a exigir `preview-remoto`, la vista previa dejaría de cargar y
    // ese test se pondría rojo—, pero **añadir** el remoto como segundo propósito aceptado no
    // rompería nada: la vista previa seguiría funcionando y el token que viaja a un tercero
    // pasaría a abrir también una página nuestra.
    //
    // No demuestra que la separación se respete. Demuestra que nadie la ha quitado aquí.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');

    const fuente = readFileSync(
      fileURLToPath(new URL('../../app/preview/page.tsx', import.meta.url)),
      'utf8'
    );

    expect(fuente).toContain("verifyToken('preview',");
    expect(fuente).not.toContain('preview-remoto');
  });
});
