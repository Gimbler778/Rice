# IQM Rice — Timesheet & Work Tracking

A production-ready, full-stack monorepo for timesheet capture, weekly submission and manager approval. IQM Rice tracks engineering time across categories, links entries to Atlassian (Jira) and Bitbucket activity, and exposes role-based workflows for developers, managers, admins and auditors.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Monorepo | pnpm workspaces |
| Backend | Express 5, TypeScript, Better Auth, Drizzle ORM, PostgreSQL, pino |
| Frontend | React 19, React Router 7, TanStack Query 5, Vite, Tailwind CSS 4, shadcn/ui |
| Auth | Better Auth — email/password, Atlassian OAuth, Bitbucket OAuth account linking |
| Email | Resend (verification + password reset) |
| Validation | Zod (env) |
| Deployment | Vercel ready (`apps/web/vercel.json`) |

## Features

- **Timesheet entry** — daily time capture across categories (development, code review, testing, documentation, meetings, admin, support, learning, org sessions, events, manual_other) with Jira issue keys and source links.
- **Weekly submissions** — draft / submitted / approved / dismissed workflow with approver comments.
- **Manager & admin approvals** — role-based review of submitted work.
- **Reports & team reports** — time summaries across dates, categories and team members.
- **Learning log** — daily learning entries tagged `tech`, `product` or `process`.
- **Integrations** — Atlassian (Jira) and Bitbucket accounts linked to a single user profile.
- **Notifications** — contextual in-app notifications.
- **Calendar & follow-ups** — timeboxed views and pending-item tracking.
- **Role-based access** — `developer`, `manager`, `admin`, `auditor`.

## Project Structure

```
.
├── apps/
│   ├── api/                       # Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── index.ts           # Server entry, middleware, route mounting
│   │   │   ├── lib/               # Auth, env, logger, mail, Jira/teams clients
│   │   │   ├── routes/            # timesheets, integrations, learning, admin, notifications, categories
│   │   │   └── db/
│   │   │       ├── client.ts      # Drizzle client (node-postgres)
│   │   │       └── schema/        # Drizzle table definitions
│   │   ├── scripts/               # seed-demo-user.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   └── web/                       # React + Vite frontend
│       ├── src/
│       │   ├── main.tsx           # App entry
│       │   ├── lib/               # Auth client, API client, query client, theme, roles
│       │   ├── api/               # Per-domain API modules
│       │   ├── hooks/             # Shared data hooks
│       │   ├── page/              # Route pages (today, week, calendar, reports, …)
│       │   ├── components/        # UI components (shadcn/ui + custom)
│       │   └── types/             # Shared TypeScript types
│       ├── vercel.json            # SPA route rewriting
│       └── package.json
├── package.json                   # Root scripts (pnpm --filter)
├── pnpm-workspace.yaml
└── README.md
```

## Prerequisites

- Node.js 18+
- pnpm 10+
- bun (used by the API dev script)
- Docker (for local PostgreSQL)

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL

```bash
docker run --name iqm-rice-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=odoo_gv \
  -p 5432:5432 \
  -d postgres:16
```

### 3. Configure Environment

Copy the example files into the app directories:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

**Backend** (`apps/api/.env`):

```env
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/odoo_gv
BETTER_AUTH_SECRET=replace-with-a-long-random-secret-at-least-32-chars
BETTER_AUTH_URL=http://localhost:4000
ATLASSIAN_CLIENT_ID=your-atlassian-client-id
ATLASSIAN_CLIENT_SECRET=your-atlassian-client-secret
BITBUCKET_CLIENT_ID=your-bitbucket-client-id
BITBUCKET_CLIENT_SECRET=your-bitbucket-client-secret
BITBUCKET_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/oauth2/callback/bitbucket
RESEND_API_KEY=your-resend-api-key
RESEND_FROM=App Name <noreply@yourdomain.com>
CLOUDFLARE_ACCOUNT_ID=          # optional
CLOUDFLARE_API_TOKEN=           # optional
```

**Frontend** (`apps/web/.env.local`):

