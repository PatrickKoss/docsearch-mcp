## 1. Scaffold `deploy/ansible/` skeleton

- [x] 1.1 Create `deploy/ansible/` with `ansible.cfg`, `site.yml`, `inventory.example/hosts.yml`, `group_vars/all.yml` (non-secret defaults), and a `group_vars/all/vault.yml.example` documenting required secrets.
- [x] 1.2 Add `deploy/ansible/requirements.yml` (Galaxy collections: `community.docker`, `community.crypto`, `community.general`, `ansible.posix`) and `deploy/ansible/requirements.txt` (pinned `ansible-core`, `molecule`, `molecule-plugins[docker]`, `ansible-lint`, `psycopg[binary]`).
- [x] 1.3 Add `.gitignore` entries for `deploy/ansible/.venv/`, `deploy/ansible/.vault_pass`, and `deploy/ansible/*.retry`.
- [x] 1.4 Add `deploy/ansible/.ansible-lint` config and wire `ansible-lint` into a new Make target `ansible-lint`.

## 2. Variable validation and preflight

- [x] 2.1 In `site.yml`, add a pre_tasks block that asserts `db_engine in ["postgres", "vectorchord"]`, required secrets are defined, and `ansible_distribution` is Ubuntu 22.04 or Debian 12.
- [x] 2.2 Document all variables in `group_vars/all.yml` with inline comments (engine, image tags, ports, TLS mode, firewall CIDRs, backup target, VectorChord tuning knobs matching `src/shared/config.ts`).

## 3. `common` role

- [x] 3.1 Install base packages (`python3`, `python3-pip`, `ca-certificates`, `curl`, `gnupg`, `ufw`, `acl`, `unattended-upgrades`).
- [x] 3.2 Apply minimal sysctl hardening (swap, vm.overcommit_memory=1 for Redis-style workloads is *not* needed here — keep defaults; add a comment explaining why).
- [x] 3.3 Configure UFW: default deny incoming, allow SSH from `admin_cidrs`, allow 5432/tcp from `db_client_cidrs` (empty list means loopback only). Enable UFW at the end.

## 4. `docker` role

- [x] 4.1 Add Docker's official apt repo (distribution-aware), install `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin`.
- [x] 4.2 Write `/etc/docker/daemon.json` with `log-driver: json-file` and `log-opts` for rotation (max-size 50m, max-file 5); handler restarts `docker.service` on change.
- [x] 4.3 Enable and start `docker.service`; ensure it starts on boot.

## 5. `tls` role

- [x] 5.1 Implement `tls_mode: selfsigned` using `community.crypto.openssl_privatekey`, `x509_certificate`, and `x509_certificate_request` to produce a CA + server cert under `/etc/ssl/docsearch-db/` with `mode: 0600`.
- [x] 5.2 Implement `tls_mode: letsencrypt` using `community.crypto.acme_certificate` with pluggable DNS provider (default Cloudflare); install a systemd timer that runs `certbot renew --deploy-hook "docker kill --signal=SIGHUP docsearch-db"` weekly.
- [x] 5.3 Implement `tls_mode: disabled`: fail loudly unless `allow_insecure: true` is set; even then, keep `hostssl` preferred in `pg_hba.conf`.
- [x] 5.4 Render a `pg_hba.conf` template: `local all all peer`, `host all all 127.0.0.1/32 scram-sha-256`, `hostssl all <db_app_user> <db_client_cidrs> scram-sha-256`, `host all all 0.0.0.0/0 reject`.

## 6. `database` role

- [x] 6.1 Map `db_engine` to pinned image + extension list via a `vars/` file (postgres → `pgvector/pgvector:pg16`, vectorchord → `tensorchord/vchord-postgres:pg16-v0.2.2`).
- [x] 6.2 Create `/var/lib/docsearch-db/` owned by the container Postgres uid with `mode: 0700`.
- [x] 6.3 Render `postgresql.conf.d/` overrides including TLS paths, `listen_addresses`, `shared_buffers`, and (for VectorChord) the tuning knobs.
- [x] 6.4 Launch the container via `community.docker.docker_container` with `restart_policy: unless-stopped`, env vars for superuser, bind mounts for data + TLS + config, exposed port, and healthcheck (`pg_isready`).
- [x] 6.5 Post-start task: wait for `pg_isready`, then `CREATE ROLE <db_app_user>` (idempotent), `GRANT` appropriate privileges, `CREATE DATABASE`, and `CREATE EXTENSION` per engine. Use `community.postgresql.postgresql_*` modules over the superuser socket inside the container via `docker exec`.
- [x] 6.6 Ensure the post-start tasks are idempotent (re-running reports `changed=0`).

