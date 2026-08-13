# Configuración del repositorio

## `branch-protection.json`

Protección de la rama `main`, versionada para que sea auditable y reaplicable. No se
aplica sola: GitHub no lee este fichero. Para aplicarla o restaurarla:

```sh
gh api -X PUT repos/KthArg/uno-cms/branches/main/protection \
  --input .github/branch-protection.json
```

Para comprobar que lo aplicado coincide con lo versionado:

```sh
gh api repos/KthArg/uno-cms/branches/main/protection
```

Qué garantiza, y por qué (regla de proceso 2 del proyecto):

| Ajuste                                                | Efecto                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `required_status_checks.contexts: ["ci"]`             | Sin el check `ci` en verde no hay merge. `ci` es el job agregador de `ci.yml`, así que cubre todos los demás sin tener que enumerarlos aquí |
| `required_status_checks.strict: true`                 | La rama debe estar al día con `main` antes de mergear                                                                                       |
| `required_pull_request_reviews` con 0 aprobaciones    | Obliga a pasar por PR. El 0 es forzoso: GitHub no permite aprobar el PR propio y solo hay un mantenedor (ADR-104)                           |
| `required_conversation_resolution: true`              | No se mergea con hilos de revisión abiertos                                                                                                 |
| `enforce_admins: true`                                | Ni el dueño del repositorio puede hacer push directo (ADR-105; la decisión contraria se probó y falló)                                      |
| `allow_force_pushes: false`, `allow_deletions: false` | El historial de `main` no se reescribe ni se borra                                                                                          |
| `required_linear_history: true`                       | Coherente con el merge por squash, que es la única estrategia habilitada                                                                    |

Ajustes del repositorio que **no** están en este fichero porque pertenecen a otro endpoint
de la API (`PATCH /repos/:owner/:repo`): solo squash merge habilitado, borrado automático
de la rama al mergear, y auto-merge disponible.
