# Deployment

Self-host the NslNotes web backend in a container. Notes are served from a directory you point at (local disk for now; SMB support is in the Phase C plan).

## Prerequisites

- Docker (or Podman) + `docker compose`
- For home use: a dedicated Linux VM or unprivileged LXC

## Initial password

```sh
docker run --rm -i nslnotes:latest hash-password <<< 'your-password-here'
```

Copy the printed `$argon2id$...` string. Put it in a `.env` next to `docker-compose.yml`:

```
NSLNOTES_PASSWORD_HASH=$argon2id$v=19$m=19456,t=2,p=1$...
```

## Running

```sh
docker compose up -d
docker compose logs -f
```

Browse to `http://<host>:3000/`. The first screen is the login — enter the password you hashed.

Data layout:

| Path in container | Purpose                                              | Bind in compose |
| ----------------- | ---------------------------------------------------- | --------------- |
| `/data`           | Notebooks root. Point at a host dir or NAS mount.    | `./data:/data`  |
| `/config`         | `settings.json` and session state. Survives rebuilds.| `./config:/config` |

## Environment variables

| Var                        | Required | Purpose |
| -------------------------- | -------- | ------- |
| `NSLNOTES_PASSWORD_HASH`   | yes      | Argon2id PHC hash. Generate via `hash-password` subcommand. |
| `NSLNOTES_DISABLE_AUTH=1`  | no       | Skip auth entirely. Only for local testing — never expose. |
| `NSLNOTES_TRUST_PROXY=1`   | no       | Set when behind a reverse proxy. Honors `X-Forwarded-For` for rate limiting and emits `Secure` cookies. |

## Proxmox LXC

To run the container inside an unprivileged LXC on Proxmox:

1. Create the LXC with `Unprivileged: yes` and at least 1 GB RAM.
2. On the Proxmox host, edit the container config (`/etc/pve/lxc/<id>.conf`):
   ```
   features: nesting=1,keyctl=1
   ```
3. Install Docker inside the LXC:
   ```sh
   apt update && apt install -y docker.io docker-compose
   ```
4. Clone the repo, copy `docker-compose.yml` + `.env`, `docker compose up -d`.

libsmb2 (Phase C) runs in userspace over TCP 445 — no additional LXC caps needed when that lands.

## TLS (optional)

For anything beyond LAN, terminate TLS at a reverse proxy. A minimal Caddy sidecar:

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

- `docker compose logs nslnotes` — startup prints notes dir, settings path, auth state.
- Healthcheck failures → `curl http://localhost:3000/api/health` returns `{"status":"ok"}` when up. If not, check port bind collisions.
- `401` on every request after login → the session cookie isn't being sent. Check that the reverse proxy forwards cookies and that `NSLNOTES_TRUST_PROXY=1` is set when over HTTPS.
- Forgotten password → stop the container, re-generate the hash, update `.env`, `docker compose up -d`. Existing sessions don't persist across the restart (tower-sessions memory store), so you re-login.
