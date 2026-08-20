import { Pool } from 'pg';

/**
 * Contenido de ejemplo, publicado, para medir contra algo (SPEC §8, issue #117).
 *
 * ## Por qué esto existe
 *
 * Los presupuestos de §8 se miden **contra contenido de ejemplo, no contra una landing vacía**.
 * Una página sin texto ni imágenes saca 100 en todo y no dice nada: no hay nada que pintar, nada
 * que descargar y nada que retrase el LCP.
 *
 * Y tiene que ser **el mismo** contenido en cada ejecución, o la medida de hoy no se puede
 * comparar con la de mañana.
 *
 * ## Lo que escribe, y por qué así
 *
 * Directamente en `published`, sin pasar por las actions. Es lo contrario de lo que hacen los
 * tests —que ejercitan el camino real a propósito— y aquí es lo correcto: esto no prueba nada,
 * prepara el escenario. Pasar por las actions exigiría una sesión y un servidor levantado antes
 * de haber levantado el servidor.
 *
 * También marca el sitio como configurado. Sin eso la landing enseña el aviso de "todavía no
 * está listo" (ADR-502) y Lighthouse mediría esa página, no la landing.
 */

const parrafo = (texto) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }],
});

const CONTENIDO = [
  [
    'hero',
    'hero',
    {
      title: 'Reformas que se entregan a tiempo',
      subtitle:
        'Presupuesto cerrado, plazos por escrito y una sola persona de contacto de principio a fin.',
      ctaLabel: 'Pedir presupuesto',
      ctaHref: '/contacto',
    },
  ],
  [
    'about',
    'about',
    {
      heading: 'Quiénes somos',
      body: parrafo(
        'Somos un equipo de doce personas en Valencia. Llevamos catorce años reformando pisos ' +
          'y locales, y seguimos trabajando con los mismos proveedores del primer año.'
      ),
      visible: true,
    },
  ],
  [
    'seo',
    'seo',
    {
      title: 'Reformas integrales en Valencia',
      description: 'Presupuesto cerrado y plazos por escrito. Catorce años reformando.',
    },
  ],
];

const COLECCIONES = [
  [
    'testimonials',
    [
      { author: 'Marta Ibáñez', quote: 'Terminaron cuatro días antes de lo previsto.', rating: 5 },
      {
        author: 'Chelo Ruiz',
        quote: 'El presupuesto fue el que dijeron. Ni un euro más.',
        rating: 5,
      },
      { author: 'Andrés Poveda', quote: 'Dejaron la casa limpia cada día.', rating: 4 },
    ],
  ],
  [
    'faqs',
    [
      {
        question: '¿Cuánto tarda una reforma completa?',
        answer: parrafo('Entre seis y diez semanas.'),
      },
      {
        question: '¿El presupuesto es cerrado?',
        answer: parrafo('Sí, y por escrito antes de empezar.'),
      },
      { question: '¿Trabajáis fuera de Valencia?', answer: parrafo('Hasta cuarenta kilómetros.') },
    ],
  ],
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(
    `insert into settings (key, value)
     values ('setup_completed', jsonb_build_object('completedAt', now()::text))
     on conflict (key) do nothing`
  );

  for (const [key, type, datos] of CONTENIDO) {
    await pool.query(
      `insert into content_entries (key, type, draft, published, status)
       values ($1, $2, $3::jsonb, $3::jsonb, 'published')
       on conflict (key) do update set draft = $3::jsonb, published = $3::jsonb, status = 'published'`,
      [key, type, JSON.stringify(datos)]
    );
  }

  for (const [coleccion, elementos] of COLECCIONES) {
    for (const [indice, datos] of elementos.entries()) {
      await pool.query(
        `insert into content_entries (key, type, draft, published, status, sort_order)
         values ($1, $2, $3::jsonb, $3::jsonb, 'published', $4)
         on conflict (key) do update set draft = $3::jsonb, published = $3::jsonb, status = 'published'`,
        [`${coleccion}.demo-${String(indice)}`, coleccion, JSON.stringify(datos), indice]
      );
    }
  }

  const total = CONTENIDO.length + COLECCIONES.reduce((suma, [, e]) => suma + e.length, 0);
  console.log(`Contenido de ejemplo publicado: ${String(total)} entradas.`);
} finally {
  await pool.end();
}
