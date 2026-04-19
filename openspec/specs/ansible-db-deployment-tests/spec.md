## ADDED Requirements

### Requirement: Molecule test harness

The deployment SHALL include a Molecule test scenario at `deploy/ansible/molecule/default/` that runs the playbook inside a systemd-enabled Linux Docker container and exercises the four Molecule stages: `create`, `converge`, `verify`, and `idempotence`.

#### Scenario: Full scenario runs locally
- **WHEN** a developer runs `make ansible-test` on a Linux host with Docker installed
- **THEN** Molecule creates a systemd-enabled container, runs `site.yml` against it, executes the verify stage, runs `converge` a second time, and exits 0

#### Scenario: Matrix covers supported distributions
- **WHEN** Molecule is configured with both Ubuntu 22.04 and Debian 12 platform entries
- **THEN** the full scenario runs against each platform and both must pass for the command to exit 0

### Requirement: Database reachability check

The verify stage SHALL establish a TLS-backed connection to the deployed database as the application user and run `SELECT 1` successfully.

#### Scenario: TLS handshake with application user
- **WHEN** the verify stage runs after a successful converge
- **THEN** a Python client connects to the container on the configured port using `sslmode=verify-ca` and the generated self-signed CA, authenticates as `db_app_user`, and receives `1` from `SELECT 1`

#### Scenario: Wrong password is rejected
- **WHEN** the verify stage attempts a connection with an incorrect password
- **THEN** the connection fails with an authentication error and the test asserts that specific failure mode

### Requirement: Extension and vector round-trip check

When `db_engine` is `vectorchord`, the verify stage SHALL confirm that both the `vector` and `vchord` extensions load and that an insert + ANN query round trip returns the expected row.

#### Scenario: VectorChord round trip
- **WHEN** the verify stage runs against a `vectorchord` deploy
- **THEN** it executes `CREATE EXTENSION IF NOT EXISTS vector`, `CREATE EXTENSION IF NOT EXISTS vchord`, creates a test table with a `vector(1536)` column, inserts at least one row, builds a VChord index, runs a k-NN query, and asserts the inserted row is returned

#### Scenario: Postgres-only round trip
- **WHEN** the verify stage runs against a `postgres` deploy
- **THEN** it executes `CREATE EXTENSION IF NOT EXISTS vector` but skips the `vchord` steps, and still completes an insert + k-NN query round trip

### Requirement: Backup timer and dry-run verification

The verify stage SHALL confirm that the backup systemd timer is enabled and that a manual invocation of the backup script produces a valid `pg_dump` archive.

#### Scenario: Timer is active
- **WHEN** the verify stage inspects `systemctl list-timers`
- **THEN** `docsearch-db-backup.timer` appears in the output as enabled and scheduled

#### Scenario: Dry-run backup produces a valid dump
- **WHEN** the verify stage invokes the backup script with a one-shot flag
- **THEN** a `.dump` file is produced, its first bytes match the `pg_dump -Fc` magic header (`PGDMP`), and `pg_restore --list` on it exits 0

### Requirement: Idempotence enforcement

The Molecule scenario SHALL fail if the second `converge` run reports any `changed` task, ensuring the playbook is idempotent.

#### Scenario: Clean re-run
- **WHEN** Molecule runs its `idempotence` stage after a successful first converge
- **THEN** the second run reports `changed=0` across all tasks and the stage exits 0

#### Scenario: Failure surfaces a diagnostic
- **WHEN** a task is not idempotent and the `idempotence` stage fails
- **THEN** Molecule prints the non-idempotent task name and its diff, and the command exits non-zero

### Requirement: Make target and CI integration

The repository SHALL provide a `make ansible-test` target that wraps the Molecule invocation and SHALL include a GitHub Actions job that runs the same target on `push` and `pull_request` events.

#### Scenario: Make target wraps Molecule
- **WHEN** a developer runs `make ansible-test`
- **THEN** the target creates or activates a virtualenv under `deploy/ansible/.venv`, installs pinned `requirements.txt`, and runs `molecule test`

#### Scenario: CI job runs on relevant changes
- **WHEN** a pull request modifies any file under `deploy/ansible/**`
- **THEN** the GitHub Actions `ansible-molecule` job runs, invokes `make ansible-test`, and blocks merge if it fails

#### Scenario: CI skips when unrelated
- **WHEN** a pull request only modifies files outside `deploy/ansible/**`
- **THEN** the `ansible-molecule` job is not required to run, matching the configured path filter

### Requirement: Test credentials never leak

The test harness SHALL use a dedicated test vault and test-only passwords that are safe to commit, and SHALL NOT reuse production secrets or Let's Encrypt issuance.

#### Scenario: Test vault is self-contained
- **WHEN** the Molecule scenario runs
- **THEN** it uses `molecule/default/vault.yml` encrypted with a test-only password stored in `molecule/default/.vault_pass`, and `tls_mode` is forced to `selfsigned`

#### Scenario: No production endpoints hit
- **WHEN** the Molecule scenario runs
- **THEN** no outbound requests are made to Let's Encrypt's production ACME endpoint, and no S3 upload is attempted
