## ADDED Requirements

### Requirement: Ansible playbook entrypoint

The deployment SHALL provide a single Ansible playbook at `deploy/ansible/site.yml` that, when run against a supported Linux VM, installs Docker and launches a Postgres or VectorChord container configured for production use.

#### Scenario: Fresh Ubuntu 22.04 VM deploy
- **WHEN** an operator runs `ansible-playbook -i inventory.yml site.yml` against a freshly provisioned Ubuntu 22.04 VM with `db_engine: postgres` and required secrets defined in vault
- **THEN** the play completes with `failed=0`, Docker is installed and enabled, and a container named `docsearch-db` is running and listening on the configured port

#### Scenario: Fresh Debian 12 VM deploy
- **WHEN** an operator runs the same playbook against a Debian 12 VM with `db_engine: vectorchord`
- **THEN** the play completes with `failed=0` and the container starts with both the `vector` and `vchord` extensions available

#### Scenario: Unsupported OS
- **WHEN** the playbook is run against a host whose `ansible_distribution` is not in the supported list (Ubuntu 22.04, Debian 12)
- **THEN** the play fails in the `common` role preflight task with a message naming the unsupported distribution

### Requirement: Engine selection via a single variable

The playbook SHALL select the database engine through a `db_engine` variable whose allowed values are `postgres` and `vectorchord`, with no other code paths requiring edits.

#### Scenario: Engine set to postgres
- **WHEN** `db_engine: postgres` is set in `group_vars/all.yml`
- **THEN** the `database` role pulls the pinned `pgvector/pgvector` image and the post-start SQL task creates only the `vector` extension

#### Scenario: Engine set to vectorchord
- **WHEN** `db_engine: vectorchord` is set in `group_vars/all.yml`
- **THEN** the `database` role pulls the pinned `tensorchord/vchord-postgres` image and the post-start SQL task creates both `vector` and `vchord` extensions

#### Scenario: Invalid engine value
- **WHEN** `db_engine` is set to any value other than `postgres` or `vectorchord`
- **THEN** the playbook fails at variable validation before any host changes are made

### Requirement: VectorChord tuning knobs are exposed

When `db_engine` is `vectorchord`, the playbook SHALL expose variables that map one-to-one to the VectorChord runtime settings consumed by `src/shared/config.ts`: residual quantization, lists, spherical centroids, build threads, and probes.

#### Scenario: Default VectorChord tuning
- **WHEN** the playbook runs with `db_engine: vectorchord` and no overrides
- **THEN** the applied Postgres configuration contains the same defaults documented in `CLAUDE.md` (residual quantization on, lists=100, spherical centroids on, build threads=4, probes=10)

#### Scenario: Overridden VectorChord tuning
- **WHEN** the operator sets `vectorchord_lists: 500` and `vectorchord_probes: 20` in group vars
- **THEN** those values appear in the rendered Postgres configuration and survive a container restart

### Requirement: Credentials are managed via ansible-vault

The playbook SHALL source the database superuser password, application user credentials, and any backup target credentials from an `ansible-vault`-encrypted file, and SHALL fail if any required secret is missing.

#### Scenario: Missing vault password
- **WHEN** the playbook is invoked without a vault password (no `--ask-vault-pass`, no `ANSIBLE_VAULT_PASSWORD_FILE`) but a vaulted file exists
- **THEN** Ansible fails before any host changes with a decryption error referencing the vault file

#### Scenario: Missing required secret
- **WHEN** the vault decrypts successfully but `db_app_password` is not defined
- **THEN** the play fails in the preflight task with a message naming `db_app_password` and no container is started

#### Scenario: Credentials applied
- **WHEN** the vault defines `db_superuser_password`, `db_app_user`, and `db_app_password`, and the play runs to completion
- **THEN** a client using the app credentials can authenticate, and a client using the wrong password is rejected

### Requirement: TLS is enforced for non-loopback connections

The playbook SHALL support three TLS modes — `letsencrypt`, `selfsigned`, and `disabled` — and SHALL configure `pg_hba.conf` so that non-loopback clients can only connect over TLS unless `allow_insecure: true` is explicitly set.

#### Scenario: Let's Encrypt mode issues and renews a certificate
- **WHEN** `tls_mode: letsencrypt` is set with a valid `db_fqdn` and DNS credentials
- **THEN** certbot obtains a certificate, the container is configured with `ssl=on`, and a systemd timer for `certbot renew` is installed and enabled

