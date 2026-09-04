# Casa Albor — canonical database bootstrap

## Status (T0.3 ACL follow-up, 2026-09-04)

The repository is the canonical bootstrap for **new, isolated databases**. It is
not a migration-history mirror of production. The local replay of L1–L12 plus
T0.3 succeeds. The authorized six private functions and seven sequences are
corrected. **BRANCHING READY — GO to prepare an explicitly authorized staging
environment.** Full local replay, real DB/Auth/concurrency tests and the ACL
readiness gate pass. The 244 effective app function/sequence checks match
production. This readiness is not authorization to create staging or deploy.

## Why 13 files versus 52 production history entries

The first four files were introduced already consolidated in Git commit
`ba181f9923ab5f4c883d4ae0a0822ee0133e9a53`. No accessible commit proves a later
formal squash of 52 previously versioned files. T0.2 compared their contents and
the live catalogs; counts are not evidence of missing application objects.

| Canonical local file | Production history mapping |
| --- | --- |
| L1 `202607150001_core_operational_schema.sql` | Entries 1–6, `20260716013408`–`20260716013556`: core, calendar and updated-at triggers |
| L2 `202607150002_rbac_and_rls.sql` | Entries 7–32, `20260716013633`–`20260716014319`: Auth, RBAC, RLS and grants |
| L3 `202607150003_atomic_operations.sql` | Entries 35–42, `20260716022148`–`20260716022558`: operations/RPC/helpers |
| L4 `202607150004_automatic_audit.sql` | Entries 43–44, `20260716022753`/`20260716022812`: triggers correspond; local redaction needed correction |
| L5 `202607160001_inventory_configuration.sql` | `20260716053829_inventory_configuration` |
| L6 `202607160002_public_site_configuration.sql` | `20260716064239_public_site_configuration` |
| L7 `20260716072901_media_gallery.sql` | Actual media catalog; remote `20260717010141_media_gallery` contains only `select 1` |
| L8 `20260830035543_reservation_management.sql` | Same version/name |
| L9 `20260830045844_stay_operation_guards.sql` | Same version/name |
| L10 `20260830162604_payment_cash_management.sql` | Same version/name |
| L11 `20260903034900_unified_wellness_capacity.sql` | Same version/name |
| L12 `20260903035847_consolidate_payments_read_policies.sql` | Same version/name |
| T0.3 `20260904001947_bootstrap_parity_and_security.sql` | New local-only migration; NOT applied to production |

Remote entries 33/34 harden `rls_auto_enable` and move `btree_gist` to
`extensions`. They are not standalone local files. Non-owner seed associations
are explicit locally and match the current production matrix; their original
remote history is not fully represented by the owner-only seed entry.

**The 52 remote records are not a usable canonical bootstrap.** In particular,
do not regenerate media from the remote no-op. L7 is the complete media DDL,
including eight categories, six-MiB limit, RLS, explicit grants, bucket and
Storage policies. Replay and catalog comparisons verify that choice.

Never edit/rename an applied migration or change its timestamp. Future changes
must be new additive migrations. Do not repair/rewrite production history or
copy remote history files over this baseline. A future production release needs
a separately reviewed history-aware procedure; ordinary push against this
unreconciled historical mapping is not authorized by this document.

## Decisions and findings

### C1: redacted audit

T0.3 copies the current production `private.capture_sensitive_change()` read-only
definition, preserving its trigger signature, SECURITY DEFINER, empty search
path, consumers and legitimate audit metadata. It removes exactly these fields
from trigger row snapshots:

| Table | Removed fields |
| --- | --- |
| guests | first_name, last_name, phone, phone_normalized, email, document_type, document_number, nationality_code, birth_date, emergency_contact |
| profiles | display_name, phone |
| payments | amount, reference, note, void_reason |
| internal_notes | body |
| reservations | internal_summary, nightly_rate, agreed_total |
| housekeeping_tasks | notes |
| maintenance_issues | description |

