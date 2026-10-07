# Simplify setup — specification

Status: **approved, partially implemented (SS01 migration, SS02 startup/proxy, SS03 account/setup/login and SS04 language/title/General; common gates blocked by SS05 archives).**
Actual status: [PROGRESS.md](PROGRESS.md). Decisions and rationale: [DECISIONS.md](DECISIONS.md).

## 1. Principles

- Deploying PandaNote needs: the image, `docker-compose.yml`, a `.env` with one
  required value (`ORIGIN`), and `docker compose up -d`. Nothing else.
- Everything else is done in the browser: account first, then basic preferences.
- Database creation, schema upgrades and data migrations run automatically at startup,
  before the server accepts requests. No operator command is ever required for them.
- Keep existing protections that cost the user nothing: private data folder, non-root
  server process, hashed passwords, rate limits, same-origin checks, crash-safe restore.

## 2. Setup states and routing

The server derives one state from the database at each request:

| State      | Condition                                            |
| ---------- | ---------------------------------------------------- |
| `new`      | No account exists.                                   |
| `account`  | Account exists, `settings.setupCompletedAt` is null. |
| `complete` | Account exists, `setupCompletedAt` is set.           |

| Request                                 | `new`                         | `account`                                              | `complete`                           |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------ | ------------------------------------ |
| Any page (`/`, `/login`, `/notes/…`, …) | 303 → `/setup`                | signed in: 303 → `/setup/preferences`; else → `/login` | normal rules (signed out → `/login`) |
| `/setup`                                | Step 1 form                   | signed in: → `/setup/preferences`; else → `/login`     | signed in: → `/`; else → `/login`    |
| `/setup/preferences`                    | → `/setup`                    | signed in: Step 2 form; else → `/login`                | → `/` (signed in) or `/login`        |
| `/login`                                | → `/setup`                    | Login form; success → `/setup/preferences`             | Login form; success → `/`            |
| JSON/API/files (non-setup)              | 409 `{code:"setup_required"}` | signed in: 409 `setup_required`; else 401              | normal rules                         |
| `/health`                               | unchanged readiness           | unchanged                                              | unchanged                            |

Visiting the domain root therefore goes to setup before setup, and to login (or the
timeline when signed in) afterwards. Static build assets stay public.

## 3. Step 1 — Create account (`/setup`)

Fields, in order: **Username**, **Email**, **Password**, **Re-enter password**, button
**Create account**. Labels/autocomplete: `username`, `email`, `new-password` ×2.

| Field    | Rule                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Username | Trim surrounding spaces, lowercase. 3–32 characters from `a–z 0–9 . _ -`. Stored lowercase; login is case-insensitive.                                                               |
| Email    | Trim surrounding spaces. Required, ≤254 characters, `local@domain` syntax (one `@`, non-empty parts, domain has a dot). Stored as entered (trimmed). Not verified; no email is sent. |
| Password | 8–128 Unicode characters and ≤1024 UTF-8 bytes. No trimming, normalization or complexity rules.                                                                                      |
| Re-enter | Must equal Password exactly. Checked in the browser and again on the server.                                                                                                         |

- `POST /api/setup/account` with `{ username, email, password, passwordConfirm }`.
  Password hashing is unchanged (Argon2id). Account creation and the first session
  commit in one transaction; then the browser goes to `/setup/preferences`.
- If an account already exists (concurrent second attempt, or reload after a lost
  response), respond 409 `already_set_up`; the page tells the user to sign in.
- Existing per-IP setup rate limit applies.
- **Setup window:** setup is open for **60 minutes after the server process starts**
  while no account exists. The page says so. After that, the form is replaced by:
  "Setup has timed out. Restart PandaNote on the server to open it again
  (`docker compose restart pandanote`)." and the API answers 403 `setup_closed`.
  The window is in memory; every restart opens a new window. No token exists.
- Field errors appear next to the field; nothing typed is cleared on error except
  that a server error never echoes the password.

## 4. Step 2 — Preferences (`/setup/preferences`)

Requires the session created in step 1 (or a normal login). Fields:

| Field      | Default                                                                           | Rule                                                            |
| ---------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Site title | `PandaNote`                                                                       | Trimmed, 1–60 characters, no control characters. Plain text.    |
| Language   | Best match of the browser language among available languages, else English        | Must be one of the available languages (section 5).             |
| Timezone   | Browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), else `UTC` | Named IANA zone; same server validation as Settings → Calendar. |

- Button **Finish setup**; no skip button (all fields are prefilled).
- `POST /api/setup/preferences` saves site title, language and timezone and sets
  `setupCompletedAt` in one transaction, then goes to `/`. Repeating after
  completion returns 409 `already_set_up`.