#### Scenario: Self-signed mode generates a local CA
- **WHEN** `tls_mode: selfsigned` is set
- **THEN** the `tls` role creates a CA and server cert under `/etc/ssl/docsearch-db/` with `mode: 0600`, and the container loads them at start

#### Scenario: Disabled mode without explicit opt-in
- **WHEN** `tls_mode: disabled` is set without `allow_insecure: true`
- **THEN** the play fails in the `tls` role with a message explaining why disabling TLS is blocked

#### Scenario: Non-TLS connection from remote host
- **WHEN** TLS is configured and a remote client attempts an unencrypted connection to port 5432
- **THEN** the server rejects the connection per the `hostssl`/`host ... reject` rules in `pg_hba.conf`

### Requirement: Host firewall restricts database exposure

The playbook SHALL configure UFW (or iptables on distributions where UFW is unavailable) so that only SSH from `admin_cidrs` and the database port from `db_client_cidrs` are accepted, with a default-deny policy.

#### Scenario: Default firewall after deploy
- **WHEN** the playbook completes with default variables
- **THEN** `ufw status` shows default-deny incoming, SSH allowed from `admin_cidrs`, and no rule for 5432 (loopback only)

#### Scenario: Allowing application subnets
- **WHEN** `db_client_cidrs: ["10.0.0.0/16"]` is set and the playbook runs
- **THEN** UFW permits inbound 5432/tcp from `10.0.0.0/16` only, and connections from other sources time out or are refused

### Requirement: Container persistence across reboots

The playbook SHALL configure the database container so that it is automatically restarted after a host reboot, with its data volume preserved.

#### Scenario: Reboot survival
- **WHEN** the VM is rebooted after a successful deploy
- **THEN** on boot, Docker starts, the `docsearch-db` container starts, and all previously inserted rows are still present

#### Scenario: Data volume persistence path
- **WHEN** the playbook deploys with the default `db_data_dir`
- **THEN** the container bind-mounts `/var/lib/docsearch-db/` from the host and the directory is owned by the Postgres container uid with `mode: 0700`

### Requirement: Nightly backups with retention

The playbook SHALL install a nightly `pg_dump` job with configurable retention and an optional S3-compatible upload target.

#### Scenario: Default nightly backup
- **WHEN** the playbook runs with default backup variables
- **THEN** a systemd timer named `docsearch-db-backup.timer` is enabled and scheduled for 02:30 local time, and a `.dump` file lands in `/var/backups/docsearch-db/` on the first run

#### Scenario: Retention prunes old dumps
- **WHEN** `backup_retention_days: 7` is set and the backup script runs on a host where older dumps exist
- **THEN** dumps older than 7 days are removed and dumps within the window are kept

#### Scenario: S3 upload when bucket configured
- **WHEN** `backup_s3_bucket` is set together with vaulted S3 credentials
- **THEN** after each local dump the script uploads the same file to the configured bucket and exits non-zero if the upload fails

### Requirement: Idempotent re-runs

The playbook SHALL be idempotent: a second run against an unchanged host SHALL produce zero changed tasks.

#### Scenario: Re-run with no drift
- **WHEN** the playbook is run twice against the same host with identical variables
- **THEN** the second run reports `changed=0` in the play recap

#### Scenario: Drift detection triggers change
- **WHEN** an operator manually edits `pg_hba.conf` on the host between runs
- **THEN** the next playbook run reports `changed>=1` on the relevant tasks and restores the managed configuration

### Requirement: Operator documentation

The deployment SHALL include a `deploy/ansible/README.md` documenting prerequisites, the full variable reference, vault workflow, quickstart for both engines, TLS/certbot setup, backup/restore, upgrade procedure, and known limitations.

#### Scenario: Variable reference completeness
- **WHEN** a reviewer reads the README
- **THEN** every variable used in `group_vars/`, `roles/*/defaults/main.yml`, or `site.yml` is listed in the reference table with its default and purpose

#### Scenario: Quickstart matches reality
- **WHEN** an operator follows the README quickstart on a fresh VM using only the documented commands
- **THEN** the deploy succeeds and a client can connect using the TLS and credentials described
