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
| **V3** | Router de organizaciones sin aislamiento (admin global opera sobre orgs ajenas) | Crítica | Contrato + backfill | 🔎 **Analizado, pospuesto** (§ V3) |
| **V4** | Portal — autoemisión de shareToken sobre proyecto ajeno | Crítica | Contrato | ✅ **Corregido** (`c09b935`) |
| **V5** | Portal — contraseña de invitado hardcodeada `DomotaiGuest` da acceso al CRM | Crítica | Contrato | ✅ **Corregido** (`c09b935`) |
| **V6** | `client-login` autentica sólo con email y devuelve shareTokens | Crítica | Contrato + SMTP | 🔎 **Analizado, pospuesto** (§ V6) |
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

## V3 — Aislamiento del router de organizaciones (analizado, pospuesto)

**Decisión (2026-08-26):** analizado a fondo pero **no implementado todavía**, por
ser el de mayor riesgo (cambia la semántica de `admin` de global a
por-organización, requiere backfill y commit gemelo en el frontend). Se documenta
aquí el análisis completo para retomarlo sin repetir el trabajo.

### El fallo estructural

El router de organizaciones es el único que **identifica el recurso por la ruta
(`req.params`) pero no valida nada contra esa identidad**. Monta sólo
`router.use(authenticate)` ([organization.routes.ts:10](../src/routes/organization.routes.ts)),
nunca `requireOrgMembership`, y el guard de rol (`requireAdmin`) resuelve
`Profile.role` **global**, no el rol en la organización del path.

### Desglose por endpoint

| Ruta | Guard actual | Qué permite hoy |
|---|---|---|
| `GET /` (index) | `authenticate` | OK — usa `findByUserId(profileId)`. |
| `GET /:id` (show) | `authenticate` | OK — único que comprueba membresía ([controller:36-39](../src/controllers/organization.controller.ts)). |
| `POST /` (create) | `authenticate` | Funciona, pero con dos bugs (ver abajo). |
| `PUT /:id` (update) | `authenticate` | **IDOR** — renombra/rebrandea cualquier org por id. |
| `DELETE /:id` (delete) | `authenticate, requireAdmin` | **Borrado cross-org** — admin de A borra la org B (requireAdmin mira rol global). |
| `GET /:orgId/members` | `authenticate` | **Fuga** — email, teléfono, rol y `commissionRate` de cualquier org. |
| `POST /:orgId/members` | `authenticate, requireAdmin` | **Escalada cross-org** — admin de A se añade a la org B. |
| `PUT /:orgId/members/:userId` | `authenticate, requireAdmin` | Cambia el rol de cualquier miembro de cualquier org. |
| `DELETE /:orgId/members/:userId` | `authenticate, requireAdmin` | Expulsa miembros de cualquier org. |

### Por qué los middlewares actuales no sirven

- **`requireOrgMembership` valida la _cabecera_, no el _path_.** Montado tal cual,
  un atacante pone su org en la cabecera (pasa el check) y la org víctima en la
  URL (lo que usa el controlador) → sigue siendo cross-org. La validación debe ir
  contra `req.params`.
- **`requireAdmin` resuelve `Profile.role` global** — un único valor por usuario,
  no distingue "admin en A" de "admin en B".
- **`requireOrgMembership` no publica el rol de la membresía**
  ([auth.middleware.ts:132](../src/middlewares/auth.middleware.ts)) — por eso no
  existe hoy un `requireOrgAdmin`.

### El bug latente de `create` (hay que arreglarlo o V3 se rompe a sí misma)

[`create`](../src/controllers/organization.controller.ts) (1) **no crea el
`OrganizationMember` del creador** y (2) guarda `createdBy: req.userId` (un
`User.id`) cuando la FK apunta a `Profile.id`. Hoy no molesta porque el rol es
global; con `requireOrgAdmin` el creador quedaría **sin poder administrar su propia
org**. El fix debe envolver `create` en `$transaction`: org +
`OrganizationMember{ userId: profileId, role: 'admin' }` + `createdBy: profileId`.

### Realidad de los datos (medido en la base viva, 2026-08-26)

- 2 organizaciones; 7 membresías (2 `admin`, 4 `member`, 1 `client`).
- **Cero admins se quedarían fuera:** todos los `Profile.role='admin'` ya tienen
  `OrganizationMember.role='admin'` en su org → el backfill sería no-op aquí.
