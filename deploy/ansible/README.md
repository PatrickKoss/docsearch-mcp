# docsearch-mcp Ansible Deployment

This directory contains an Ansible playbook that takes a fresh **Ubuntu 22.04** or **Debian 12** VM and runs either a production-grade **PostgreSQL** (with pgvector) or **VectorChord** container. It handles Docker installation, TLS, firewall, credentials, and nightly backups.

## Prerequisites

| Requirement | Notes |
|---|---|
| Control machine | Python 3.11+, `ansible-core >= 2.18`, internet access |
| Target VM | Ubuntu 22.04 LTS or Debian 12, SSH as a sudo user |
| Docker | Installed by the playbook — do not pre-install |
| Let's Encrypt TLS | Publicly resolvable `db_fqdn` + supported DNS provider API key (only for `tls_mode: letsencrypt`) |

Install Python dependencies on the control machine:

```bash
cd deploy/ansible
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
ansible-galaxy collection install -r requirements.yml -p .collections
```

## Quick Start — PostgreSQL

```bash
# 1. Copy example inventory and set your VM's IP
cp inventory.example/hosts.yml inventory.yml
$EDITOR inventory.yml

# 2. Configure non-secret variables
cp group_vars/all/main.yml group_vars/all/main.yml.bak
# db_engine is already "postgres" by default — no edit needed

# 3. Create the vault with your secrets
cp group_vars/all/vault.yml.example /tmp/vault_draft.yml
$EDITOR /tmp/vault_draft.yml          # set real passwords
ansible-vault encrypt /tmp/vault_draft.yml --output group_vars/all/vault.yml
rm /tmp/vault_draft.yml

# 4. Deploy
ansible-playbook -i inventory.yml site.yml --ask-vault-pass
```

After the play completes, point `docsearch-mcp` at the new database:

```bash
DB_TYPE=postgresql
POSTGRES_CONNECTION_STRING="postgresql://docsearch:<app_password>@<vm-ip>:5432/docsearch?sslmode=require"
```

## Quick Start — VectorChord

Same steps as above, but set `db_engine: vectorchord` in `group_vars/all/main.yml` before step 4. The playbook automatically pulls the VectorChord image and enables both the `vector` and `vchord` extensions.

Then in `docsearch-mcp`:

```bash
DB_TYPE=vectorchord
POSTGRES_CONNECTION_STRING="postgresql://docsearch:<app_password>@<vm-ip>:5432/docsearch?sslmode=require"
```

## Variables Reference

All non-secret variables live in `group_vars/all/main.yml`. Secret variables are in the vault (`group_vars/all/vault.yml`).

### Engine

| Variable | Default | Purpose |
|---|---|---|
| `db_engine` | `postgres` | `postgres` or `vectorchord` |
| `postgres_image_tag` | `pg16` | Docker tag for pgvector/pgvector image |
| `vectorchord_image_tag` | `pg16-v0.2.2` | Docker tag for tensorchord/vchord-postgres image |

### Database identity

| Variable | Default | Purpose |
|---|---|---|
| `db_name` | `docsearch` | Postgres database name |
| `db_superuser` | `postgres` | Superuser name inside the container |
| `db_port` | `5432` | Host port exposed by the container |
| `db_container_name` | `docsearch-db` | Docker container name |
| `db_data_dir` | `/var/lib/docsearch-db` | Host path for Postgres data volume |

### TLS

| Variable | Default | Purpose |
|---|---|---|
| `tls_mode` | `selfsigned` | `selfsigned`, `letsencrypt`, or `disabled` |
| `tls_dir` | `/etc/ssl/docsearch-db` | Host path for TLS certificates |
| `db_fqdn` | `""` | FQDN for Let's Encrypt cert (required when `tls_mode=letsencrypt`) |
| `certbot_dns_provider` | `cloudflare` | DNS plugin name (e.g. `route53`, `digitalocean`) |
| `allow_insecure` | `false` | Must be `true` to proceed with `tls_mode=disabled` |

### Firewall

| Variable | Default | Purpose |
|---|---|---|
| `admin_cidrs` | `[]` | CIDRs allowed to SSH (empty = any source) |
| `db_client_cidrs` | `[]` | CIDRs allowed to connect to Postgres port (empty = loopback only) |

### Container resources

| Variable | Default | Purpose |
|---|---|---|
| `db_container_memory` | `0` | Memory limit (e.g. `4g`); `0` = unlimited |
| `db_container_cpus` | `0` | CPU quota (e.g. `2.0`); `0` = unlimited |

### PostgreSQL tuning

| Variable | Default | Purpose |
|---|---|---|
| `pg_shared_buffers` | `256MB` | Postgres shared_buffers (≈25% of RAM) |

### VectorChord tuning (applied when `db_engine=vectorchord`)

These mirror the `VECTORCHORD_*` environment variables consumed by `src/shared/config.ts`:

| Variable | Default | Purpose |
|---|---|---|
| `vectorchord_residual_quantization` | `true` | Enable residual quantization |
| `vectorchord_lists` | `100` | Number of IVF lists |
| `vectorchord_spherical_centroids` | `true` | Use spherical centroids |
| `vectorchord_build_threads` | `4` | Threads for index builds |
| `vectorchord_probes` | `10` | Number of lists probed at query time |

### Backups

