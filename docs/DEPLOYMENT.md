# Deployment

Self-host the NslNotes web backend in a container. Notebooks can live on a local filesystem or on an SMB share — you configure them through the web UI after first boot.

## Prerequisites

- Docker (or Podman) + `docker compose`
- For home use: a dedicated Linux VM or unprivileged LXC

## Initial setup

Generate a password hash:

```sh
docker compose run --rm -i nslnotes hash-password <<< 'your-password-here'
```

Put the result in a `.env` next to `docker-compose.yml`:

```
NSLNOTES_PASSWORD_HASH=$argon2id$v=19$m=19456,t=2,p=1$...
```

The container runs as uid 1000 and needs to own `./config`. Create it with the right ownership before the first boot:

```sh
mkdir -p config
sudo chown 1000:1000 config
docker compose up -d
docker compose logs -f
```

Browse to `http://<host>:3000/`, log in, then on the SetupScreen enter either:

- a local path that exists inside the container (e.g. `/notes`, if you added a bind mount in compose), or
- an `smb://host/share/path` URL with the SMB username / password / domain.

The notebook (including any SMB credentials) is persisted in `config/settings.json`. Subsequent boots skip SetupScreen.

## Local-FS notebooks

To serve a notebook from the host filesystem, uncomment and edit the `./notes:/notes` line in `docker-compose.yml` and chown the host dir to uid 1000:

```sh
mkdir -p notes
sudo chown 1000:1000 notes
```

Then enter `/notes` as the folder path on the SetupScreen.

## SMB notebooks

The server speaks SMB2/3 directly via libsmbclient, so you do not need to mount the share on the host. On the SetupScreen:

- Folder path: `smb://nas.home.arpa/share/path` (or IP instead of hostname)
- SMB username / password: your NAS credentials
- Domain: leave blank for `WORKGROUP`

Credentials are stored in `config/settings.json` on the server — keep that directory private.

Multiple SMB notebooks with different credentials work: add each via the tab bar after the first one is configured. The server keeps one libsmbclient context per `(host, share)` and dispatches file operations per-request based on the path prefix.

File watching over SMB uses a polling loop (default 5s) — there is no inotify equivalent on the protocol. Changes from other clients show up within about a poll cycle.

## Environment variables

| Var                        | Required | Purpose |
| -------------------------- | -------- | ------- |
| `NSLNOTES_PASSWORD_HASH`   | yes      | Argon2id PHC hash. Generate via the `hash-password` subcommand. |
| `NSLNOTES_DISABLE_AUTH=1`  | no       | Skip auth entirely. Only for local testing — never expose. |
| `NSLNOTES_TRUST_PROXY=1`   | no       | Set when behind a reverse proxy. Honors `X-Forwarded-For` for rate limiting and emits `Secure` cookies. |

Notebook selection and SMB credentials are **not** environment variables — they live in `config/settings.json` and are edited via the UI.

## Testing SMB locally

`docker-compose.test.yml` spins up a Samba server alongside the nslnotes container, and `tests/fixtures/settings.smb.json` is a pre-seeded settings file pointing at it:

```sh
export NSLNOTES_PASSWORD_HASH="$(echo 'smbpass' | docker compose run --rm -i nslnotes hash-password)"
sudo chown 1000:1000 config
cp tests/fixtures/settings.smb.json config/settings.json

docker compose -f docker-compose.yml -f docker-compose.test.yml up -d
```

Log in with `smbpass` — the Samba notebook is preconfigured with credentials `alice / secret123`.

## Proxmox LXC

1. Create the LXC with `Unprivileged: yes` and at least 1 GB RAM.
2. On the Proxmox host, edit `/etc/pve/lxc/<id>.conf`:
   ```
   features: nesting=1,keyctl=1
   ```
3. Install Docker inside the LXC:
   ```sh
   apt update && apt install -y docker.io docker-compose
   ```
4. Clone the repo, copy `docker-compose.yml` + `.env`, and `docker compose up -d`.

libsmbclient speaks SMB over TCP 445 — no additional LXC caps needed.

## TLS (optional)

For anything beyond LAN, terminate TLS at a reverse proxy. Minimal Caddy sidecar:

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["443:443", "80:80"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
volumes:
  caddy_data:
```

`Caddyfile`:

```
notes.home.arpa {
  reverse_proxy nslnotes:3000
}
```

Then set `NSLNOTES_TRUST_PROXY=1` in `.env` so the backend emits Secure cookies.

## Troubleshooting

- `docker compose logs nslnotes` — startup prints the notebook list, settings path, and auth state. Look for `Notebooks: ...` to confirm what was loaded.
- Healthcheck failures → `curl http://localhost:3000/api/health` returns `{"status":"ok"}` when up.
- `Permission denied` on `settings.json` → the host `config` dir isn't owned by uid 1000. `sudo chown 1000:1000 config` and restart.
- `no SMB backend registered for host=... share=...` → the notebook was saved but registration failed. Logs usually give the reason (auth, unreachable host). Fix credentials via the UI, save, and the registry rebuilds.
- `401` on every request after login → the session cookie isn't being sent. Check that the reverse proxy forwards cookies and that `NSLNOTES_TRUST_PROXY=1` is set when over HTTPS.
- Forgotten password → stop the container, re-generate the hash, update `.env`, `docker compose up -d`. Existing sessions don't persist across the restart, so you re-login.