- Ningún creador de org sin membresía.
- → En esta máquina el endurecimiento es seguro; backfill + flag son red de
  seguridad para producción.

### Diseño del fix (decisiones ya tomadas con el usuario)

- **Rol por-organización.** Nuevos `requireOrgMembershipFromParam(param)` (lee
  `req.params[param]`, publica `req.orgId` + `req.orgRole`) y `requireOrgAdmin`
  (exige `isAdminRole(req.orgRole)`), con válvula `ALLOW_GLOBAL_ADMIN_FALLBACK`
  que deja pasar al admin global con `WARN` mientras se verifica producción.
- **Rutas:** `PUT/DELETE /:id` y la gestión de miembros → guards por-org keyed al
  path; `GET /:id` y `GET /:orgId/members` → `requireOrgMembershipFromParam`.
  `GET /` y `POST /` se quedan con `authenticate` (no hay org en el path).
- **Arreglar `create`** en `$transaction` (incluido en este trabajo).
- **Backfill** idempotente (`OrganizationMember(admin)` por cada `Profile.role=admin`).

### Frontend (commit gemelo)

La UI de organizaciones/miembros debe decidir por `OrganizationMember.role`, no por
`Profile.role`, y manejar los nuevos 403.

**Retomar** cuando se pueda coordinar el commit gemelo del frontend.

## V6 — `client-login` sin segundo factor (analizado, pospuesto: bloqueado por el canal de email)

**Decisión (2026-08-26):** analizado, **no implementado**. El cierre correcto exige
un segundo factor por correo (enlace o código), y **SMTP no está configurado en
local** (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` vacíos en `.env`), así que no es
implementable ni verificable de punta a punta en esta máquina. Se pospone hasta
tener el canal de email operativo y poder coordinar el commit gemelo del frontend.

### El fallo

`POST /portal/client-login` ([portal.controller.ts](../src/controllers/portal.controller.ts))
toma el email como **única credencial** y devuelve los `shareToken` en claro. El
`shareToken` es un *bearer token*: quien conozca el email de un cliente obtiene
acceso a todos sus proyectos. Además, email con proyectos → `200`, email sin
proyectos → `404` = **oráculo de enumeración** de clientes. Mitigación parcial
existente: `authLimiter` 10/15 min por IP ([app.ts:78](../src/app.ts)).

### Por qué el flujo actual ES la vulnerabilidad

`ClientLogin.tsx` espera una respuesta síncrona: email → lista de proyectos + tokens
→ navegar al portal. Ese "email = token al instante" no se puede asegurar sin
probar posesión del email, lo que requiere un canal fuera de banda (correo). Tras
la corrección de V5, la invitación **ya manda el enlace directo del portal**, así
que la vía canónica del cliente es ese enlace; `client-login` es una comodidad de
"recuperar mis enlaces por email", que es justo lo que abre el agujero.

### Opciones evaluadas

| Opción | Cómo | Frontend | Schema | Testable local | Cierra el core |
|---|---|---|---|---|---|
| **A. Reenviar enlaces por email** (preferida) | `200 {sent:true}` sin tokens; reenvía los enlaces por correo | "revisa tu correo" | — | lógica sí, entrega no | ✅ |
| **B. Código OTP 6 dígitos** | email→código, código→lista+tokens | +2º paso | tabla nueva (migración) | lógica sí, entrega no | ✅ |
| **C. Solo matar el oráculo** | `200` también para email sin proyectos, pero sigue devolviendo tokens | — | — | ✅ end-to-end | ❌ (deja email=token) |

**Recomendación cuando se retome:** opción **A** (coherente con el modelo post-V5,
sin migración). La opción **C** queda disponible como mitigación inmediata sin tocar
SMTP si hiciera falta reducir el riesgo antes de tener el canal de email, entendiendo
que no cierra el fallo de fondo.

## Próximos pasos sugeridos

1. **Bloque IDOR aditivo** (tag, time-entry, lead, contact/company, dashboard,
   capacity) + **V7 (SSRF)** — todo backend-only, desplegable sin tocar frontend.
3. **V3 / V4–V6 / A7** — cambios de contrato mayores, requieren coordinación con
   el frontend y (V3) backfill de `OrganizationMember`.
