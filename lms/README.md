# LMS – Internal Leave Management

Next.js 16 (App Router) · PostgreSQL + Prisma 6 · iron-session · Tailwind. Plan: `../PLAN.md`.

## Run locally

Needs Node 24 and Docker Desktop.

```bash
npm install
cp .env.example .env        # then set SESSION_SECRET (command is in the file)
npm run db:up               # Postgres on localhost:5433
npm run db:migrate          # apply schema
npm run db:seed             # sample users, leave types, holidays
npm run dev                 # http://localhost:3000
npm test                    # day-count unit tests
```

Seed logins (dev only): `ADM001`, `LEAD001`, `LEAD002`, `EMP001`–`EMP005`, or their `@example.com` emails.
Password for all: `Welcome@123`. `EMP005` joined 2026-09-15, so they're on probation (paid leave blocked).

## What's built (Phase 0 + 1)

- Login with Employee ID or email; forced password change for new/reset users
- Roles: Admin, Team Lead, Employee. Every page and server action checks the role (`requireUser` in `lib/auth.ts`)
- Admin: users (create/edit/deactivate, reset password), departments, CSV import with opening balances, manual balance adjustments
- Apply leave with live day count and balance preview; approvals for leads (direct reports) and admins (everyone); cancel with refund
- Balances = sum of `LeaveLedger` rows. Every credit, deduction, refund and adjustment is a row, shown on the profile page

## Policy rules (from the decisions doc)

| Rule | Where |
| --- | --- |
| Day count, half days, sandwich | `lib/leave-days.ts` (`countLeaveDays`, tested) |
| Notice, backdating, probation, optional-holiday-only, overlap, balance | `lib/leave.ts` (`checkLeave`) |
| Per-type settings (credit, notice, backdate, sandwich, half-day) | `LeaveType` table; admin UI comes in Phase 2 |
| Working days, timezone, probation months | `Setting` table |

Seeded leave-type numbers and holidays are placeholders. Replace them with the real policy.

## Not yet built

- Phase 2: monthly credit / year-end jobs, emails, leave-type / holiday / settings admin UI, history filters
- Phase 3: calendar view, reports, policy documents (Google Calendar sync deferred: app-only for now)
- Phase 4: login rate limiting, deploy
- Forgot-password by email (needs SMTP, Phase 2). Until then admins reset passwords
- Sandwich across two separate requests (e.g. Fri leave + Mon leave) isn't counted yet; the policy is still being decided