- Theme and week start are **not** asked; they keep defaults (Follow system, Monday)
  and remain in Settings.
- If the user leaves after step 1, the next visit (after login if needed) returns here.

## 5. Language

- Available languages come from a code registry of translation catalogs:
  `en` (English) and `zh-CN` (简体中文). The setup and Settings pickers list exactly
  the registry, each in its own language. Adding a catalog adds an option.
- English is complete. **Simplified Chinese is partial in this change:** setup pages,
  login and MFA challenge, the navigation shell (sidebar, mobile drawer, headers),
  Settings → General and Settings → Account. Any missing string falls back to
  English individually. Settings shows "Translation in progress — some screens are
  shown in English." when a partial language is selected. Full translation is a
  later change.
- `<html lang>` reflects the active language. Public pages before setup completes
  use the browser's `Accept-Language` best match; after setup, all pages use the
  saved language. Note content is never translated or changed.

## 6. Site title

Shown in the browser tab (`<page> · <site title>`), the sidebar/mobile header brand
and the login page heading. Rendered as escaped text, truncated with an ellipsis
visually but with the full text available to assistive technology. It is public on
the login page after setup. Editable in Settings → General.

## 7. Accounts after setup

- **Login:** Username + Password, then the unchanged MFA challenge when enabled.
  Any failure shows one message: "Invalid username or password." Unknown usernames
  do equivalent password-verification work. Existing IP/account rate limits apply.
- **Settings → General:** site title, language (immediate save, no fresh auth).
- **Settings → Account:** username and email; saving requires fresh authentication
  (password, plus TOTP/recovery code if MFA is enabled), new scope `account-update`.
  Changing the username does not sign anyone out.
- **Password change** and `reset-password` use the 8–128 rule from section 3.
- Single account only; no registration after setup; no email sending.

## 8. Startup and database migrations

On every start (container, `npm start`, `npm run dev`), before any request is served:

1. Recover interrupted restore journals (unchanged).
2. Create the private data folders and key material if missing.
3. Create the database if missing and apply all pending migrations.
4. Initialize default settings if missing.
5. Start serving. `/health` stays 503 until this finishes.

Migrations:

- Each migration = trusted SQL (versioned, SHA-256 checked, contiguous) plus an
  optional **data step**: a TypeScript function registered for that version. SQL and
  data step of all pending versions run in **one IMMEDIATE transaction** together with
  the ledger update and integrity/foreign-key checks. Any failure rolls everything
  back; the app logs `Database upgrade failed at migration N (<name>); data unchanged.`
  (no note content) and exits without serving.
- Data steps are synchronous, deterministic, bounded, database-only. They may not
  touch files, the network or the clock beyond a fixed "now" passed in.
- **Pre-upgrade copy:** when an existing database has pending migrations, first write
  `data/pre-upgrade/` containing a consistent SQLite online backup (`pandanote.sqlite`) and
  `manifest.json` (from/to schema version, upgrading app version, time). Key material
  is not copied: migrations never change it.
  It replaces the previous copy atomically, is private (0700/0600), excluded from
  backup archives and restores, and shown in Settings → Storage. If there is not
  enough free space (copy size + disk reserve), do not migrate and do not start; log
  how much space is needed. Fresh databases get no copy.
  **SS01 implementation constraint:** portable Node cannot atomically exchange an
  existing nonempty directory. The first slice uses fsynced journaled rotation,
  retaining the previous copy until the new copy is durable and recovering before
  migration/startup. It is crash-safe but has a brief path-absence window, not a
  single atomic exchange. The literal atomic-replacement requirement remains an
  open clarification before SS01 can be marked done; see [PROGRESS.md](PROGRESS.md).
- A database with a newer schema than the app (downgrade) refuses to start:
  `This data was upgraded by a newer PandaNote. Use that version, or roll back with the pre-upgrade copy (see OPERATIONS.md).`
- Data from pre-release builds (old `0000_foundation…0004` history) refuses to start:
  `This data folder was created by a pre-release PandaNote and cannot be upgraded. Move it away and start with an empty folder.`
- Restoring a backup from an older **known** schema uses the same SQL + data steps on
  the isolated staging copy. Unknown/newer schemas are refused (unchanged rule).
- Only one app process may use a data folder (unchanged).

## 9. Deployment

### 9.1 `docker-compose.yml` (project root; the only Compose file)

```yaml
services:
  pandanote:
    image: ${PANDANOTE_IMAGE:-pandanote:latest}
    container_name: pandanote
    restart: unless-stopped
    env_file: .env
    volumes:
      - ${DATA_PATH:-./data}:/data
    networks:
      - proxynet

networks:
  proxynet:
    external: true # the Docker network your Caddy container is on
```

