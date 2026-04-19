## Context

`docsearch-mcp` already supports three storage backends via `DB_TYPE`: `sqlite` (default, local file), `postgresql` (plain Postgres with `pgvector`), and `vectorchord` (Postgres + `vector` + `vchord` extension with IVFFlat-style indexing). `src/shared/config.ts` already exposes the VectorChord tuning knobs (`VECTORCHORD_RESIDUAL_QUANTIZATION`, `VECTORCHORD_LISTS`, `VECTORCHORD_SPHERICAL_CENTROIDS`, `VECTORCHORD_BUILD_THREADS`, `VECTORCHORD_PROBES`).

What is missing is an opinionated way to *operate* those backends. Today a user who wants to move off SQLite has to:
1. Find and pin a Postgres + extension image.
2. Mount volumes, pick ports, configure `pg_hba.conf` and TLS by hand.
3. Create a superuser + application user + database.
4. Open the firewall, set up backups, and make sure the container restarts on reboot.
5. Hope they remember everything next time.

The existing `docker-compose.yml` works for a local dev loop but isn't a production story — it skips TLS, backups, OS firewall, credential rotation, and has no tests that prove the deployed database is actually reachable by a client.

**Constraints**

- The deployment must stay runtime-identical for both engines so the same `DB_TYPE` / `POSTGRES_CONNECTION_STRING` env vars keep working with no code changes.
- Target OSes are mainstream server Linux: Ubuntu 22.04 LTS and Debian 12 are the committed baseline.
- Contributors run the test suite on laptops (Linux + WSL2); Molecule must work against local Docker, no cloud dependencies.
- Husky pre-commit runs `pnpm format:check`, `pnpm lint`, `pnpm typecheck:src` — the new `deploy/ansible/` tree must not leak Python/YAML into those checks.
- Secrets cannot be committed in cleartext; `ansible-vault` is the chosen vehicle.

**Stakeholders**

- Operators deploying to self-hosted VMs (primary audience).
- Developers running integration tests locally and in CI.
- Future contributors adding more engines or replicas.

## Goals / Non-Goals

**Goals:**

- One `ansible-playbook site.yml` command takes a fresh Ubuntu 22.04 / Debian 12 VM to a running, TLS-enabled Postgres or VectorChord container.
- The engine is swapped via a single variable (`db_engine: postgres` | `vectorchord`) without editing tasks.
- All production knobs (credentials, listen address, exposed CIDRs, TLS mode, backup target, VectorChord tuning) are variables with safe defaults.
- `make ansible-test` spins up a systemd-enabled Linux Docker container, runs the playbook against it, and asserts:
  - Container health.
  - TLS client connection with the application user.
  - `CREATE EXTENSION vector` / `vchord` succeeds when engine is `vectorchord`.
  - Vector insert + ANN query round trip.
  - Second playbook run is fully idempotent (`changed=0`).
- The same test matrix runs on GitHub Actions.
- A `deploy/ansible/README.md` walks an operator from zero to deploy, including vault setup, DNS/certbot prereqs, and upgrade/rollback.

**Non-Goals:**

- Cloud-provider-specific modules (AWS RDS, GCP Cloud SQL). This is for self-managed VMs.
- High-availability (streaming replication, Patroni, pgbouncer clusters). Single-node only; HA is a future change.
- Zero-downtime major-version upgrades. An upgrade is documented as "stop, snapshot, swap image, start."
- Kubernetes manifests. Already a separate concern.
- Managing the application (`docsearch-mcp` itself) on the same VM.
- Automated certificate bootstrap when the host has no public DNS — in that case the operator uses the self-signed fallback.

## Decisions

### 1. Ansible over alternatives (Terraform, shell scripts, docker-compose)

