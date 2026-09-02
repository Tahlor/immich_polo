# Archimedes deployment artifacts

These files are templates for issue #18. The local agent must validate them on **Archimedes** before treating them as production configuration.

- `immich-polo.service` — systemd service template.
- `immich-polo.env.example` — non-secret environment shape. Proposed port `13060` must be checked for availability before use.
- `nginx-polo.conf.example` — direct HTTPS reverse-proxy example with large streamed uploads and video Range support.

## Expected host paths

- repository: `/home/ubuntu/Projects/immich_polo`
- environment: `/etc/immich-polo/immich-polo.env`
- live SQLite: `/var/lib/immich-polo/polo.sqlite`

Before starting the service:

```bash
cd /home/ubuntu/Projects/immich_polo
npm install
npm run check
npm run build
sudo install -d -o ubuntu -g ubuntu /var/lib/immich-polo
```

Install the environment and systemd unit using the normal Archimedes change process, then validate the unit before enabling it. The service command uses the compiled API (`node dist/server.js` through the workspace `start` script), not `tsx watch`.

The intended Immich connection value for this deployment is `http://127.0.0.1:2283`. It is saved through Polo's per-user Immich connection setup; it is not a global secret environment variable.

Keep `IMMICH_PROVIDER=unverified` until #11-#13 pass on the installed Immich v3 server. Once they pass, change it to `official-v3`, restart Polo, and execute the full provider-backed checks.

See [`../../docs/DEPLOYMENT_ARCHIMEDES.md`](../../docs/DEPLOYMENT_ARCHIMEDES.md) for topology and acceptance requirements.
