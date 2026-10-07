# Uploaded restore and operator recovery (S17)

Archives are unencrypted and contain account/MFA keys and private content. Keep
archives and retained recovery directories owner-only. Do not put archive bytes,
passwords, grants, TOTP seeds or recovery codes in logs, tickets or git.

## Normal restore on this deployment

1. Download a completed manual full backup and keep it protected off the VPS.
2. In Settings → Backup & Restore, select the `.pnb` file. Choose **Upload and
   validate backup**, then authenticate with the current password and a new
   TOTP/recovery code if enabled. Validation does not replace live data.
3. Inspect the capture time, schema, counts/statuses, attachments and MFA summary.
   To stop here, choose Discard validated upload. Application restart discards
   unconfirmed uploads; a reload of Settings alone retains their summary.
4. Choose **Replace application from backup**, acknowledge replacement, and
   authenticate again with the _current destination_ credentials. This replaces,
   not merges, DB/files/key material. Writes drain/refuse temporarily. Unrelated
   destination `.pnb` archives are kept and their verified catalog is rebuilt.
5. Wait for the login page. Sign in with the _archived account_ username, password and MFA
   or an unconsumed archived recovery code. Every old session is invalidated.
   Confirm important notes, Drafts, Trash and private downloads. Local browser
   drafts remain on that browser, not in the archive; recheck server versions
   before saving recovery edits. Never retry an uncertain replacement blindly.

If the response is lost, visit Login and verify the actual state with the archived
credentials. A successful restore has no active old session. A failed operation
before the durable commit restores the previous state. No public auth bypass or
separate archive password exists. Ordinary archive corruption/checksum/schema/
reference/space failures leave current application data unchanged.

## Fresh replacement VPS / different domain

Follow [DEPLOYMENT.md](DEPLOYMENT.md): load the compatible image, copy root
`docker-compose.yml`/`.env.example`, set destination ORIGIN and join the existing
Caddy network. DATA_PATH defaults to `./data`; container DATA_DIR is always `/data`.
Run docker compose up -d; startup initializes/migrates before HTTP.
Complete two-step browser setup within 60 minutes with a temporary account/preferences,
then follow the same uploaded restore workflow. Do not copy the source
machine's `.env`, domain, TLS keys or app binaries from an archive; they are not
included. After replacement use the archived credentials, not the temporary ones.
A real-domain independent-deployment drill remains the S18 release gate.

## Transport, disk and compatibility

- The image already sets adapter-node BODY_SIZE_LIMIT=64G. Minimal Caddy
  `reverse_proxy pandanote:3000` needs no body/header/timeout overrides (>1 GiB TLS
  restore verified). Other proxies must stream adequate size/time without buffering
  the whole archive. Image/file/JSON caps remain smaller and authoritative.
- Format v2 accepts the application's regular USTAR subset only. Format-v1
  pre-release archives are explicitly refused before extraction or replacement.
  It rejects PAX, GNU, links, devices, directories, duplicate/unexpected paths,
  bad checksums, missing entries, excessive expansion and unknown/newer schemas.
  Schema v2 is current; exact known baseline-v1 snapshots migrate through trusted
  SQL plus registered data steps on disposable staging. No supplied SQL or
  extension is executed. Restored setup must already be complete; archived
  username/email/title/language/timezone replace the destination preferences.
- `pre-upgrade/` is excluded from archives and outside the restore replacement
  set. The destination's existing copy is retained unchanged; it is not a copy of
  the restored archive and must not be mistaken for one.
- Safety bounds: 64 GiB compressed/payload, 100,000 total entries, 16 MiB manifest,
  <8 GiB individual payload, 4 KiB portable keys; at most 100,000 notes / 256 MiB
  total Markdown, 1 MiB per note, one million rows per ordinary table / 16 KiB
  non-body cells. Oversized archives refuse safely; use a future compatible app
  with reviewed higher bounds rather than weakening validation manually.
- Upload is streamed with exact byte counting and a ten-minute receive deadline.
  Format/extraction/staging has a ten-minute deadline; native read-only schema/
  integrity/Sharp static-image inspection/full decode has a hard sixty-second subprocess kill deadline.
  Semantic validation/reindexing yields to ordinary requests between bounded
  batches. Confirmation drains writers for at most thirty seconds and validates
  destination archive inventory with a ten-minute deadline before any swap.
- One staged candidate per process. Shared disk reservations protect the normal
  reserve: incoming archive plus expanded payload and conservative migration/
  search scratch; old data is retained by rename, not copied. Claims remain held
  until discard, replacement or restart. Nothing creates automatic backups.

## Crash recovery contract

The private `DATA_DIR/private/journals/<uuid>.json` record identifies generated
staging/rollback directories, never uploaded paths. The journal is fsynced before
any rename. Native DB handles close after a successful WAL truncate checkpoint;
DB directory, files directory and key file move separately, with parent-directory
fsync on Linux. The rollback set contains the original DB/WAL-safe state, files
and keys. Destination backups and deployment configuration are outside that set.

Startup performs recovery **before** DB/key reads and attachment cleanup:

- Any phase other than `verified`: restore each retained old part, discard staged
  data, then remove the journal last. A crash during rollback repeats safely.
- `verified`: the restored DB has reopened and passed integrity checks. Keep the
  whole new state and finish removing only this job's staged/rollback directories.
  A cleanup failure cannot be reported as a rollback. A new restore is refused
  until the pending journal is recovered by restart.
- Missing/invalid recovery material, multiple journals, unsafe filesystem paths or
  failing recovery: stop normal access; require operator inspection. Never guess
  by deleting a journal or generating new keys.

All old state is removed only after that durable verified commit point. Retained
rollback state is not a new manual backup and is not a substitute for a protected
archive downloaded elsewhere. Windows has no directory-fsync guarantee; Linux
native/process-kill tests exercise deployment durability semantics.

## If the app cannot start

1. `docker compose stop pandanote` and ensure no other SQLite writers. Inspect only safe
   filesystem names, free space/permissions and journal phase (not note/credential
   bytes). Fix disk reserve/ownership/mount or lock problems first. Do not run
   migrations or security reset against a mixed state.
2. Preserve the **entire private data directory**, including DB/WAL, files, key
   material, journal and both generated restore directories, on protected storage
   before manual repair. This is explicit operator intervention, not an automatic
   backup feature. Do not publish the retained set or upload it to diagnostics.
3. Restart the same compatible application. Its deterministic startup recovery
   runs before it opens persistence. If it recovers successfully, check Login and
   expected old/new state as above, then run a new manual backup if appropriate.
4. If recovery still refuses, retain everything and seek filesystem/operator
   repair. With the app stopped, follow the journal's generated identities and
   the state mapping in `server/backups/replacement.ts`: old parts are in
   `staging/restores/<rollbackStateId>/{db,files,key-material.json}`; new parts in
   `staging/restores/<stagedStateId>/state/`. Choose the **complete** old set for
   non-verified records, or the complete new set for verified records. Never mix
   DB/files/keys, overwrite portable keys, delete unrelated backups, or edit the
   journal to pretend success. A missing old part may already have been rolled
   back; verify against the preserved complete directory before making changes.
5. After repair/recovery, use normal archived credentials or run
   `docker compose run --rm pandanote reset-password` (locally:
   `npm run reset-password`) in an interactive terminal. It asks twice without
   echo, changes the password, disables MFA/recovery codes and revokes sessions
   atomically without touching notes/files/settings. It also works while the app
   runs, but refuses arguments, piped input, missing accounts and pending restore
   journals. Re-enable MFA afterwards. There is no web-based operator bypass.
