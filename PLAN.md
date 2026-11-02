# LMS – Internal Tool: Gaps & Build Plan

Source: `LMS - Internal Tool.docx` (13 feature sections + phases).

---

## 1. What's missing from the spec

### Must decide before coding (these change the data model)

| # | Gap | Why it matters | Suggested default |
|---|-----|----------------|-------------------|
| 1 | **Leave year** – calendar (Jan–Dec) or financial (Apr–Mar)? | Carry-forward and expiry run on this boundary. Doc only mentions the monthly cron. | Calendar year; year-end job on Jan 1. |
| 2 | **Sandwich rule** – "prevent" or "count"? | Most companies *count* the weekend/holiday between two leave days (Fri + Mon = 4 days), not block it. | Count it, configurable per leave type. |
| 3 | **Half-days** | Balances must be decimals (0.5 units). | Store days as `numeric(4,1)`. |
| 4 | **Who approves a Team Lead's leave? An Admin's?** | Hierarchy stops at Admin. | Lead → Admin; Admin auto-approved (or another Admin). |
| 5 | **Manager absent / no manager** | Requests get stuck. | Admin can approve any request. Delegation later. |
| 6 | **Cancellation flow** – "Cancelled" status exists, no flow. | Who can cancel, before/after approval, balance refund, calendar event removal. | Employee cancels pending anytime; approved only before start date → refund + delete calendar event + email. |
| 7 | **LWP behaviour** | No balance. Unlimited? Auto-switch when CL runs out? | Unlimited, no auto-switch; show warning. |
| 8 | **Optional Leave** | Usually "pick N from an optional-holiday list", not a monthly credit. | Yearly quota (e.g. 2), only on dates marked optional in Holidays. |
| 9 | **Mid-month joiners / leavers** | Credit pro-rata? | Credit if joined on/before 15th. Deactivate (soft delete) leavers – never hard-delete, history must remain. |
| 10 | **Backdated leave** (sick leave after the fact) | Validation rules block past dates otherwise. | SL allowed up to 7 days back; others future-only. |
| 11 | **Opening balances** | Employees already have balances on go-live day. | CSV import of users + opening balances. |

### Missing features worth adding (small, but you'll need them)

- **Admin manual balance adjustment** with reason (corrections happen constantly).
- **Balance ledger / audit trail** – every credit, debit, refund, expiry as a row. Answers "why is my balance 3.5?".
- **Bulk user import (CSV)** – nobody types 50+ employees by hand.
- **First-login password change**, password rules, login rate limiting.
- **More emails**: cancellation → manager, CC list on apply (doc mentions CC but not in §7), daily pending-approval reminder to leads.
- **Calendar sync on cancel** – delete the Google event too.
- **CSV export** for reports (HR will ask for it on day one).
- **Which leave types count working days only** vs calendar days.

### Questions to ask HR (not adding until confirmed)

- Other leave types? Maternity/paternity, bereavement, comp-off, WFH tracking?
- Probation rules (no leave in first N months?)
- Multiple office locations with different holiday lists?
- Max consecutive days / min notice period per leave type?

### Doc cleanup
- "Development Phases" appears twice with different lists – merge into one (the plan below does that).
- §5.2 "Prevent sandwich leaves" conflicts with gap #2 – clarify wording.

---

## 2. Recommended stack

One repo, one deployable app. No microservices for an internal tool.

| Need | Pick | Why |
|------|------|-----|
| App (UI + API) | **Next.js (App Router) + TypeScript** | One codebase for pages and API routes. |
| DB | **PostgreSQL** + **Prisma** | Relational data (users ↔ managers ↔ leaves), migrations built in. |
| Auth | Own credentials login (Employee ID + bcrypt password) + **httpOnly session cookie** (iron-session or Auth.js Credentials) | Spec wants Employee ID login, not Google SSO. |
| UI | **Tailwind + shadcn/ui** | Forms, tables, dialogs ready-made. |
| Calendar UI | **FullCalendar** | Team/department leave view with filters. |
| Email | **Nodemailer** (SMTP from settings) | Spec says SMTP. |
| Cron | **node-cron** in the app process, or host's cron hitting an API route | Monthly credit + year-end jobs. |
| Google Calendar | **googleapis** with a service account + domain-wide delegation | Writes to one shared calendar. |
| File uploads | Local disk / S3-compatible bucket | Policy documents. |
| Validation | **Zod** | Same schema client + server. |
| Hosting | Any Node host + managed Postgres (Railway, Render, a VPS) | Cron needs a long-running process or scheduled trigger. |

---

## 3. Data model (first draft)

