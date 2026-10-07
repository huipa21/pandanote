# PandaNote — operations guide (target)

Status: **SS06 deployment artifacts implemented; validation status in [PROGRESS.md](PROGRESS.md).**
Use this guide for the new minimal deployment. SS07 will replace the historical
`ops/DEPLOYMENT.md` and reconcile the remaining documentation. Public VPS and
final release verification are not claimed.

You need: a Linux server with Docker (Compose v2), an existing Caddy container on a
Docker network (here `proxynet`), and a DNS name pointing at the server.

## 1. Build the image (on your computer)

From a clean, committed checkout with Node 24 and Docker or Podman:

```sh
npm run image:build -- --platform linux/amd64     # or linux/arm64
docker image save -o pandanote-image.tar pandanote:latest
# Podman records its local namespace in the archive. Export it explicitly:
# podman save --format docker-archive -o pandanote-image.tar localhost/pandanote:latest
scp pandanote-image.tar docker-compose.yml .env.example user@server:~/pandanote/
```

## 2. Install (on the server)

```sh
cd ~/pandanote
docker image load -i pandanote-image.tar
# ONLY for a Podman-built archive (loaded as localhost/pandanote:latest):
# docker tag localhost/pandanote:latest pandanote:latest
cp .env.example .env
nano .env                      # set ORIGIN=https://notes.example.com
docker compose up -d
```

Add PandaNote to Caddy (Caddyfile of your existing Caddy container), then reload Caddy:

```caddyfile
notes.example.com {
	reverse_proxy pandanote:3000
}
```

Open `https://notes.example.com`. You are sent to **Setup**:

1. Username, email, password (8–128 characters), re-enter password → **Create account**.
2. Site title, language, timezone → **Finish setup**.

Setup is open for 60 minutes after PandaNote starts. If it timed out:
`docker compose restart pandanote` and open the site again.

Afterwards the site always opens the login page. Recommended next steps in
Settings: turn on two-step verification and download a backup.

### What is where

| Path on server       | Contents                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml` | The PandaNote service (no changes needed).                                                                                      |
| `.env`               | `ORIGIN`, optional `DATA_PATH`, `PUID`, `PGID`. Keep it private.                                                                |
| `./data/`            | Everything PandaNote stores: database, files, keys, backups, pre-upgrade copy. Owned by PUID:PGID (default 1000:1000), private. |

The database is created and upgraded automatically every time the container starts.
There is no migrate or setup command.

### Settings in `.env`

| Variable             | Required | Default            | Meaning                                                      |
| -------------------- | -------- | ------------------ | ------------------------------------------------------------ |
| `ORIGIN`             | yes      | —                  | Public address, e.g. `https://notes.example.com`.            |
| `DATA_PATH`          | no       | `./data`           | Folder on the server for all PandaNote data.                 |
| `PUID` / `PGID`      | no       | `1000` / `1000`    | Owner of the data folder and the server process (not 0).     |
| `PANDANOTE_IMAGE`    | no       | `pandanote:latest` | Image to run; set to `pandanote:<version>` to pin/roll back. |
| `DISK_RESERVE_BYTES` | no       | max(5 GiB, 10 %)   | Free space PandaNote keeps untouched.                        |

If your Caddy network is not called `proxynet`, change the two `proxynet` lines in
`docker-compose.yml`.

## 3. Everyday commands

| Task         | Command                                        |
| ------------ | ---------------------------------------------- |
| Status       | `docker compose ps` (shows healthy/unhealthy)  |
| Logs         | `docker compose logs --tail=100 pandanote`     |
| Restart      | `docker compose restart pandanote`             |
| Stop / start | `docker compose stop` / `docker compose up -d` |
| Disk usage   | Settings → Storage, or `du -sh data/*`         |

Logs never contain note text, passwords, codes or tokens.

## 4. Backups

Settings → Backup & Restore → create, then **download** the backup to another
machine. A backup kept only on the server does not survive losing the server.
There are no automatic backups.

Stopping the app while a backup is being created cancels that backup; create it
again after the restart.

## 5. Upgrade

1. Download a fresh backup (Settings).
2. Keep the current image for rollback:
   `docker tag pandanote:latest pandanote:previous`
3. Load the new image (`docker image load -i pandanote-image.tar`), retag a
   Podman-built archive as in section 2, then `docker compose up -d`.

On start, PandaNote saves a copy of the database in `data/pre-upgrade/` and then
applies any database changes. If anything fails, nothing is changed and the error is
in `docker compose logs pandanote`.

## 6. Roll back an upgrade

Only right after an upgrade: anything written since the upgrade is lost.

```sh
docker compose down
sudo mv data/db data/db.after-upgrade
sudo mkdir data/db
sudo cp data/pre-upgrade/pandanote.sqlite data/db/pandanote.sqlite
echo 'PANDANOTE_IMAGE=pandanote:previous' >> .env
docker compose up -d
```

PandaNote fixes file ownership on start. When everything works, delete
`data/db.after-upgrade`. Later on, use a downloaded backup instead (section 4 and
Settings → Restore).

## 7. Forgot password / lost two-step verification

```sh
docker compose run --rm pandanote reset-password
```

It shows your username, asks for a new password twice, turns off two-step
verification and signs out all devices. Notes and files are not touched. It works
while PandaNote is running. Turn two-step verification on again afterwards.

## 8. Someone else completed setup / start over

If a stranger created the account before you (or you want an empty instance):

```sh
docker compose down
sudo rm -rf data          # deletes ALL PandaNote data on this server
docker compose up -d
```

Then open the site and complete setup within 60 minutes.

## 9. Move to a new server

Install on the new server (section 2), complete setup with any temporary account,
then Settings → Restore with your downloaded backup. Sign in with the account from
the backup. The new server keeps its own `ORIGIN`.

## 10. Rebuild the search index (rarely needed)

```sh
docker compose stop pandanote
docker compose run --rm pandanote reindex
docker compose start pandanote
```

## 11. Troubleshooting

| Log message / symptom                            | Fix                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `ORIGIN must be set` / `must be https`           | Set `ORIGIN=https://…` in `.env`, `docker compose up -d`.                                            |
| `network proxynet not found`                     | Use the network your Caddy container is on (see section 2).                                          |
| `Database upgrade failed at migration N`         | Data is unchanged. Run the previous image (`PANDANOTE_IMAGE=pandanote:previous`) and report the log. |
| `Not enough free space for the pre-upgrade copy` | Free disk space (the log says how much) and start again.                                             |
| `upgraded by a newer PandaNote`                  | You started an older image. Use the newer one, or roll back (section 6).                             |
| `created by a pre-release PandaNote`             | Move the old `data` folder away and start fresh (section 8).                                         |
| Setup page says "timed out"                      | `docker compose restart pandanote`.                                                                  |
| 502 from Caddy                                   | `docker compose ps`; check that PandaNote is healthy and on Caddy's network.                         |

## 12. Notes for advanced users

- Run only one PandaNote container per data folder.
- The container starts as root only to prepare `./data`, then runs as PUID:PGID with
  no extra privileges. Don't add `user:` to the Compose file.
- Keep `./data` on local disk (not a network share).
- Another reverse proxy works if it terminates HTTPS, forwards `Host`, sets
  `X-Forwarded-For` to the single client IP and does not cap upload size below your
  backup size.