The real tests inspect INSERT and UPDATE snapshots. Explicit business audit
events are separate: `register_payment` deliberately still records its amount
in a minimal event. T0.3 does not claim that all audit data is wholly redacted,
nor invent new removals from production's policy.

### H1: deterministic payment errors

The current adapter `app/admin/data/supabase-operations-repository.ts` maps
`22023`/`23514` to HTTP 422, NOT_AUTHORIZED/42501 to 403 and
RESERVATION_NOT_PAYABLE to 409. The operation route passes these responses and
the UI displays the safe error message. Financial tests expect invalid amount
and overpayment rejection. Therefore L3's explicit implementation is canonical;
T0.3 repeats it with CREATE OR REPLACE, without altering the application.

| Case | Canonical SQLSTATE / message | HTTP |
| --- | --- | --- |
| Invalid numeric amount / nonpositive | 22023 / INVALID_PAYMENT | 422 |
| Missing, cancelled or rejected reservation | 22023 / RESERVATION_NOT_PAYABLE | 409 |
| Overpayment | 23514 / PAYMENT_EXCEEDS_BALANCE | 422 |
| No permission | 42501 / NOT_AUTHORIZED | 403 |

The API's Zod schema remains responsible for its typed payload (finite positive
amount, UUID, valid method). No new broader RPC input contract is invented.
Production still has its old P0001/cast-error behavior. This one body difference
is **INTENTIONAL PENDING PROD MIGRATION**, not an instruction to update it now.

### M1: platform versus application

On a newly started Supabase CLI 2.116.0 / PostgreSQL 17.6 platform, before any
application migration:

- `pgcrypto` 1.3 is already in `extensions`: PLATFORM-MANAGED prerequisite.
- `btree_gist` is absent: APP-MANAGED dependency, installed by L1. Real advisors
  detected `extension_in_public`; T0.3 moves it to `extensions` without replacing
  its OIDs or exclusion constraints. Version 1.7 matches production.
- `public.rls_auto_enable` is absent: hosted PLATFORM-MANAGED safeguard, MISSING
  locally but not an app dependency. All 31 public app tables explicitly enable
  RLS. Do not copy hosted event triggers/internals blindly.

### Scoped ACL correction — closed

Corrected diagnosis: the six private helpers inherited PostgreSQL's implicit
PUBLIC EXECUTE, not global direct API-role grants. The broad defaults previously
reported without a namespace belonged to storage, not the global scope.
L3 creates these helpers after L2's revocation of then-existing private functions.
The local public-sequence defaults also grant UPDATE to API roles; L11 revokes
USAGE/SELECT but leaves UPDATE. Production object ACLs are stricter.

T0.3 now explicitly revokes PUBLIC/anon/authenticated access to
`private.enforce_rate_limit(text,integer,interval)`, `private.hostel_today()`,
`private.log_activity(text,text,uuid,text,jsonb)`,
`private.log_audit(text,text,uuid,jsonb,jsonb)`,
`private.reservation_balance(uuid)` and `private.reservation_paid_total(uuid)`.
It revokes only UPDATE from PUBLIC/anon/authenticated/service_role on
`public.wellness_booking_code_seq` and `public.wellness_booking_events_id_seq`.
The owners and legitimate RPC/RLS paths are preserved; authenticated still has
EXECUTE on has_permission/is_active_staff, but not require_permission.

No ALTER DEFAULT PRIVILEGES was added: a private-schema revoke cannot cancel
implicit global PUBLIC EXECUTE; a global postgres change affects other schemas
and does not cover a different future creator. Use explicit object ACLs and
regression gates. Never assume an unqualified default-ACL row is global.

After separate explicit authorization, T0.3 also revokes only service_role UPDATE
on activity_logs_id_seq, audit_logs_id_seq, reservation_code_seq,
reservation_status_history_id_seq and room_status_history_id_seq (all public).
The five-entry follow-up changes nothing else in the SQL: all owners, other
roles, USAGE/SELECT and definitions remain intact. Real RPC operations still
generate reservation codes and all four identity histories/logs.