```
users            id, employee_id (unique), name, email (unique), password_hash,
                 role [ADMIN|LEAD|EMPLOYEE], department_id, manager_id → users,
                 joining_date, is_active, must_change_password

departments      id, name

leave_types      id, code (CL/SL/LWP/OL), name, monthly_credit, yearly_quota,
                 max_carry_forward, needs_balance (false for LWP),
                 allow_half_day, sandwich_counts, backdate_days, is_active

leave_ledger     id, user_id, leave_type_id, days (+credit / −debit),
                 kind [MONTHLY_CREDIT|OPENING|LEAVE|REFUND|CARRY_FORWARD|EXPIRY|MANUAL],
                 leave_request_id?, note, created_by, created_at
                 UNIQUE(user_id, leave_type_id, kind, period)  -- makes cron safe to re-run
                 -- balance = SUM(days). No separate balance table to drift out of sync.

leave_requests   id, user_id, leave_type_id, start_date, end_date,
                 start_half [FULL|FIRST|SECOND], end_half, days (numeric),
                 reason, note, cc_emails[], status [PENDING|APPROVED|REJECTED|CANCELLED],
                 approver_id, decision_reason, decided_at, gcal_event_id, created_at

holidays         id, date, name, is_optional

settings         key, value (json)   -- working_days, timezone, smtp, gcal_calendar_id

documents        id, title, file_path, uploaded_by, created_at

password_resets  token_hash, user_id, expires_at
```

**Core function everything depends on:** `countLeaveDays(start, end, halves, leaveType)` – walks dates, skips non-working days and holidays (unless sandwich counts), subtracts half-days. Write unit tests for this first.

---

## 4. Build plan (merged phases)

### Phase 0 – Setup (2–3 days)
- [ ] Get answers to the 11 "must decide" items above
- [ ] `create-next-app`, Prisma, Postgres (local via Docker), Tailwind + shadcn
- [ ] Prisma schema from section 3, first migration
- [ ] Seed script: 1 admin, 2 departments, 2 leads, 5 employees, leave types, holidays
- [ ] Git repo, `.env.example`, README with run steps

### Phase 1 – Core leave loop (2–3 weeks) → *usable internally*
1. **Auth**: login (Employee ID + password), logout, session cookie, middleware guarding routes by role, forced password change on first login
2. **User & department management (Admin)**: list/create/edit/deactivate users, set role/department/manager, departments CRUD, CSV import
3. **Employee profile** page
4. **Apply leave**: form (type, dates, half-day, reason, CC, note), live day count + balance preview
5. **Validation** (server-side, Zod + DB checks): balance, overlap with own pending/approved leaves, sandwich rule, backdate limit, policy messages
6. **Approval**: lead sees pending for direct reports, approve / reject with reason; admin sees all
7. **Cancel** flow with balance refund
8. **Balance**: ledger-based; opening-balance import; admin manual adjustment

✅ Done when: employee applies → lead approves → balance drops; cancel restores it.

### Phase 2 – Policies, credits, emails, dashboards (2 weeks)
1. **Leave type config UI** (Admin): monthly credit, carry-forward cap, quotas, flags
2. **Monthly credit job** (1st of month, idempotent via unique key) + **year-end job** (carry forward up to cap, expire the rest)
3. **System settings**: working days, holidays list (with optional flag), timezone, SMTP
4. **Emails**: apply → lead (+CC list), decision → employee, cancel → lead, daily pending reminder
5. **Dashboards**: employee (balances, upcoming, recent), lead (pending, team overview), admin (stats)
6. **Leave history** with filters (status, type, date range)

✅ Done when: running the credit job twice changes nothing the second time; all 4 emails arrive.

### Phase 3 – Calendar, reports, documents (1.5–2 weeks)
1. **Internal calendar** (FullCalendar): team / department view, filters
2. **Google Calendar sync**: create event on approve, delete on cancel; store `gcal_event_id`; retry on failure (don't block approval if Google is down)
3. **Reports**: usage by employee/department/type, date range, CSV export
4. **Policy documents**: admin upload/replace/delete, employee view/download (PDF only, size limit)

### Phase 4 – Hardening & launch (1 week)
- [ ] RBAC check on every API route (test: employee hitting admin routes → 403)
- [ ] Rate limit login + password reset
- [ ] Input sanitization on free-text fields, file-type checks on uploads
- [ ] DB backups configured
- [ ] Deploy, import real employees + opening balances, pilot with one team, then roll out

**Total: roughly 7–9 weeks for one developer.**

---

## 5. Page / route map

```
/login, /forgot-password, /reset-password, /change-password
/dashboard                      (role-aware)
/leaves/apply
/leaves                         my history
/leaves/[id]                    detail + cancel
/approvals                      LEAD, ADMIN
/calendar
/documents
/admin/users  /admin/users/import
/admin/departments
/admin/leave-types
/admin/holidays
/admin/balances                 manual adjustments
/admin/settings
/admin/reports
```

---

## 6. Day-one checklist
1. Send HR the "must decide" table (section 1) and get answers
2. Ask IT for: SMTP credentials, a Google Workspace service account with domain-wide delegation, the shared calendar ID
3. Get the employee list (ID, name, email, department, manager) and current balances as a spreadsheet
4. Run Phase 0
