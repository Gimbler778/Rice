# Full-Stack Monorepo Template

A production-ready monorepo template with TypeScript, Express, React, and PostgreSQL.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Backend**: Express 5.2 + TypeScript + Better Auth + Drizzle ORM
- **Frontend**: React 19 + React Router + TanStack Query + Vite
- **Database**: PostgreSQL + Drizzle Kit
- **Auth**: Better Auth (Atlassian sign-in + Bitbucket account linking)
- **Deployment**: Vercel ready (vercel.json config included)

## Project Structure

```
apps/
├── api/          # Express backend
│   ├── src/
│   │   ├── index.ts       # Server entry
│   │   ├── lib/
│   │   │   ├── env.ts     # Env validation (Zod)
│   │   │   └── auth.ts    # Better Auth config
│   │   └── db/            # Drizzle client + schema
│   ├── drizzle.config.ts
│   └── package.json
└── web/          # React frontend
    ├── src/
    │   ├── main.tsx       # App entry
    │   ├── lib/           # Auth client, query client, theme
    │   └── components/
    ├── vercel.json        # SPA route rewriting
    └── package.json
```

## Setup

### Prerequisites

- Node.js 18+
- pnpm 10+
- Docker (for PostgreSQL)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL

```bash
docker run --name odoo-postgres \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=odoo_db \
  -p 5432:5432 \
  -d postgres:16
```

### 3. Setup Environment

**Backend** (`apps/api/.env`):

```env
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://admin:password@localhost:5432/odoo_db
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:3000
ATLASSIAN_CLIENT_ID=your-atlassian-client-id
ATLASSIAN_CLIENT_SECRET=your-atlassian-client-secret
BITBUCKET_CLIENT_ID=your-bitbucket-client-id
BITBUCKET_CLIENT_SECRET=your-bitbucket-client-secret
BITBUCKET_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/oauth2/callback/bitbucket
RESEND_API_KEY=your-resend-api-key
RESEND_FROM=App Name <noreply@yourdomain.com>
```

**Frontend** (`apps/web/.env.local`):

```env
VITE_WEB_BASE_URL=http://localhost:5173
VITE_SERVER_BASE_URL=http://localhost:3000
```

### 4. Initialize Database

```bash
pnpm --filter api db:migrate
```

### 5. Generate Better Auth Schema

```bash
pnpm --filter api auth:generate
```

## Development

Start both backend and frontend:

```bash
# Terminal 1: Backend (auto-restart with nodemon)
pnpm dev:api

# Terminal 2: Frontend
pnpm dev:web
```

- API: http://localhost:3000
- Frontend: http://localhost:5173

## OAuth Integration Plan

### Step 1: Final Auth Flow Contract

- Primary authentication is Atlassian sign-in.
- Bitbucket is linked after login to the same user account.
- Provider data remains split by source:
  - Atlassian token for Atlassian APIs
  - Bitbucket token for Bitbucket APIs

### Step 2: Bitbucket OAuth Consumer Setup

Create a Bitbucket OAuth consumer and configure these values:

- Client ID: used as `BITBUCKET_CLIENT_ID`
- Client Secret: used as `BITBUCKET_CLIENT_SECRET`
- Callback URL (local): `http://localhost:3000/api/auth/oauth2/callback/bitbucket`

For production, use your deployed API base URL with the same callback path:

- `https://<your-api-domain>/api/auth/oauth2/callback/bitbucket`

### Step 3: Environment Contract

Ensure the API `.env` includes all required auth variables:

- `ATLASSIAN_CLIENT_ID`
- `ATLASSIAN_CLIENT_SECRET`
- `BITBUCKET_CLIENT_ID`
- `BITBUCKET_CLIENT_SECRET`
- `BITBUCKET_OAUTH_REDIRECT_URI` (optional override, recommended for clarity)

## Scripts

### Backend

```bash
pnpm dev:api        # Dev server with nodemon
pnpm build:api      # TypeScript build
pnpm typecheck:api  # Type checking
```

### Frontend

```bash
pnpm dev:web        # Dev server (requires bun)
pnpm build:web      # Production build
pnpm lint:web       # ESLint
```

### Database

```bash
pnpm --filter api db:generate   # Drizzle migrations
pnpm --filter api db:migrate    # Apply migrations
pnpm --filter api db:studio     # Drizzle Studio UI
```