The 244-entry contract now matches production: the first correction removed 30
effective accesses and this follow-up removes exactly five more, with no
expansion. `acl-contract.json` contains 27 allowed entries; `readiness` passes.
Both `test` and `replay` enforce the readiness check after final cleanup.
Platform defaults still differ for future public sequences, an explained
EXPECTED platform difference rather than residual object-ACL drift. Explicit
per-object ACLs and readiness must continue guarding every new migration.

See [the complete ACL closure report](T0.3-bootstrap-parity-report.md) for exact
before/after ACLs, consumers, tests and the local commit boundary. No production change,
history repair, push or staging creation follows from this baseline.

## Reproducible local procedure (Windows PowerShell / Linux CI)

Prerequisites: Node 22, npm, running local Linux Docker engine. No global CLI
installation required: the wrapper reuses exactly 2.116.0 from npm's cache or
invokes `npx --yes supabase@2.116.0`. No app dependencies were added.

```powershell
npm ci
npm run db:local -- start
npm run db:local -- reset
npm run db:local -- check
npm run test:db
npm run db:local -- advisors
npm run db:local -- readiness
npm run db:local -- stop
```

`npm run db:local -- replay` combines start, local reset, schema assertions and
real DB tests and the final ACL readiness gate. It must fail closed on an environment with any linked marker,
database selector or remote Docker endpoint. It accepts no DB URL, arbitrary
CLI command, project ref, linked flag or extra argument. Tests connect only to
the fixed local container over its Unix socket. `.env.local` is never loaded by
the harness, and access tokens are removed from child CLI environments.

The local `project_id` is an isolated Docker namespace, **not a Supabase remote
project ref**. Ports are API 55421 / database 55422. Never expose this development
stack to the Internet; the CLI publishes local ports on host interfaces, so use
the host firewall and stop the stack after tests. No passwords or keys belong
in this repository, CI logs or reports.

Expected final bootstrap: roles 5, permissions 26, role_permissions 65,
room_services 6, bucket hostel-media. Exactly four legitimate audit rows record
owner media/wellness permission seed associations. All other app tables, Auth
users, rate-limit records and Storage objects are empty. No production rows are
copied. Transactional tests rollback; concurrent tests use committed synthetic
LOCAL fixtures and always reset in finally. A failure before finally/forced
process kill requires another guarded reset before claiming an empty bootstrap.

Real Auth regression uses only the fixed local API and an ephemeral synthetic
password generated in local Postgres. Login/JWT/RLS/refresh/logout pass; keys and
tokens stay in memory and are not logged. All Auth fixtures are reset afterward.

The migration catalog query in `tests/database/catalog.sql` is read-only. Compare
stable names, definitions, effective grants and structural seed codes, never
generated UUIDs or production business data. Hashes are comparison aids, not
proof of semantic equivalence; normalize whitespace in function bodies and
review every actual difference.

## Gate before staging

1. Preserve the reviewed explicit ACLs, including reservation_code_seq
   authenticated USAGE/SELECT and the RLS helper EXECUTE exceptions.
2. For subsequent migration changes, repeat a clean replay, ACL tests and catalog check;
   require the separate readiness gate to PASS before any release decision.
3. Require real C1/H1/RLS/RBAC and both concurrency tests to pass; business empty.
4. Require lint, TypeScript, build, npm test, npm audit and git diff --check.
5. Review the new migration/manifest and commit only local scoped changes.
6. Obtain separate authorization for a new staging project and Vercel setup.
   Do not connect staging to production DB credentials or seed real data.
7. Bootstrap the explicitly identified empty staging environment using the
   canonical files; confirm catalogs/grants and configure only staging secrets.

No staging/project/branch creation, production migration, history repair, push,
PR, merge or deploy is authorized by these procedures.

References: [Supabase local workflow](https://supabase.com/docs/guides/local-development/cli-workflows),
[migration management](https://supabase.com/docs/guides/local-development/database-migrations),
[extension placement advisor](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
