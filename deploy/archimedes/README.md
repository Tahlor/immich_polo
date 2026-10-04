# Archimedes deployment artifacts

These artifacts were exercised on **Archimedes** on 2026-10-04 for issue #18.
The API infrastructure is deployed; media integration remains gated by
#11–#13. See that issue for exact SHA, CI, timestamps and sanitized evidence.

- `immich-polo.service` — systemd service template.
- `immich-polo.env.example` — non-secret environment shape. Proposed port `13060` must be checked for availability before use.
- `nginx-polo.conf.example` — direct HTTPS reverse-proxy example with large streamed uploads and video Range support.
- `immich-polo-backup.service` / `.timer` — daily online SQLite backup on local disk.

## Expected host paths

- repository: `/home/ubuntu/Projects/immich_polo`
- environment: `/etc/immich-polo/immich-polo.env`
- live SQLite: `/var/lib/immich-polo/polo.sqlite`

Before starting the service:

```bash
cd /home/ubuntu/Projects/immich_polo
npm ci
npm run check
sudo install -d -o ubuntu -g ubuntu -m 0700 /var/lib/immich-polo
sudo install -d -m 0700 /etc/immich-polo /var/backups/immich-polo
```

Install the environment and systemd unit using the normal Archimedes change process, then validate the unit before enabling it. The service command uses the compiled API (`node dist/server.js` through the workspace `start` script), not `tsx watch`.

`npm run check` includes the build. Node 24.16.0/npm 11.13.0 from `/usr/bin`
passed on this host; the repository minimum remains Node 22.14.0.
Create `/etc/immich-polo/immich-polo.env` as root, mode `0600`, using the
example's non-secret configuration and independently generated secrets:
`POLO_REGISTRATION_SECRET` needs at least 12 characters, and
`POLO_CREDENTIAL_KEY` is base64 for 32 random bytes. Never overwrite an
existing credential key during an update. Keep
`IMMICH_ALLOWED_BASE_URLS=http://127.0.0.1:2283` in production.

```bash
sudo install -m 0644 deploy/archimedes/immich-polo.service /etc/systemd/system/
sudo install -m 0644 deploy/archimedes/immich-polo-backup.service deploy/archimedes/immich-polo-backup.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/immich-polo.service /etc/systemd/system/immich-polo-backup.service /etc/systemd/system/immich-polo-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now immich-polo.service immich-polo-backup.timer
curl -fsS http://127.0.0.1:13060/health
curl -fsS http://127.0.0.1:13060/ready
```

The unit sets `UMask=0077`, makes the repository read-only to the runtime,
and permits writes only to its local data directory. Install/check/build
happen outside the service sandbox. Never enable the service after a failed
check. A successful `/ready` verifies SQLite, not the Immich contract.

## Direct HTTPS nginx

DNS for `polo.taylorarchibald.com` resolves directly to Archimedes
(`144.24.9.80`); no Cloudflare upload proxy is used. On first installation,
install only the first HTTP server block from `nginx-polo.conf.example` as
`/etc/nginx/sites-available/immich-polo`, symlink it into `sites-enabled`,
run `sudo nginx -t`, then reload. Obtain the certificate:

```bash
sudo certbot certonly --webroot -w /var/www/html -d polo.taylorarchibald.com --non-interactive --agree-tos --keep-until-expiring
```

Then install the complete example. Before each nginx edit, make a timestamped
backup of the existing file. Reload only after `sudo nginx -t` passes.
The certificate renews through the host's existing Certbot timer. The API
uses Polo bearer auth with no SSO gate; the nginx upstream stays loopback.
The route has 8 GiB body allowance, request/response buffering disabled,
explicit Range/If-Range forwarding and one-hour proxy read/send timeouts.

