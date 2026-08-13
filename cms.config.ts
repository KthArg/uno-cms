import { defineConfig, s } from '@/cms/core/config';

/**
 * El único fichero que se edita para modelar el contenido de la landing (SPEC §5.1).
 *
 * De aquí salen automáticamente los formularios del panel, la validación, los tipos que
 * consumen los componentes y el seed inicial. Cambiar un campo aquí **no** requiere
 * migración: el contenido vive como JSONB validado por esquema (ADR-003).
 */
export default defineConfig({
  siteName: 'Mi Empresa',

  // SINGLETONS: exactamente una instancia. Las secciones fijas de la landing.
  singletons: {
    hero: s.object({
      title: s.text({ label: 'Título principal', max: 120, required: true }),
      subtitle: s.text({ label: 'Subtítulo', max: 300, multiline: true }),
      ctaLabel: s.text({ label: 'Texto del botón', max: 40 }),
      ctaHref: s.link({ label: 'Enlace del botón' }),
      image: s.image({ label: 'Imagen de fondo' }),
    }),

    about: s.object({
      heading: s.text({ label: 'Encabezado', required: true }),
      body: s.richtext({ label: 'Contenido' }),
      visible: s.boolean({ label: 'Mostrar sección', default: true }),
    }),

    seo: s.object({
      title: s.text({ label: 'Título SEO', max: 60 }),
      description: s.text({ label: 'Descripción SEO', max: 160, multiline: true }),
      ogImage: s.image({ label: 'Imagen para redes' }),
    }),
  },

  // COLLECTIONS: N instancias ordenables.
  collections: {
    testimonials: {
      label: 'Testimonios',
      titleField: 'author',
      schema: s.object({
        author: s.text({ label: 'Nombre', required: true, max: 80 }),
        quote: s.text({ label: 'Testimonio', required: true, max: 500, multiline: true }),
        avatar: s.image({ label: 'Foto' }),
        rating: s.number({ label: 'Estrellas', min: 1, max: 5, integer: true }),
      }),
    },

    faqs: {
      label: 'Preguntas frecuentes',
      titleField: 'question',
      schema: s.object({
        question: s.text({ label: 'Pregunta', required: true }),
        answer: s.richtext({ label: 'Respuesta', required: true }),
      }),
    },
  },
});