| Variable | Default | Purpose |
|---|---|---|
| `backup_local_dir` | `/var/backups/docsearch-db` | Local dump directory |
| `backup_retention_days` | `14` | Days to keep local dumps |
| `backup_schedule` | `*-*-* 02:30:00` | Systemd OnCalendar expression |
| `backup_s3_bucket` | `""` | S3 bucket name; empty disables upload |
| `backup_s3_region` | `us-east-1` | AWS region for S3 upload |

### Vault secrets (required)

| Variable | Purpose |
|---|---|
| `db_superuser_password` | Postgres superuser password |
| `db_app_user` | Application role name |
| `db_app_password` | Application role password |
| `db_replication_password` | Reserved for future HA (unused) |
| `backup_s3_access_key` | AWS access key (only if `backup_s3_bucket` is set) |
| `backup_s3_secret_key` | AWS secret key (only if `backup_s3_bucket` is set) |

## ansible-vault Workflow

```bash
# Create a new vault
ansible-vault create group_vars/all/vault.yml

# Edit an existing vault
ansible-vault edit group_vars/all/vault.yml

# Run playbook without storing password in file
ansible-playbook -i inventory.yml site.yml --ask-vault-pass

# Or store password in a file (keep out of git — it's in .gitignore)
echo "my-vault-password" > .vault_pass
chmod 600 .vault_pass
# Uncomment the `vault_password_file = .vault_pass` line in ansible.cfg
# (or pass --vault-password-file .vault_pass on the command line)
ansible-playbook -i inventory.yml site.yml
```

## TLS Configuration

### Self-signed (default, good for lab VMs)

No additional config needed. A local CA and server cert are generated at `tls_dir`. Clients must trust the CA:

```bash
# Copy CA to client machine
scp ubuntu@<vm-ip>:/etc/ssl/docsearch-db/ca.crt .

# Use in connection string
POSTGRES_CONNECTION_STRING="postgresql://...?sslmode=verify-ca&sslrootcert=./ca.crt"
```

### Let's Encrypt (production)

1. Set `tls_mode: letsencrypt` and `db_fqdn: db.example.com` in `group_vars/all/main.yml`.
2. Add your DNS provider API credentials to the vault (`certbot_cloudflare_api_token` for Cloudflare, etc.).
3. Run the playbook. Certbot issues the cert and a weekly systemd timer renews it.

Use the staging ACME server for dry runs to avoid rate limits:

```yaml
# group_vars/all/main.yml
certbot_extra_args: "--server https://acme-staging-v02.api.letsencrypt.org/directory"
```

## Firewall Tuning

```yaml
# Allow your app servers to reach Postgres
db_client_cidrs:
  - "10.0.1.0/24"
  - "10.0.2.0/24"

# Restrict SSH to your ops CIDR
admin_cidrs:
  - "10.0.0.0/16"
```

## Backup and Restore

Backups are stored in `/var/backups/docsearch-db/YYYYMMDDTHHMM.dump`. The timer runs nightly at 02:30 (configurable).

**Check last backup:**

```bash
ls -lh /var/backups/docsearch-db/
journalctl -u docsearch-db-backup.service -n 20
```

**Manual backup:**

```bash
systemctl start docsearch-db-backup.service
```

**Restore from dump:**

```bash
DUMP=/var/backups/docsearch-db/20240101T0230.dump
docker exec -i docsearch-db pg_restore -U postgres -d docsearch --clean < "$DUMP"
```

## Upgrade Procedure

1. Update the image tag in `group_vars/all/main.yml` (e.g. `postgres_image_tag: pg17`).
2. Snapshot the data volume: `cp -a /var/lib/docsearch-db /var/lib/docsearch-db.bak`.
3. Run `ansible-playbook -i inventory.yml site.yml`. The container is re-created with the new image; data volume is preserved.
4. Verify the application can connect. If not, roll back with `docker stop docsearch-db && cp -a /var/lib/docsearch-db.bak /var/lib/docsearch-db && ansible-playbook ...`.

**Note:** Cross-major-version Postgres upgrades (e.g. pg14 → pg16) require `pg_upgrade` or a dump-restore cycle. See the PostgreSQL docs. This playbook does not automate that step.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `failed=1` on preflight | Wrong OS or missing vault var | Check OS version; ensure vault defines all required secrets |
| Container unhealthy | pg_hba.conf mismatch or bad superuser password | Check `docker logs docsearch-db`; re-run vault edit |
| TLS handshake fails | CA not trusted on client | Copy `ca.crt` to client; use `sslmode=verify-ca` |
| certbot fails | DNS challenge can't resolve | Check DNS API credentials; try staging server first |
| UFW blocks SSH | `admin_cidrs` too restrictive | Log in via console, `ufw allow 22`, re-run playbook |
| Large backup file | Normal for full pg_dump | Adjust `backup_retention_days` or add S3 lifecycle policy |

## Known Limitations

- **Single-node only.** No streaming replication or HA. A VM failure means downtime until the volume is restored.
- **No zero-downtime major upgrades.** Postgres major version upgrades require manual intervention.
- **certbot DNS challenge only.** HTTP-01 is not implemented; the database port (5432) is not HTTP.
- **systemd required.** The Molecule tests and the backup timer both depend on systemd. Containers without init will not work.
- **Kernel ≥ 5.x required for Molecule.** The systemd-in-Docker approach relies on cgroup v2 which requires a modern kernel (WSL2 kernel 5.15+ works).