## 7. `backup` role

- [x] 7.1 Write `/usr/local/bin/docsearch-db-backup.sh` (dump via `docker exec ... pg_dump -Fc`, write to `backup_local_dir`, prune older than `backup_retention_days`, optional `aws s3 cp` when `backup_s3_bucket` set).
- [x] 7.2 Install a systemd service + timer (`docsearch-db-backup.service`, `.timer`) scheduled at `backup_schedule` (default `02:30:00`).
- [x] 7.3 Install `awscli` only when `backup_s3_bucket` is set.
- [x] 7.4 Verify the first run by invoking the service once in a handler (flushed at end of play) and asserting a dump file exists.

## 8. Molecule test scenario

- [x] 8.1 Add `deploy/ansible/molecule/default/molecule.yml` with a platform matrix: `geerlingguy/docker-ubuntu2204-ansible` and `geerlingguy/docker-debian12-ansible`, both privileged with `/sbin/init`.
- [x] 8.2 Add `deploy/ansible/molecule/default/converge.yml` that sets `tls_mode: selfsigned`, a test vault with safe passwords, and includes `site.yml`.
- [x] 8.3 Add `deploy/ansible/molecule/default/vault.yml` (ansible-vault encrypted with `molecule/default/.vault_pass` — test-only, committed) containing `db_superuser_password`, `db_app_user`, `db_app_password`.
- [x] 8.4 Add `deploy/ansible/molecule/default/verify.py` that:
      - Reads the self-signed CA from the target container.
      - Opens a `psycopg` connection with `sslmode=verify-ca` and the app user, runs `SELECT 1`.
      - Asserts wrong-password fails with auth error.
      - Runs extension round trip: `CREATE EXTENSION vector` (and `vchord` when engine=vectorchord), creates a `vector(1536)` table, inserts a row, builds an index, runs a k-NN query, asserts the row returns.
      - Asserts `docsearch-db-backup.timer` is active and `docsearch-db-backup.service` one-shot produces a valid `pg_dump -Fc` archive (`pg_restore --list` exits 0).
- [x] 8.5 Parameterize the scenario by `db_engine` so the matrix covers both engines on both distributions (4 cells total).
- [x] 8.6 Configure Molecule to fail on non-idempotent tasks (default behavior; confirm via a deliberate test).

## 9. Make targets and CI

- [x] 9.1 Add `ansible-test` Make target: creates `deploy/ansible/.venv`, installs `requirements.txt`, runs `molecule test` from `deploy/ansible/`.
- [x] 9.2 Add `ansible-lint` Make target: runs `ansible-lint` against `deploy/ansible/`.
- [x] 9.3 Add `.github/workflows/ansible.yml`: triggers on pushes/PRs that touch `deploy/ansible/**`, sets up Python + Docker, runs `make ansible-lint` and `make ansible-test`.
- [x] 9.4 Ensure `make lint` and the Husky pre-commit hook are unchanged — `deploy/ansible/` is not covered by TS/ESLint/Prettier and must not be added to their include globs.

## 10. Documentation

- [x] 10.1 Write `deploy/ansible/README.md` sections: prerequisites, quickstart (both engines), variables reference table (generated from defaults), `ansible-vault` workflow, TLS / certbot setup, firewall tuning, backup + restore, upgrade procedure, troubleshooting, known limitations.
- [x] 10.2 Add a "Deployment" section to the root `README.md` that links to `deploy/ansible/README.md` and states that SQLite remains the default for local dev.
- [x] 10.3 Add a short paragraph to `CLAUDE.md` (development notes) telling contributors how to run `make ansible-test` locally and what it covers.

## 11. Polish and verification

- [x] 11.1 Run `make ansible-lint` and `make ansible-test` locally on Ubuntu 22.04 and Debian 12 matrix; fix any findings. (requires Docker with cgroup v2)
- [x] 11.2 Run the Husky pre-commit flow (`pnpm format:check`, `pnpm lint`, `pnpm typecheck:src`) and confirm it's unaffected by the new directory.
- [x] 11.3 Dry-run the quickstart against a fresh local VM (or cloud-init container) to catch README drift.
- [ ] 11.4 Open PR; ensure the new GitHub Actions job runs green on both engines × both distributions.
