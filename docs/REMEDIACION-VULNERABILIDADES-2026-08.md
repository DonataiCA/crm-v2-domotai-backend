# Remediación de vulnerabilidades del backend — bitácora

> **Qué es esto.** Registro vivo de las correcciones de seguridad que se están
> aplicando sobre `crm-v2-domotai-backend`. Es el complemento de
> [AUDITORIA-CONFLICTOS-2026-08-17.md](../../docs/AUDITORIA-CONFLICTOS-2026-08-17.md): la
> auditoría dice *qué está roto*; este archivo dice *qué se ha arreglado, cómo y
> cómo se verificó*. Se actualiza a medida que se cierra cada hallazgo.

- **Inicio:** 2026-08-26
- **Rama de trabajo (backend):** `fix/idor-put-users-role-escalation`
- **Base:** `main` @ `5d0521d`
- **Suite de referencia:** 520 tests verdes · `typecheck` limpio

---

## Cómo se trabaja cada corrección

1. TDD estricto: test que reproduce la vulnerabilidad (RED) → fix mínimo (GREEN)
   → suite completa + `typecheck`.
2. Verificación end-to-end contra la API viva (`:3000`) con dos cuentas QA en
   organizaciones distintas cuando aplica (ver *Notas de entorno*).
3. Un commit por hallazgo (o grupo aditivo coherente), en la rama de fix.
4. Se marca aquí el estado y se enlaza el commit.

**Distinción de riesgo** que gobierna el orden:
- **Aditivo puro** (backend-only): no cambia contratos ni quita permisos a
  llamadas legítimas; sólo dejan de funcionar los accesos cruzados. Desplegable
  sin tocar el frontend.
- **Cambia contrato / quita permisos**: exige commit gemelo en
  `crm-v2-domotai-frontend` (mismo nombre de rama) y, en algún caso, backfill de
  datos. No desplegar el backend solo.

---

## Tablero de estado

Nomenclatura de hallazgos tomada de la auditoría (A1–A8) y de la revalidación del
2026-08-26 (V1–V7).

| ID | Hallazgo | Severidad | Riesgo del fix | Estado |
|----|----------|-----------|----------------|--------|
| **V1** | `PUT /users/:id` — toma de cuenta + autoescalada a admin | Crítica | Contrato (menor) | ✅ **Corregido** (`12c973e`) |
| **V2** | `GET /users` / `:id` — directorio global de todos los inquilinos | Alta | Contrato | ✅ **Corregido** (`d2c41a6`) |
| **V3** | Router de organizaciones sin aislamiento (admin global opera sobre orgs ajenas) | Crítica | Contrato + backfill | ⬜ Pendiente |
| **V4** | Portal — autoemisión de shareToken sobre proyecto ajeno | Crítica | Contrato | ✅ **Corregido** (`c09b935`) |
| **V5** | Portal — contraseña de invitado hardcodeada `DomotaiGuest` da acceso al CRM | Crítica | Contrato | ✅ **Corregido** (`c09b935`) |
| **V6** | `client-login` autentica sólo con email y devuelve shareTokens | Crítica | Contrato | ⬜ Pendiente |
| **V7** | SSRF semi-ciego en `POST /monitor/:apiKey/ingest` | Alta | Aditivo | ⬜ Pendiente |
| **IDOR-tag** | Módulo `tag` completo sin scoping por organización | Alta | Aditivo | ⬜ Pendiente |
| **IDOR-time** | `PATCH /time-entries/:id/stop` sin orgId | Media | Aditivo | ⬜ Pendiente |
| **IDOR-lead** | `restore`, `events`, `files`, `convert` sin scoping | Media | Aditivo | ⬜ Pendiente |
| **IDOR-cont/comp** | notas y file links de contact/company sin scoping | Media | Aditivo | ⬜ Pendiente |
| **IDOR-dash** | `weekly-digest` opera sobre una org arbitraria | Media | Aditivo | ⬜ Pendiente |
| **IDOR-cap** | `capacity` cuenta tareas de todas las orgs del perfil | Baja | Aditivo | ⬜ Pendiente |
| **A7** | Mass assignment (`{...req.body}` → Prisma sin schema) | Alta | Contrato (leve) | ⬜ Pendiente |
| **Menores** | github SSRF/path, CSV injection, JWT no rota en changePassword, etc. | Baja–Media | Mixto | ⬜ Pendiente |

---

## Correcciones aplicadas

### V1 — IDOR + escalada de privilegios en `PUT /users/:id` ✅

- **Commit:** `12c973e` (rama `fix/idor-put-users-role-escalation`)
- **Fecha:** 2026-08-26

**El fallo.** `PUT /users/:id` se montaba sólo con `authenticate`
([user.routes.ts:21](../src/routes/user.routes.ts)). El
controlador escribía `email`, `password` y `Profile.role` desde el body sin
comprobar propiedad ni rol. Consecuencia: cualquier usuario autenticado —incluido
un `client` del portal— podía (a) hacer `PUT` sobre su propia cuenta con
`{"role":"admin"}` y quedarse admin, o (b) hacer `PUT` sobre la cuenta de otro con
`{"password":"..."}` y tomarla.

