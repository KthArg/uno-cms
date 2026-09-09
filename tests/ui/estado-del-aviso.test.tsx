import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EstadoDelAviso, haceCuanto } from '@/cms/ui/EstadoDelAviso';

/**
 * T-A-34, T-A-35 y T-A-36: **el panel enseña el último aviso** (issue #286).
 *
 * ## Qué protegen de verdad estos casos
 *
 * El aviso se manda con `after()`, después de responderle a quien publica. Si falla, la pantalla
 * ya dijo «Publicado ✓» y se fue. Este componente es lo único que rompe ese silencio, así que lo
 * que hay que fijar no es que se pinte algo: es que **un fallo se distinga**.
 *
 * Un test que solo compruebe que el componente no revienta pasa igual pintando lo mismo en los
 * tres estados, y entonces estaría protegiendo la ausencia de una excepción en vez de la
 * distinción que este componente existe para dar.
 */

const AHORA = new Date('2026-09-09T12:00:00Z').getTime();
const HACE_TRES_MINUTOS = AHORA - 3 * 60 * 1000;

describe('T-A-34 a T-A-36 — los tres estados son tres', () => {
  it('T-A-34: con la fase apagada no se pinta NADA', () => {
    const { container } = render(<EstadoDelAviso aviso={null} ahora={AHORA} />);

    // Ni un hueco, ni un «sin configurar». `null` no es «no hay datos»: es que esta fase no
    // existe en este despliegue, y la inmensa mayoría no la tiene encendida.
    expect(container).toBeEmptyDOMElement();
  });

  it('T-A-35: con la fase encendida y todo bien, dice que se avisó y cuándo', () => {
    render(
      <EstadoDelAviso
        aviso={{ ok: true, cuando: HACE_TRES_MINUTOS, evento: 'content.published' }}
        ahora={AHORA}
      />
    );

    expect(screen.getByText(/Se avisó a tu web hace 3 minutos/)).toBeInTheDocument();
  });

  it('T-A-36: un fallo se ve COMO FALLO, no como «todavía sin datos»', () => {
    render(
      <EstadoDelAviso
        aviso={{
          ok: false,
          cuando: HACE_TRES_MINUTOS,
          evento: 'content.published',
          motivo: 'red',
        }}
        ahora={AHORA}
      />
    );

    // Las tres mitades del mensaje: que falló, cuándo, y **qué significa para el editor**.
    expect(screen.getByText(/El aviso a tu web falló hace 3 minutos/)).toBeInTheDocument();
    expect(screen.getByText(/No respondió/)).toBeInTheDocument();
    expect(screen.getByText(/puede estar enseñando lo anterior/)).toBeInTheDocument();
  });

  it('T-A-36b: y no se parece al caso bueno', () => {
    const { container: bien } = render(
      <EstadoDelAviso aviso={{ ok: true, cuando: HACE_TRES_MINUTOS, evento: 'x' }} ahora={AHORA} />
    );
    const { container: mal } = render(
      <EstadoDelAviso
        aviso={{ ok: false, cuando: HACE_TRES_MINUTOS, evento: 'x', motivo: 'red' }}
        ahora={AHORA}
      />
    );

    expect(mal.textContent).not.toBe(bien.textContent);
    // Y no solo por el texto: el color del fallo es el de «pendiente», no el de tinta suave.
    // Sin esto, pintar los dos iguales y cambiar una palabra pasaría el caso de arriba.
    expect(mal.querySelector('.text-pendiente-tinta')).not.toBeNull();
    expect(bien.querySelector('.text-pendiente-tinta')).toBeNull();
  });

  it('cada motivo dice a quién preguntar, y ninguno enseña el código HTTP', () => {
    for (const [motivo, esperado] of [
      ['red', /No respondió/],
      ['estado', /Respondió con un error/],
      ['redirigido', /Redirige a otra dirección/],
    ] as const) {
      const { container } = render(
        <EstadoDelAviso
          aviso={{ ok: false, cuando: HACE_TRES_MINUTOS, evento: 'x', motivo }}
          ahora={AHORA}
        />
      );

      expect(container.textContent, motivo).toMatch(esperado);
      // A quien publica textos, un 502 no le dice nada. El número exacto está en la auditoría.
      expect(container.textContent, motivo).not.toMatch(/\b[45]\d\d\b/);
    }
  });

  it('un motivo desconocido no deja el mensaje a medias ni inventa una causa', () => {
    // Una fila de auditoría vieja puede traer un motivo que ya no existe. Lo que no puede pasar
    // es que el panel calle el fallo por no saber explicarlo.
    render(
      <EstadoDelAviso
        aviso={{ ok: false, cuando: HACE_TRES_MINUTOS, evento: 'x', motivo: 'lo-que-sea' }}
        ahora={AHORA}
      />
    );

    expect(screen.getByText(/El aviso a tu web falló/)).toBeInTheDocument();
  });
});

describe('el «hace…» no depende del reloj de la máquina', () => {
  it('cuenta en segundos, minutos, horas y días', () => {
    const casos: [number, string][] = [
      [5 * 1000, 'hace unos segundos'],
      [60 * 1000, 'hace 1 minuto'],
      [3 * 60 * 1000, 'hace 3 minutos'],
      [60 * 60 * 1000, 'hace 1 hora'],
      [5 * 60 * 60 * 1000, 'hace 5 horas'],
      [24 * 60 * 60 * 1000, 'hace 1 día'],
      [3 * 24 * 60 * 60 * 1000, 'hace 3 días'],
    ];

    for (const [hace, esperado] of casos) {
      expect(haceCuanto(AHORA - hace, AHORA), String(hace)).toBe(esperado);
    }
  });

  it('un instante en el futuro no produce un número negativo', () => {
    // Pasa de verdad: el reloj del servidor y el de la base de datos no son el mismo, y un
    // desfase de un segundo produciría «hace -1 minutos» en la pantalla de inicio.
    //
    // **Este caso sobrevive a quitar el `Math.max(0, …)` que había, y por eso ese se quitó**: no
    // defendía nada, porque cualquier negativo ya es menor que 60. Lo que el caso fija es el
    // comportamiento —que no salga un número negativo en la pantalla— y eso sigue siendo cierto
    // por la forma de la primera rama. Un desfase de horas también.
    expect(haceCuanto(AHORA + 10_000, AHORA)).toBe('hace unos segundos');
    expect(haceCuanto(AHORA + 3 * 60 * 60 * 1000, AHORA)).toBe('hace unos segundos');
  });
});
