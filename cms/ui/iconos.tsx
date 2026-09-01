// isomorphic: solo presentación. Un mapa de nombres a componentes de dibujo, sin estado ni
// acceso a nada del servidor.
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Eye,
  History,
  Images,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Monitor,
  Pencil,
  Moon,
  Plus,
  Send,
  Settings2,
  Smartphone,
  Sun,
  TriangleAlert,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';

/**
 * Los iconos del panel, en un solo sitio (spec 11 §5, ADR-801).
 *
 * ## Por qué un módulo y no `import { Trash2 }` en cada componente
 *
 * Por tres cosas, y la tercera es la que de verdad importa:
 *
 * 1. Cambiar de librería es tocar **este fichero**, no veintitrés.
 * 2. La guarda de T-215-2 y T-215-3 mira un sitio, y sabe cuál.
 * 3. **El nombre queda en español y describe el papel, no el dibujo.** `Icono.publicar` dice qué
 *    significa; `Send` dice qué se ve. El día que publicar deje de ser un avión de papel, cambia
 *    una línea de aquí y no hay que buscar qué `Send` era cuál.
 *
 * ## Y por qué se pinta con un componente en vez de usar el de Lucide directamente
 *
 * Porque así **no se puede pintar un icono sin decidir si significa algo**. Es el caso T-215-6, y
 * dejarlo a la disciplina no funciona: un icono sin `aria-hidden` que repite la palabra de al
 * lado hace que un lector de pantalla lea «papelera Eliminar», y eso no se ve mirando la
 * pantalla. Aquí el tipo lo exige: o lleva `etiqueta`, o es decorativo y se oculta.
 *
 * ## La importación es con nombre, y hay test
 *
 * `import * as Icons from 'lucide-react'` mete las seis mil y pico piezas del índice en el
 * paquete. Es un cambio de una línea que no rompe nada, no lo detecta `typecheck` ni `lint`, y
 * solo se notaría en el presupuesto de JavaScript **después** de estar dentro.
 */
const DIBUJOS = {
  // Las secciones del menú.
  contenido: LayoutGrid,
  imagenes: Images,
  personas: Users,
  ajustes: Settings2,

  // Los tres estados de una sección. **Los tres tienen forma distinta**, no solo color: quien no
  // distingue el ámbar del jade tiene que poder leer el estado igual (ADR-802).
  publicado: CircleCheck,
  conCambios: CircleDot,
  sinPublicar: CircleDashed,

  // Las acciones.
  publicar: Send,
  escribir: Pencil,
  subir: Upload,
  eliminar: Trash2,
  anadir: Plus,
  revertir: Undo2,
  volver: ArrowLeft,
  historial: History,
  verPrevia: Eye,
  subirEnLista: ChevronUp,
  bajarEnLista: ChevronDown,
  cerrar: X,

  // La cabecera.
  cuenta: UserRound,
  salir: LogOut,
  modoClaro: Sun,
  modoOscuro: Moon,

  // Avisos y espera.
  alerta: TriangleAlert,
  esperando: LoaderCircle,

  // Los tamaños de la vista previa.
  escritorio: Monitor,
  movil: Smartphone,
} as const;

export type NombreDeIcono = keyof typeof DIBUJOS;

export interface IconoProps {
  readonly de: NombreDeIcono;
  /**
   * El nombre accesible, **solo si el icono significa algo por sí mismo**.
   *
   * Sin él, el icono es decorativo y se oculta al lector de pantalla. Ese es el caso normal en
   * este panel: casi todos los iconos van al lado de la palabra que dicen, y anunciarlos sería
   * leerlo todo dos veces.
   */
  readonly etiqueta?: string;
  /** En píxeles. 20 es el de la interfaz; 16 el de una línea de texto. */
  readonly tamano?: number;
  readonly className?: string;
}

export function Icono({ de, etiqueta, tamano = 20, className }: IconoProps) {
  const Dibujo = DIBUJOS[de];

  return (
    <Dibujo
      // `shrink-0` en el propio icono y no en cada sitio que lo usa: dentro de un flex con texto
      // largo, un icono sin esto se aplasta hasta volverse un garabato. Pasa solo en textos que
      // desbordan, así que se descubre tarde y en una pantalla concreta.
      className={`shrink-0 ${className ?? ''}`}
      size={tamano}
      // 1,75 en vez del 2 de fábrica: sobre cristal, un trazo grueso se lee como una mancha.
      strokeWidth={1.75}
      aria-hidden={etiqueta === undefined ? true : undefined}
      role={etiqueta === undefined ? undefined : 'img'}
      aria-label={etiqueta}
    />
  );
}