**El fix.**
- Nuevo middleware `requireSelfOrAdmin`
  ([auth.middleware.ts](../src/middlewares/auth.middleware.ts)):
  la operación sólo procede si el solicitante es el dueño del recurso
  (`req.params.id === req.userId`, ambos `User.id`) o tiene rol admin; si no, 403.
- Guard anti-escalada en `UserController.update`
  ([user.controller.ts](../src/controllers/user.controller.ts)):
  sólo un admin puede cambiar `Profile.role`; un no-admin puede reenviar su rol
  actual (no-op) pero cambiarlo devuelve 403. La tolerancia al no-op evita romper
  un formulario de perfil que reenvíe el rol sin querer cambiarlo.
- `PUT /users/:id` → `authenticate, requireSelfOrAdmin, update`.
- **Refactor de apoyo:** se sustituyeron los tres `require('../config/prisma')`
  lazy por un `import` ESM arriba (el patrón del resto del repo). Era necesario
  para que `vi.mock` interceptara prisma y el controlador fuera testeable.

**Tests (nuevos):**
- `src/middlewares/auth.middleware.test.ts` — dueño pasa / ajeno→403 / admin pasa.
- `src/controllers/user.controller.test.ts` — no-admin escala→403 / admin cambia
  rol / no-admin reenvía su rol→no-op.

**Verificación end-to-end** (API viva, cuenta `qa.client@domotai.test`):

| Caso | Antes | Ahora |
|------|-------|-------|
| Cliente se auto-escala a `admin` | funcionaba | **403** `Only an admin can change a user role.` |
| Cliente edita cuenta ajena (password) | funcionaba | **403** `You can only modify your own account.` |
| Cliente edita su propio `fullName` | 200 | **200** (flujo legítimo intacto) |

**Alcance / límites (a propósito, son otras fases):**
- "Admin" aquí es `Profile.role` **global**, no el rol dentro de la organización.
  Un admin global aún puede editar usuarios de otra org → se cierra con V3.
- `GET /users` era un directorio global → **cerrado en V2** (ver abajo).

**Frontend (pendiente, commit gemelo):** el formulario del propio perfil no debe
enviar `role` (reenviar el mismo rol funciona, pero cambiarlo dará 403).

### V2 — Directorio global de usuarios en `GET /users` y `GET /users/:id` ✅

- **Commit:** `d2c41a6` (rama `fix/idor-put-users-role-escalation`)
- **Fecha:** 2026-08-26

**El fallo.** `GET /users` y `GET /users/:id` se montaban sólo con
`authenticate`, sin scoping por organización: devolvían el id, email, teléfono,
proveedor de auth y rol de **todos los inquilinos**. Era, además, la fuente de
UUIDs que hacía práctica la toma de cuentas de V1.

**El fix.**
- `UserRepository.findAll` y `count`
  ([user.repository.ts](../src/repositories/user.repository.ts)) aceptan
  `organizationId` en `filters` y añaden el filtro de membresía
  `profile: { organizationMembers: { some: { organizationId } } }`. Ojo con la
  convención #1: `OrganizationMember.userId` apunta a `Profile.id`, y la relación
  inversa en `Profile` se llama `organizationMembers`.
- `UserRepository.findById(id, organizationId?)` usa `findFirst` con ese filtro
  cuando se pasa org (devuelve `null` si el usuario no es miembro); sin org
  mantiene el `findUnique` global para uso interno.
- Controlador: `index` y `show` pasan `req.orgId`; `show` responde 404 si el
  repositorio no lo encuentra dentro de la org.
- Rutas: `GET /` y `GET /:id` pasan a `authenticate, requireOrgMembership, ...`
  (ahora exigen `X-Organization-Id`).

**Tests (nuevos):**
- `src/repositories/user.repository.test.ts` — findAll/count filtran por
  membresía; findById acota por org o mantiene búsqueda global sin org.
- `src/controllers/user.controller.test.ts` — index reenvía `req.orgId`; show→404
  cross-org.

**Verificación end-to-end** (dos orgs QA: ORG_A Domotai / ORG_B Contoso):

| Caso | Antes | Ahora |
|------|-------|-------|
| `GET /users` con ORG_A | 7 usuarios (todos los inquilinos) | **6**, sólo miembros de ORG_A |
| `GET /users` con ORG_B | idéntico listado global | **1**, sólo `qa.beta` |
| `GET /users/<id de ORG_B>` con cabecera ORG_A | devolvía el perfil | **404** |
| `GET /users` sin `X-Organization-Id` | 200 | **400** |

**Alcance / límites (a propósito):**
- No hay `?scope=all` para superadmin: el listado es siempre por organización. Si
  hiciera falta una vista global, se añade después como escape reservado a admin.
- El flujo de invitación de miembros que usaba `GET /users` como buscador por
  email se resuelve con el endpoint `GET /organizations/:orgId/candidates` (fase
  4.4), aún pendiente.

