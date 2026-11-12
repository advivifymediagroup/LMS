# LMS – Internal Leave Management

Next.js 16 (App Router) · PostgreSQL + Prisma 6 · iron-session · Tailwind. Plan: `../PLAN.md`.

## Run locally

Needs Node 24 and Docker Desktop.

```bash
npm install
cp .env.example .env        # then set SESSION_SECRET (command is in the file)
npm run db:up               # Postgres on localhost:5433, Mailpit on localhost:8025
npm run db:migrate          # apply schema
npm run db:seed             # sample users, teams, tasks, leave types, holidays
npm run dev                 # http://localhost:3000
npm test                    # unit tests (day count, CSV)
```

Seed logins (dev only): `ADM001`, `LEAD001`, `LEAD002`, `EMP001`–`EMP005`, or their `@example.com` emails.
Password for all: `Welcome@123`. `EMP005` joined 2026-09-15, so they're on probation (paid leave blocked).

## Advivify Portal

The app is styled to the "Advivify Portal" design (Manrope + IBM Plex Mono, warm neutrals, orange accent; tokens in `app/globals.css`).

- Dark sidebar with Workspace, Admin and Teams sections; header shows the role and section
- Dashboard per role: greeting, stats, due-soon tasks, leave balance or approvals (approve / decline with reason), teams overview for leads and admins, team activity for employees, onboarding checklist for new hires (their tasks of kind "Onboarding")
- Leave page (`/leave`): approvals, balance cards, request form, who's out for the next 10 working days, recent requests
- Tasks: team board (`/tasks/board`), My tasks (`/tasks`), create / edit / delete. Tasks are deliberately generic (team, assignee, status, priority, due date, free "kind" label) until each team's workflow is decided. Permissions: `lib/task-rules.ts` (tested)
- Analytics (`/analytics`, leads and admins): tasks completed and on-time rate, leave days by team this month
- Users & roles: search, role filter, CSV export

Not in this pass: courses, global search, notifications, single sign-on, two-level (HR) leave approval.

## What's built (Phases 0–3)

- Login with Employee ID or email; forced password change for new/reset users
- Roles: Admin, Team Lead, Employee. Every page and server action checks the role (`requireUser` in `lib/auth.ts`)
- Admin: users (create/edit/deactivate, reset password), departments, CSV import with opening balances, manual balance adjustments
- Apply leave with live day count and balance preview; approvals for leads (direct reports) and admins (everyone); cancel with refund
- Balances = sum of `LeaveLedger` rows. Every credit, deduction, refund and adjustment is a row, shown on the profile page
- Background jobs (`lib/jobs.ts`, started from `instrumentation.ts`, hourly): monthly CL credit, yearly SL/OL quota (pro-rated for joiners), year-end expiry above the carry-forward cap, 9:00 daily pending-approval reminder. All are safe to re-run. Admin → Settings has "Run jobs now"
- Emails (`lib/notify.ts`): applied (to approver + HR/Finance, CC teammates), approved/rejected, cancelled, reminder digest, password reset. SMTP is set in Admin → Settings; in dev, Mailpit catches everything
- Admin pages for leave types, holidays (fixed / optional) and settings
- Dashboards per role, leave history with filters, forgot-password by email
- Leave calendar (`/calendar`): month view of approved and pending leave plus holidays. Employees and leads see their department; admins see everyone or one department
- Reports (`/admin/reports`): approved days per employee and leave type for a date range, by department, with CSV download
- Policy documents (`/documents`): admins upload, replace and delete PDFs (content-checked, up to 10 MB, stored in the database); everyone can view and download

## Policy rules (AMG Leave Calendar and Policy 2026)

| Type | Rule |
| --- | --- |
| CL | 1/month, never expires. 2 days' notice; more than 2 days needs 5 days'. Blocked on probation and notice period. Sandwich counts |
| SL | 8/year, lapses at year end. Can be backdated 7 days. Certificate warning above 3 days |
| OL | 5/year, lapses at year end. Only on optional holidays, 1 day's notice |
| LWP | No balance needed; shown as unpaid. Sandwich counts |

All numbers are editable in Admin → Leave types. Holidays are the 2026 list. Automatic credits start from `creditsFrom` (2026-12); opening balances cover the time before.
Probation joiners get their CL months credited once probation ends.

Code: day count in `lib/leave-days.ts` (tested), checks in `lib/leave.ts` (`checkLeave`).

## Not yet built

- Google Calendar sync (deferred: the calendar is in-app only for now)
- Phase 4: login rate limiting, deploy
- Sandwich across two separate requests (e.g. Fri leave + Mon leave) isn't counted yet; the policy is still being decided
