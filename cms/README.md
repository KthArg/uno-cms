El CMS: todo lo que no es "la landing de este proyecto de ejemplo".

| Directorio  | Qué hay                                                           |
| ----------- | ----------------------------------------------------------------- |
| `core/`     | Configuración, esquemas, lectura de contenido. `server-only`      |
| `db/`       | Cliente Drizzle y esquema. `server-only`                          |
| `auth/`     | Autenticación, bootstrap e invitaciones. `server-only`            |
| `security/` | Tokens, límite de peticiones, auditoría, subidas. `server-only`   |
| `actions/`  | Server Actions, todas por el mismo envoltorio                     |
| `ui/`       | Componentes del panel                                             |
| `preview/`  | Contrato del lado cliente: `useContent`, `RichText`, el proveedor |

## Los dos ficheros sueltos de aquí, y por qué no están en un subdirectorio

`links.ts` y `routes.ts` viven en la raíz **a propósito**: los necesitan los dos lados de la
frontera de SPEC §7.1, y meterlos en cualquiera de los árboles protegidos los haría inalcanzables
desde donde hacen falta.

- **`links.ts`** decide si un destino de enlace es aceptable. Lo usan el esquema al guardar y el
  renderizador de la landing **al pintar**, que corre en el navegador. Estuvo en `cms/core/` con
  `server-only` hasta M5; sacarlo fue ADR-500, y lo que se ganó es que no haya dos
  implementaciones de la misma decisión de seguridad — una implementación no puede divergir de
  sí misma.
- **`routes.ts`** dice qué rutas del panel se sirven sin sesión y cuáles no se indexan. Lo
  consultan el middleware —que corre en el runtime edge, donde un módulo `server-only` no
  carga— y los tests estructurales que vigilan que ninguna página se quede sin guard.

Que estén fuera **no es esquivar la frontera**: lo que esa frontera protege son credenciales,
consultas y sesiones. Estos dos son predicados puros y listas de direcciones que el navegador ya
puede deducir pidiéndolas.