**Frontend (pendiente, commit gemelo):** el interceptor ya manda
`X-Organization-Id`, así que las llamadas normales siguen funcionando; verificar
cualquier uso de `GET /users` que asumiera alcance global o no enviara la cabecera.

### V4 + V5 — Portal: autoemisión de shares y cuenta invitado hardcodeada ✅

- **Commit:** `c09b935` (rama `fix/idor-put-users-role-escalation`)
- **Fecha:** 2026-08-26

**Los fallos.** Las 3 rutas de share del portal
([portal.routes.ts:17-19](../src/routes/portal.routes.ts)) se montaban sólo con
`authenticate`:
- **V4** — `shareProject` no validaba que el `projectId` fuera de la organización
  (tomaba el `organizationId` de la cabecera cruda) → cualquiera emitía un share
  sobre un proyecto ajeno. `deleteShare` revocaba por id **sin filtro** (share de
  cualquier org). `getShares` filtraba por una cabecera no validada.
- **V5** — dentro de `shareProject`, si el email no existía se autocreaba un
  `User`+`Profile`+`OrganizationMember` con la contraseña fija `'DomotaiGuest'`,
  que permitía `POST /users/login` al CRM completo (facturas, leads, CSVs) y de
  ahí escalar vía V1.

**El fix.**
- Las 3 rutas pasan a `authenticate, requireOrgMembership, ...` (publican
  `req.orgId` validado).
- `shareProject` ([portal.controller.ts](../src/controllers/portal.controller.ts)):
  exige `project.findFirst({ id: projectId, organizationId: req.orgId })` → 404 si
  no es de la org; usa `req.orgId`; `createdBy` pasa a `req.user.profileId`
  (convención #1, la FK apunta a `Profile.id`).
- **Se elimina el bloque de autocreación de cuenta** (V5). El cliente accede por
  el `shareToken` (el portal es público por enlace: `viewPortal`,
  `addGuestComment`, `createGuestTask`, `updateGuestTask` no requieren cuenta). El
  email de invitación (`sendClientInvitation`) deja de mandar credenciales y manda
  el **enlace de share**; se quita el import de `bcrypt`, ya sin uso.
- `getShares` usa `req.orgId`. `deleteShare` → `updateMany({ id, organizationId:
  req.orgId, revokedAt: null })`, `count===0` → 404.

**Datos:** 0 cuentas invitado en la base (nada que migrar). `sendOrgInvitation`
(invitación de equipo, que sí crea cuenta legítima) queda intacto.

**Tests (nuevos):** `src/controllers/portal.controller.test.ts` — share
cross-org→404 sin crear el registro / share propio→201 / no se crea User ni
OrganizationMember aunque el email sea nuevo (V5) / deleteShare cross-org→404.

**Verificación end-to-end** (dos orgs QA):

| Caso | Resultado |
|------|-----------|
| share sobre proyecto de mi org | **201**, `shareUrl` sin credenciales |
| share sobre proyecto de otra org (cabecera de la mía) | **404** |
| login con `DomotaiGuest` del email recién invitado | **401** (no hay cuenta) |
| acceso al portal por el enlace, sin login | **200** |
| deleteShare propio / repetido | **204** / **404** |
| share sin `X-Organization-Id` | **400** |
| cuentas invitado creadas en BD | **0** |

**Frontend (pendiente, commit gemelo):** la pantalla de invitación pasa de
"credenciales" a "enviamos un enlace"; el cliente deja de entrar por
`/users/login`. Las llamadas de share ya mandan `X-Organization-Id`.

---

## Notas de entorno (para reproducir/verificar)

- API en `http://localhost:3000`, base `domotaicrm` (Postgres del sistema, `:5432`).
- Cuentas QA (seed `npm run seed:qa`), contraseña común `QaDomotai2026!`:
  `qa.admin@domotai.test` (admin, ORG_A), `qa.client@domotai.test` (client, ORG_A),
  `qa.beta@contoso.test` (admin, ORG_B — para probar aislamiento cross-org).
- `POST /users/login` tiene rate limit de 10/15 min por IP: sacar el token **una
  vez** y reutilizarlo, no sondear el login.
- `cuidado`: los exploits de V4/V5 **escriben** en la base (crean User/Share).
  Recargar con `npm run seed:qa` si se ensucia.

## V3 — pospuesto

El aislamiento del router de organizaciones (rol admin por-organización) quedó
**analizado pero pospuesto** por decisión explícita (2026-08-26): es el de mayor
riesgo (cambia la semántica de `admin` de global a por-organización, necesita
backfill y coordinación con el frontend). El análisis completo —desglose por
endpoint, por qué `requireAdmin` mira la columna equivocada y el diseño del fix—
está en el historial de la sesión. Retomar cuando se pueda coordinar el commit
gemelo del frontend.

## Próximos pasos sugeridos

1. **Bloque IDOR aditivo** (tag, time-entry, lead, contact/company, dashboard,
   capacity) + **V7 (SSRF)** — todo backend-only, desplegable sin tocar frontend.
3. **V3 / V4–V6 / A7** — cambios de contrato mayores, requieren coordinación con
   el frontend y (V3) backfill de `OrganizationMember`.