No `read_only`, `tmpfs`, `cap_drop`, `cap_add`, `security_opt`, `init`,
`stop_grace_period`, `healthcheck` (the image has one), logging options, static IPs,
published ports or one-off "ops" services.

### 9.2 `.env.example` (project root; the only env template)

```dotenv
# The web address of your notes site: https, no trailing slash.
ORIGIN=https://notes.example.com

# Optional
# DATA_PATH=./data   # folder on this server that holds all notes and files
# PUID=1000          # user and group that own the data folder
# PGID=1000
```

Still supported but not in the example: `PANDANOTE_IMAGE`, `BODY_SIZE_LIMIT`
(image default 64G), `DISK_RESERVE_BYTES`, `PORT`. Removed: `SETUP_TOKEN`,
`TRUSTED_PROXY_IPS`, `STOP_GRACE_PERIOD`, `PROXY_NETWORK`, `DOMAIN`, `EDGE_*`,
`APP_IP`, `HTTP(S)_PORT`, `BODY_SIZE_LIMIT_CADDY`, `CADDY_TLS_DIRECTIVE`,
`COMPOSE_PROJECT_NAME`, `PANDANOTE_TAG`. A leftover `SETUP_TOKEN` or
`TRUSTED_PROXY_IPS` is ignored with one startup notice (value never printed).

### 9.3 Container behavior

- Entry starts as root only to create/own the data folder for PUID/PGID (unchanged
  safety checks), then permanently becomes PUID/PGID, runs section 8, and `execve`s
  the server. Uses default Docker/Podman capabilities; the server ends with none.
- `DATA_DIR` inside the container is always `/data`, regardless of `.env`.
- Named maintenance commands: `reset-password`, `reindex` (section 9.5).
- SIGTERM: stop accepting requests, drain, close SQLite, exit 0 within Docker's
  default 10 s when idle. A running backup that is cut off is recorded as failed and
  can be created again; restore replacement remains journaled and recovers on start.

### 9.4 Reverse proxy and client IP

- Caddy site block is just `notes.example.com { reverse_proxy pandanote:3000 }` with
  PandaNote attached to Caddy's Docker network. No body-size or header options are
  required (Caddy has no default body limit and replaces untrusted `X-Forwarded-For`).
- Client IP for rate limits: if the TCP peer is loopback, RFC 1918, IPv6 ULA
  (`fc00::/7`) or link-local, use `X-Forwarded-For` when it is exactly one valid IP,
  the peer address when the header is absent, and reject with 400 when it is a
  list or invalid. Public peers: always the peer address.
- `ORIGIN` is still required in production, must be HTTPS except loopback, and is
  still used for same-origin and cookie checks.

### 9.5 `reset-password`

`docker compose run --rm pandanote reset-password` (locally: `npm run reset-password`).

- Needs an interactive terminal; refuses arguments, piped input and missing TTY.
- Prints the username, asks for the new password twice without echo (8–128 rule),
  then in one transaction: sets the password, turns off MFA and recovery codes,
  increments the security revision and deletes all sessions/challenges. Notes, files
  and settings are untouched. Prints the login URL from `ORIGIN`.
- Works whether the app is running or stopped. Refuses while a restore journal is
  pending, and when no account exists (points to the setup URL).
- Never logs or echoes the password.

`reindex` keeps its existing behavior; run it with the app stopped
(`docker compose stop pandanote && docker compose run --rm pandanote reindex && docker compose start pandanote`).

## 10. Superseded requirements

These earlier statements are replaced by this change:

- PRODUCT_SPEC §13: environment `SETUP_TOKEN` (43-char base64url, one-hour expiry,
  rotation) and "existing-Caddy deployment … trusted proxy, graceful shutdown window".
- PRODUCT_SPEC §2/§13 "single-user password authentication" → username + password.
- Minimum password length 12 → 8–128.
- ARCHITECTURE: `setup_tokens` table, `TRUSTED_PROXY_IPS` exact-IP trust, stopped-app
  `npm run db:migrate`, `npm run auth:setup-token`, `npm run auth:recover` stdin JSON,
  bundled Caddy `compose.yaml`, `ops/compose.external.yaml`, `ops/*.env.example`,
  hardened Compose options, migration history `0000_foundation`–`0004_tag_receipts`,
  backup format v1 and v4→v5 restore staging migration.
- ACCEPTANCE_TESTS "Container startup simplification" bullets about setup token,
  capability lists and "none is automatic" pre-upgrade backup.

Unchanged: manual full backup/restore (beyond format v2), MFA, sessions, notes,
search, release versioning and image build (`npm run image:build`).

## 11. Out of scope

Email sending/verification, password reset by email, multiple users, full zh-CN
translation, other languages, setup-time theme/week-start, automatic scheduled
backups, bundled Caddy deployment, migration of pre-release data or archives.