Upload URLs additionally perform a body-free nginx subrequest to Polo's
`GET /auth/me`, forwarding the bearer header. This is Polo session validation,
not Universal SSO. An invalid session is rejected before upload bytes are
sent upstream. It fixes an observed race where an early API `401` caused
nginx's ongoing body write to fail with a broken pipe and expose `502`.
The internal subrequest is not publicly accessible. The API still checks
thread membership, connection ownership and exact media authorization.

`/debug/version` serves `/var/www/immich-polo/version.json`, created at each
deployment with public fields `app=immich_polo`, `build_id`, exact `git_sha`,
and `server_utc` (deployment timestamp, not a live clock). Create the directory
mode `0755` and JSON mode `0644`. Update the file only after the recorded SHA
is built and running. No secrets or account data belong there.

```bash
curl -fsS https://polo.taylorarchibald.com/health
curl -fsS https://polo.taylorarchibald.com/ready
curl -fsS https://polo.taylorarchibald.com/debug/version
```

This deploys **API only**. The default web export was built for verification
but is not served: its localhost API default and browser playback behavior
have no production acceptance evidence. A browser client needs its own
production URL build and acceptance check. Native APK/device work stays in
#20/#14/#19. Hosting inventory is cross-linked from `Tahlor/webapps`.

## Backup and restore

Requires the installed `sqlite3` CLI. Daily backups run at approximately
03:10 UTC (up to five minutes randomized delay), with missed runs caught up
after boot. Backups use SQLite's online backup operation rather than copying
a live WAL database. Root-owned snapshots are mode `0640` inside
`/var/backups/immich-polo` (root:root mode `0750`, set by the backup script).
The environment backup is mode `0600`. No automatic deletion is configured;
the operator must monitor disk space and prune old snapshots deliberately.

Keep a matching root-only environment/key backup after setup or any deliberate
configuration change. Do not rotate the encryption key independently of the
database: encrypted Immich connections depend on it. The timer backs up the
database only. Environment backups contain secrets and must stay outside Git
and issue evidence.

```bash
sudo systemctl start immich-polo-backup.service
sudo install -o root -g root -m 0600 /etc/immich-polo/immich-polo.env /var/backups/immich-polo/immich-polo.env
```

Restore requires a maintenance stop; the script refuses an active service,
checks backup integrity, preserves the database/service-user ownership and
sets mode `0600`. It removes stale WAL/SHM files while stopped. No other
process may write the database during restore. Prepare the data directory
owned by `ubuntu` before restoring on a fresh host.

```bash
sudo systemctl stop immich-polo.service
sudo bash deploy/archimedes/restore-polo.sh /var/backups/immich-polo/polo-<timestamp>.sqlite
sudo systemctl start immich-polo.service
curl -fsS http://127.0.0.1:13060/ready
```

If restoring onto a fresh host, also restore the matching root-only environment
file before starting. On 2026-10-04 the original script reproduced a
`root:root 0640` restore unreadable by `ubuntu`; the fixed script restored
`ubuntu:ubuntu 0600`. A live snapshot with three disposable accounts and a
shared thread passed integrity and post-restore bearer/thread checks. Test
accounts were then removed. This does not prove decryption of real Immich
credentials, which are not present until #11–#13 permit connection setup.

The intended Immich connection value for this deployment is `http://127.0.0.1:2283`. It is saved through Polo's per-user Immich connection setup; it is not a global secret environment variable.

Keep `IMMICH_PROVIDER=unverified` until #11-#13 pass on the installed Immich v3 server. Once they pass, change it to `official-v3`, restart Polo, and execute the full provider-backed checks.

On 2026-10-04 the existing Immich guard independently stopped its stack after
mount/sentinel failures, and local Vitest worker-start timeouts occurred under
heavy host load. These are recorded in #18 alongside passing runs; do not
bypass the guard or treat CI as local runtime proof. Revalidate Immich mount,
sentinel, guarded service and local ping before continuing the media gates.

See [`../../docs/DEPLOYMENT_ARCHIMEDES.md`](../../docs/DEPLOYMENT_ARCHIMEDES.md) for topology and acceptance requirements.
