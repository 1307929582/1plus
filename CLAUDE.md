# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SheerID Veteran Verification Tool - A full-stack application for managing veteran identity verification through SheerID's API, with admin dashboard and LinuxDO OAuth integration.

## Common Commands

### Service Management (via manage.sh)
```bash
./manage.sh start        # Start both backend and frontend
./manage.sh stop         # Stop all services
./manage.sh restart      # Restart all services
./manage.sh status       # Check service status
./manage.sh logs         # View backend logs (tail -f)
./manage.sh logs-frontend # View frontend logs
./manage.sh db-stats     # Database statistics
./manage.sh db-backup    # Backup SQLite database
./manage.sh redeploy     # Full reinstall and rebuild
```

### Backend Development
```bash
cd backend
source venv/bin/activate  # Or use parent venv
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 14100 --reload
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev              # Dev server on port 14000
npm run build            # Production build
npm run lint             # ESLint
```

### Database
SQLite database at `backend/sheerid_veteran.db`. Query directly:
```bash
sqlite3 backend/sheerid_veteran.db "SELECT COUNT(*) FROM veterans;"
```

## Architecture

### Backend (FastAPI + SQLAlchemy)
- `backend/main.py` - API endpoints, authentication, OAuth flow
- `backend/models.py` - SQLAlchemy models (Veteran, RedeemCode, CodeUsage, Admin, LinuxDOUser, OAuthSettings, ProxySettings)
- `backend/sheerid_service.py` - SheerID API integration (two-step verification flow)
- `backend/proxy_config.py` - Proxy configuration for SheerID requests
- `backend/database.py` - Database connection setup

### Frontend (React + Vite + TailwindCSS v4)
- `frontend/src/App.tsx` - Router setup with public (`/`) and admin (`/admin/*`) routes
- `frontend/src/api.ts` - Axios client with Basic Auth interceptor
- `frontend/src/pages/` - Page components (Dashboard, Veterans, Codes, Verify, Settings, LinuxDOUsers)
- `frontend/src/components/Layout.tsx` - Admin layout wrapper

### Key Data Flow
1. Users access `/` to verify using redeem codes
2. `POST /api/verify/step1` submits veteran info to SheerID, triggers email verification
3. `POST /api/verify/step2` completes verification with email token
4. Admin manages veterans (CSV import), redeem codes, and settings at `/admin`

### Verification States
- `pending` - Awaiting verification
- `email_sent` - SheerID email loop initiated
- `success` - Verified successfully
- `failed` - Verification failed

## Service Ports
- Backend API: `http://localhost:14100`
- Frontend: `http://localhost:14000`
- Admin Dashboard: `http://localhost:14000/admin`

## External APIs
- SheerID: `https://services.sheerid.com/rest/v2/verification/`
- SheerID UDID: `https://fn.us.fd.sheerid.com/udid/udid.json`
- LinuxDO OAuth: `https://connect.linux.do/oauth2/`
