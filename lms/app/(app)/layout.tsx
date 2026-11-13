import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { probationEnd, todayIso } from "@/lib/leave";
import { logout } from "../login/actions";
import { SubmitButton } from "../submit-button";
import { Avatar } from "./ui";
import { PageTitle, SideNav, TeamNav, type NavItem } from "./nav";
import { PortalLoading } from "../loading-ui";
import { Logo } from "../logo";

const ROLE_LABEL = { ADMIN: "Admin", LEAD: "Team lead", EMPLOYEE: "Employee" } as const;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<PortalLoading label="Loading your workspace…" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const today = await todayIso();
  const approver = user.role !== "EMPLOYEE";
  const [pendingApprovals, openTasks, teams, dept, probation] = await Promise.all([
    approver
      ? db.leaveRequest.count({ where: { status: "PENDING", ...(user.role === "ADMIN" ? { userId: { not: user.id } } : { user: { managerId: user.id } }) } })
      : 0,
    db.task.count({ where: { assigneeId: user.id, status: { not: "DONE" } } }),
    db.department.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { tasks: { where: { status: { not: "DONE" } } } } } } }),
    user.departmentId ? db.department.findUnique({ where: { id: user.departmentId } }) : null,
    probationEnd(user),
  ]);
  const roleLabel = user.role === "EMPLOYEE" && today < probation ? "New hire" : ROLE_LABEL[user.role];

  const nav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/leave", label: "Leave", count: pendingApprovals, accent: true },
    { href: "/tasks", label: "My tasks", count: openTasks },
    { href: "/tasks/board", label: "Task board" },
    { href: "/calendar", label: "Calendar" },
    ...(approver ? [{ href: "/analytics", label: "Analytics" }] : []),
    { href: "/documents", label: "Policies" },
  ];
  const admin: NavItem[] = [
    { href: "/admin/users", label: "Users & roles" },
    { href: "/admin/departments", label: "Teams" },
    { href: "/admin/balances", label: "Balances" },
    { href: "/admin/leave-types", label: "Leave types" },
    { href: "/admin/holidays", label: "Holidays" },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/audit", label: "Audit log" },
  ];
  const heading = "hidden px-2.5 pb-2 font-mono text-[10.5px] font-medium tracking-[.12em] text-[#8d9096] uppercase md:block";

  return (
    <div className="flex min-h-screen flex-col bg-paper md:flex-row">
      <aside className="flex w-full flex-none flex-col gap-5 bg-char px-3.5 py-4 text-paper md:sticky md:top-0 md:h-screen md:w-[248px] md:gap-7 md:overflow-y-auto md:py-[22px]">
        <Link href="/dashboard" className="px-2">
          <Logo size={30} dark />
        </Link>
        <nav className="flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible">
          <div className={heading}>Workspace</div>
          <SideNav items={nav} />
        </nav>
        {user.role === "ADMIN" && (
          <nav className="flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible">
            <div className={heading}>Admin</div>
            <SideNav items={admin} />
          </nav>
        )}
        {teams.length > 0 && (
          <div className="hidden flex-col gap-0.5 md:flex">
            <div className={heading}>Teams</div>
            {/* useSearchParams needs a Suspense boundary. */}
            <Suspense>
              <TeamNav teams={teams.map((t) => ({ id: t.id, name: t.name, open: t._count.tasks }))} />
            </Suspense>
          </div>
        )}
        <div className="flex items-center gap-2.5 border-t border-white/[.08] px-2.5 pt-3 md:mt-auto">
          <Avatar name={user.name} className="size-[34px] bg-brand-500 text-xs font-extrabold text-char" />
          <Link href="/profile" className="flex min-w-0 flex-1 flex-col gap-px hover:text-white">
            <span className="truncate text-[13px] font-bold">{user.name}</span>
            <span className="truncate text-[11.5px] text-[#a9acb2]">{roleLabel}{dept ? ` · ${dept.name}` : ""}</span>
          </Link>
          <form action={logout}>
            <SubmitButton title="Sign out" pendingText="Signing out…" className="cursor-pointer font-mono text-[11px] font-medium text-[#a9acb2] hover:text-brand-400">Exit</SubmitButton>
          </form>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[72px] flex-none items-center gap-4 border-b border-[#e8e4de] bg-paper px-4 md:px-8">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="eyebrow">Advivify · {roleLabel}</div>
            <PageTitle />
          </div>
          <Link href="/leave#apply" className="btn btn-accent btn-sm h-10">Request leave</Link>
        </header>
        <div className="w-full max-w-[1440px] px-4 pt-7 pb-12 md:px-8">{children}</div>
      </main>
    </div>
  );
}
