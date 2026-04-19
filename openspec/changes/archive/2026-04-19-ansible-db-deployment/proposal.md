## Why

Today the project supports three database backends (`sqlite`, `postgresql`, `vectorchord`) but offers no reproducible way to stand up the Postgres or VectorChord backend on a real VM. Operators currently hand-roll Docker commands, TLS, backups, and credentials — which is error-prone and blocks production rollout. A versioned, configurable Ansible deployment (with automated tests that prove the database actually works end-to-end) removes that friction and gives us a single path from fresh VM to production-ready Postgres or VectorChord.

## What Changes

- Add a new `deploy/ansible/` directory containing an Ansible playbook and roles that install Docker, lay down config, and run either a Postgres or VectorChord container on a target VM.
- Support a `db_engine` variable (`postgres` | `vectorchord`) that selects the container image and applies the engine-specific configuration (shared_preload_libraries, extensions, VectorChord tuning knobs that match `src/shared/config.ts`).
- Manage credentials via Ansible variables and `ansible-vault`: superuser user/password, application user/password, database name, and host-level Postgres auth (`pg_hba.conf`).
- Provision production-grade extras:
  - TLS via Let's Encrypt / certbot in DNS or HTTP-01 mode, with a self-signed fallback for lab/VM use.
  - UFW (or iptables) firewall rules that only expose 5432/TLS to configured CIDRs.
  - A systemd unit (or Docker restart policy) so the container comes back after reboot.
  - Nightly `pg_dump` backups to a configurable local or S3-compatible target with retention.
  - Log rotation and basic resource limits (memory, CPU, shared_buffers).
- Ship a `deploy/ansible/README.md` that documents required variables, vault usage, inventory format, and the `ansible-playbook` commands for a fresh deploy and an upgrade.
- Add a Molecule-driven test suite that boots a systemd-enabled Linux Docker container (Ubuntu 22.04 and Debian 12), runs the playbook against it, and asserts:
  - The Postgres/VectorChord container is healthy.
  - A client can connect over TLS with the application credentials.
  - The `vector` + `vchord` extensions load when `db_engine=vectorchord`.
  - A minimal CRUD + vector-index round trip succeeds.
  - Idempotence: re-running the playbook reports zero changes.
- Wire the Molecule suite into a Make target (`make ansible-test`) and a GitHub Actions job so regressions are caught in CI.

## Capabilities

### New Capabilities
- `ansible-db-deployment`: Ansible playbook + roles that deploy Postgres or VectorChord in Docker on a VM with production-grade configuration (TLS, credentials, firewall, backups, persistence) and documented operator workflow.
- `ansible-db-deployment-tests`: Molecule-based test harness that runs the playbook inside a systemd Linux Docker image and asserts the database is reachable, extensions load, vector round-trips succeed, and the play is idempotent.

### Modified Capabilities
<!-- None. Runtime configuration in src/shared/config.ts is unchanged; this change only adds deployment tooling. -->

## Impact

- **New files**: `deploy/ansible/` (playbook, `roles/`, `inventory.example`, `group_vars/`, `README.md`), `deploy/ansible/molecule/` scenarios, `.github/workflows/ansible.yml`, Make targets.
- **Dependencies**: Adds a `requirements.txt` (or `requirements.yml`) under `deploy/ansible/` for Ansible, Molecule, `molecule-plugins[docker]`, `ansible-lint`. Not added to the app's runtime deps.
- **Runtime code**: None — `src/` is untouched. Consumers opt in by running the playbook.
- **CI**: New workflow job that requires Docker-in-Docker; must be compatible with the existing Husky/`make lint` pre-commit flow (the new tree is excluded from TypeScript checks).
- **Docs**: New `deploy/ansible/README.md`; a short pointer added to the root README's deployment section.
- **Security surface**: Introduces secret handling via `ansible-vault`; operators must manage a vault password. Certbot requires outbound DNS/HTTP to Let's Encrypt.
