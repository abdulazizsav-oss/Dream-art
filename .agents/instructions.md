# Dream Art CRM — VPS Server Instructions

## Quick Reference
- **IP**: `138.249.7.36`
- **SSH**: `ssh root@138.249.7.36` (password: `GprgLmNWO26qJ8T0`, SSH key already installed)
- **CRM URL**: `http://138.249.7.36`
- **Supabase API**: `http://138.249.7.36:8000`
- **OS**: Ubuntu 24.04 LTS, 2 vCPU, 2GB RAM + 4GB Swap, 40GB disk

## Architecture
The server runs a **self-hosted Supabase** (13 Docker containers) and the **Next.js CRM app** managed by PM2, fronted by Nginx.

## Key Paths
- CRM App: `/var/www/dream-art-crm/`
- CRM env: `/var/www/dream-art-crm/.env.local`
- Supabase: `/opt/supabase/docker/`
- Supabase env: `/opt/supabase/docker/.env`
- Nginx config: `/etc/nginx/sites-available/dream-art`
- DB backup: `/root/remote_db_dump.sql`

## How to Connect & Execute Commands
Use SSH to run commands on the server:
```bash
ssh root@138.249.7.36 'your_command_here'
```

## Service Management
- **CRM**: `pm2 restart dream-art` / `pm2 logs dream-art`
- **Supabase**: `cd /opt/supabase/docker && docker compose restart`
- **Nginx**: `systemctl restart nginx`
- **Database**: `docker exec -it supabase-db psql -U postgres -d postgres`

## CI/CD
`git push origin main` → GitHub Actions auto-deploys via SSH (secrets: SERVER_IP, SERVER_USER, SERVER_SSH_KEY).

## Applying Migrations
```bash
cat migration.sql | docker exec -i supabase-db psql -U postgres -d postgres
```

## Supabase Credentials (Local)
- ANON_KEY: `eyJhbG...Fbdy6U`
- SERVICE_ROLE_KEY: `eyJhbG...asSeY`
- POSTGRES_PASSWORD: `tz0wnJQtE2HK59W4_local`

## Git Repo
`https://github.com/abdulazizsav-oss/Dream-art.git` (branch: `main`)