```env
VITE_WEB_BASE_URL=http://localhost:5173
VITE_SERVER_BASE_URL=http://localhost:4000
```

### 4. Initialize Database

Generate and apply migrations (requires `apps/api/.env` to point at a running PostgreSQL):

```bash
pnpm --filter api db:generate
pnpm --filter api db:migrate
```

### 5. Seed Demo Users (optional)

```bash
pnpm seed:demo
```

Demo credentials (password for all accounts: `Demo1234!`):

| Role | Email |
| --- | --- |
| Developer | `developer@iqm.local` |
| Manager | `manager@iqm.local` |
| Admin | `admin@iqm.local` |
| Auditor | `auditor@iqm.local` |

The seed script creates each user with a valid credential account, marks email as verified, and generates ~14 days of realistic timesheet entries.

### 6. Generate Better Auth Schema (if auth tables change)

```bash
pnpm --filter api auth:generate
```

## Development

```bash
# Terminal 1: Backend (auto-restart via bun watch)
pnpm dev:api

# Terminal 2: Frontend (Vite dev server)
pnpm dev:web
```

- API: http://localhost:4000 (`GET /health` returns `{ status: "ok" }`)
- Frontend: http://localhost:5173

## Available Scripts

All root scripts proxy into the workspace via `pnpm --filter`.

### Backend (`apps/api`)

```bash
pnpm dev:api          # Dev server with bun watch
pnpm build:api        # TypeScript build
pnpm typecheck:api    # Type checking (tsc --noEmit)
pnpm --filter api db:generate   # Generate Drizzle migrations
pnpm --filter api db:migrate    # Apply migrations
pnpm --filter api db:seed       # Seed demo users/entries (alias: pnpm seed:demo)
pnpm --filter api db:studio     # Drizzle Studio UI
pnpm --filter api auth:generate # Regenerate Better Auth schema
```

### Frontend (`apps/web`)

```bash
pnpm dev:web          # Vite dev server
pnpm build:web        # Type-check + production build
pnpm lint:web         # ESLint
```

## Authentication & OAuth

Authentication is handled by [Better Auth](https://better-auth.com) at `/api/auth/*`.

- Primary sign-in is email/password, with Atlassian OAuth also enabled.
- Bitbucket is linked to the same user account after login using a generic OAuth flow.
- Provider tokens are kept separate: Atlassian tokens drive Jira APIs, Bitbucket tokens drive Bitbucket APIs.
- Auth cookies use `SameSite=None; Secure; Partitioned`, so the session survives cross-site requests in local development.

### Bitbucket OAuth Consumer Setup

Create a Bitbucket OAuth consumer in Bitbucket workspace settings:

- **Client ID** → `BITBUCKET_CLIENT_ID`
- **Client Secret** → `BITBUCKET_CLIENT_SECRET`
- **Callback URL** → `BITBUCKET_OAUTH_REDIRECT_URI`

Scopes used by the consumer must include: `account`, `email`, `repository`, `pullrequest`.

Local callback: `http://localhost:4000/api/auth/oauth2/callback/bitbucket`

For production, use your deployed API base URL with the same callback path, e.g. `https://<your-api-domain>/api/auth/oauth2/callback/bitbucket`.

## Database Schema

Tables are defined in `apps/api/src/db/schema/` and managed with Drizzle Kit.

- `timesheet_entry` — daily time entries (category, hours, Jira issue key, source, status).
- `learning_entry` — daily learning log entries (unique per user per date).
- `category_config` — configurable entry categories (default + custom, colored, enable/disable).
- `weekly_submission` — weekly submissions with draft/submitted/approved/dismissed lifecycle.
- Notification + Better Auth tables (user, session, account, verification).

## Deployment

Both apps are Vercel-ready:

- `apps/web/vercel.json` configures SPA route rewriting for the React app.
- Render the API as a separate service on the platform of your choice; point `VITE_SERVER_BASE_URL` and `BETTER_AUTH_URL` at the deployed API domain and `CORS_ORIGIN` at the deployed frontend origin.