Ansible was chosen because the user explicitly asked for it and because the work is 80% configuration management on an already-provisioned VM (which is Ansible's sweet spot). Terraform is a poor fit — we aren't creating cloud resources. A bare `docker-compose.yml` hides host-level concerns (firewall, systemd, cert renewal cron). A shell script loses idempotence and the dry-run story.

**Alternatives considered**:
- Docker Compose + systemd unit: lighter but no idempotent config management, no built-in templating for `pg_hba.conf`, and the test story is weaker.
- Terraform + cloud-init: couples deployment to a cloud provider. Rejected per the "self-hosted VM" goal.

### 2. Directory layout: `deploy/ansible/` with role-per-concern

```
deploy/ansible/
├── README.md
├── ansible.cfg
├── requirements.yml          # Galaxy collections
├── requirements.txt          # ansible-core, molecule, molecule-plugins[docker], ansible-lint
├── inventory.example/
│   └── hosts.yml
├── group_vars/
│   └── all.yml               # safe defaults, vaulted file sits next to it
├── site.yml                  # entrypoint play
├── roles/
│   ├── common/               # packages, swap, sysctl, ufw
│   ├── docker/               # docker-ce install + daemon config
│   ├── database/             # image pull, volume, compose-less `community.docker.docker_container`
│   ├── tls/                  # certbot OR self-signed, writes /etc/ssl/docsearch-db/
│   └── backup/               # cron + pg_dump script + S3 / local target
└── molecule/
    └── default/              # scenario: converge, verify, idempotence
```

One role per concern keeps each under ~150 lines and makes the Molecule verify stage targeted. `database` does not include TLS or backup logic — those are separate roles, invoked from `site.yml`.

**Alternatives considered**:
- Single monolithic role: shorter to scaffold, but mixes concerns (e.g., TLS cert renewal) that have very different lifecycles.
- One role per engine (`postgres`, `vectorchord`): creates duplication since ~80% of the work is shared. Instead, a single `database` role branches on `db_engine`.

### 3. Engine selection: image + post-start tasks, not separate roles

`db_engine` is an enum variable. The `database` role maps it to an image:

| `db_engine`   | Image                                                                 | Extensions created                 |
|---------------|-----------------------------------------------------------------------|------------------------------------|
| `postgres`    | `pgvector/pgvector:pg16` (pinned)                                     | `vector`                           |
| `vectorchord` | `tensorchord/vchord-postgres:pg16-v0.2.2` (pinned; version is a var)  | `vector`, `vchord`                 |

Both expose Postgres on 5432 inside the container. VectorChord tuning knobs from `src/shared/config.ts` are forwarded as `ALTER SYSTEM` statements (or `postgresql.conf` snippets) applied once after first boot. This keeps the runtime config surface identical to what the TypeScript code already expects.

**Alternatives considered**:
- Build a custom image: unnecessary maintenance burden when upstream images exist.
- Install extensions via `apt` on the host: defeats the point of running Postgres in Docker.

### 4. Credential management: `ansible-vault` with split files

`group_vars/all.yml` holds non-secret defaults (ports, volume paths, tuning). `group_vars/all/vault.yml` is an `ansible-vault`-encrypted file holding:

- `db_superuser_password` (maps to container `POSTGRES_PASSWORD`)
- `db_app_user` / `db_app_password` (created via a post-start SQL task)
- `db_replication_password` (reserved; unused until HA lands)
- `backup_s3_access_key` / `backup_s3_secret_key` (optional; skipped if backup target is local)

The playbook fails fast with a clear error if any required secret is missing or the vault password is absent. Passwords are rendered into `pg_hba.conf`-adjacent files with `mode: 0600` owned by root; the container reads them via env vars, not bind mounts.

**Alternatives considered**:
- Plaintext `.env`: rejected; commits would leak secrets.
- External secret manager (Vault, SOPS): heavier dependency, and `ansible-vault` is built in. SOPS could be added later without breaking the interface.

### 5. TLS: certbot is the primary path, self-signed is the fallback

Two modes, selected by `tls_mode`:

- `tls_mode: letsencrypt` — the `tls` role installs `certbot` + the `certbot-dns-<provider>` plugin (Cloudflare by default) and issues a cert for `db_fqdn`. A systemd timer runs `certbot renew --deploy-hook "docker kill --signal=SIGHUP <container>"` weekly. Requires `db_fqdn` to be a real, publicly resolvable domain.
- `tls_mode: selfsigned` — generates a CA + server cert at `/etc/ssl/docsearch-db/`, valid for 10 years, using `community.crypto.x509_certificate`. Intended for lab VMs and the Molecule tests.
- `tls_mode: disabled` — rejected for production; the role emits a warning and requires `allow_insecure: true` to proceed.

The Postgres container mounts `/etc/ssl/docsearch-db/` read-only and sets `ssl=on`, `ssl_cert_file`, `ssl_key_file`, `ssl_ca_file`. `pg_hba.conf` uses `hostssl` for the application user and `host ... reject` for unencrypted connections from non-loopback.

**Alternatives considered**:
- Traefik / Caddy in front for TLS termination: adds a second service and doesn't give us native Postgres TLS (clients still need pg-level TLS for SCRAM-SHA-256 over untrusted networks).
- Manual cert provisioning only: no renewal story.

### 6. Host hardening: UFW + restart policy + log rotation

- UFW role opens 22 (SSH, from `admin_cidrs`) and 5432 (from `db_client_cidrs`, default `[]` meaning loopback only). Everything else denied.
- The container is launched with `restart_policy: unless-stopped` and a systemd drop-in that waits for `docker.service`. No separate systemd unit — Docker's own supervisor is enough.
- `/var/lib/docker/containers/*/` JSON logs are capped via the daemon config the `docker` role writes: `log-driver: json-file`, `log-opts: {max-size: "50m", max-file: "5"}`.
- Memory/CPU caps default to "unlimited" but are exposed as `db_container_memory` and `db_container_cpus` for operators who need to coexist with other workloads.

### 7. Backups: `pg_dump` in a sidecar cron, local or S3 target

The `backup` role writes `/usr/local/bin/docsearch-db-backup.sh` and a systemd timer (daily at 02:30 local time by default). The script:

1. Runs `docker exec <container> pg_dump -Fc` into a tempfile.
2. Writes to `backup_local_dir` (default `/var/backups/docsearch-db/`) with `YYYYMMDDTHHMM.dump` naming.
3. Prunes dumps older than `backup_retention_days` (default 14).
4. If `backup_s3_bucket` is set, uploads via `aws s3 cp` (awscli installed by the role when the bucket is set).

Restore is out of scope for the playbook but documented as a one-liner in the README.

**Alternatives considered**:
- `pg_basebackup` + WAL archiving: the right answer for PITR, but needs HA and a lot more operator education. Tracked as a non-goal.
- `pgBackRest`: excellent, but adds a heavy dependency. Can slot in later as an alternative implementation of the same `backup` role interface.

### 8. Testing: Molecule with a systemd-enabled Docker image

Molecule default scenario uses `geerlingguy/docker-ubuntu2204-ansible` and `geerlingguy/docker-debian12-ansible` (both expose systemd via cgroup v2 + privileged). The scenario runs:

1. `create`: start the container with `/sbin/init`, `privileged: true`, cgroupns host.
2. `converge`: run `site.yml` against it.
3. `verify`: a Python test that:
   - Opens a TLS connection from inside the container network namespace to the Postgres container.
   - Authenticates with the app user.
   - Runs `SELECT 1`, `CREATE EXTENSION IF NOT EXISTS vector` (+`vchord` when engine is `vectorchord`), inserts a sample 1536-dim vector, builds an IVFFlat/VChord index, runs a k-NN query.
   - Checks that the systemd timer for backups is `active (waiting)` and that a dry-run backup produces a valid `pg_dump` archive header.
4. `idempotence`: re-runs `converge`; Molecule fails the stage if any task reports `changed`.

Docker-in-Docker limits Molecule to single-node scenarios, which is fine — HA is a non-goal. Tests run locally via `make ansible-test` and on GitHub Actions via a dedicated job (`ubuntu-latest` runner, Docker preinstalled).

**Alternatives considered**:
- Vagrant + VirtualBox: higher fidelity (real kernel) but unusable on WSL2 and slow in CI.
- Testinfra without Molecule: skips the idempotence check, which is the main thing that catches Ansible bugs.

### 9. Documentation: single README at `deploy/ansible/README.md`

Sections: prerequisites, variables reference (table: name, default, purpose), quickstart for both engines, vault workflow, certbot setup, backup/restore, upgrade, troubleshooting, known limits. A short pointer is added to the root `README.md` under a new "Deployment" heading.

## Risks / Trade-offs

- [Operator misconfigures `tls_mode: disabled` in production] → The `tls` role hard-fails unless `allow_insecure: true` is explicitly set, and the README calls this out in bold.
- [Let's Encrypt rate limits during development] → Default test scenarios use `tls_mode: selfsigned`; `letsencrypt` is opt-in and documented with the staging ACME URL for dry runs.
- [systemd-in-Docker flakiness on Molecule] → Pin `geerlingguy/docker-*-ansible` image tags, use cgroup v2 host runners, and gate CI on `uname -r >= 5.x`. Document the Linux kernel requirement in the README.
- [Upstream image tag rot (VectorChord releases fast)] → All image tags are variables with conservative pinned defaults; Dependabot-style updates are out of scope for this change but the var indirection keeps upgrades to a one-line diff.
- [Backups balloon without an operator noticing] → Default retention is 14 days, and the timer emits a journal line with the dump size; Prometheus/alerting is out of scope but the hook point is there.
- [ansible-vault password management adds friction] → The README gives two workflows (local password file, `ANSIBLE_VAULT_PASSWORD_FILE`); Molecule tests use a fixed test password so CI doesn't need secrets.
- [Two engines means two code paths in the `database` role] → Mitigated by funneling through a single templated `docker_container` task and a single SQL post-start task list parameterized by `db_engine`. No `when: db_engine == ...` scattered across roles.

## Migration Plan

This is additive — no existing files change semantics. Rollout:

1. Land the change. Existing users on SQLite see no difference.
2. Operators who want Postgres/VectorChord follow the new README:
   a. Provision a VM.
   b. Fill in `inventory.yml` and `group_vars/all.yml`.
   c. `ansible-vault create group_vars/all/vault.yml`.
   d. `ansible-playbook -i inventory.yml site.yml`.
   e. Point `docsearch-mcp` at the new DB via `POSTGRES_CONNECTION_STRING`.
3. Rollback: operators stop the container (`docker stop docsearch-db`), restore the previous volume snapshot, and revert `POSTGRES_CONNECTION_STRING`. The playbook itself is state-free enough that re-running it on a restored VM converges.

## Open Questions

- Should the default pinned Postgres major version track the newest supported by both `pgvector` and `vchord`, or lag by one to be conservative? → Proposing pg16 for both; revisit when pg17 support is stable on VectorChord.
- Do we want the `backup` role to optionally run a restore-test (restore into a throwaway container and run `SELECT 1`)? Valuable but expands scope; leaving as a documented follow-up.
- Should CI run the Molecule matrix on every PR, or only on PRs touching `deploy/ansible/**`? Proposing path-filtered to keep main-branch CI time down.
