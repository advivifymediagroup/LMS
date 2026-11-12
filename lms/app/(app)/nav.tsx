"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type NavItem = { href: string; label: string; count?: number; accent?: boolean };

const active = (path: string, href: string) => (href === "/dashboard" ? path === href : path === href || path.startsWith(href + "/"));

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // Leave history and the old apply page live under /leaves; highlight "Leave" for them too.
  const current = items.filter((i) => active(path, i.href) || (i.href === "/leave" && path.startsWith("/leaves"))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <>
      {items.map((i) => {
        const on = i.href === current;
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-none items-center gap-2.5 rounded-lg p-2.5 text-sm font-semibold hover:bg-white/5 hover:text-white ${on ? "bg-white/[.08] text-white" : "text-[#b9bcc1]"}`}
          >
            <span className={`h-4 w-[3px] rounded-sm ${on ? "bg-brand-500" : "bg-transparent"}`} />
            <span className="flex-1 whitespace-nowrap">{i.label}</span>
            {!!i.count && <span className={`font-mono text-[11px] font-semibold ${i.accent ? "text-brand-400" : "text-[#8d9096]"}`}>{i.count}</span>}
          </Link>
        );
      })}
    </>
  );
}

export function TeamNav({ teams }: { teams: { id: number; name: string; open: number }[] }) {
  const path = usePathname();
  const team = useSearchParams().get("team");
  return (
    <>
      {teams.map((t) => {
        const on = path === "/tasks/board" && team === String(t.id);
        return (
          <Link key={t.id} href={`/tasks/board?team=${t.id}`} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] hover:bg-white/5 hover:text-white ${on ? "text-white" : "text-[#b9bcc1]"}`}>
            <span className={`size-[7px] rounded-[2px] ${on ? "bg-brand-500" : "bg-gray-600"}`} />
            <span className="flex-1">{t.name}</span>
            <span className="font-mono text-[11px] text-[#8d9096]">{t.open || ""}</span>
          </Link>
        );
      })}
    </>
  );
}

const SECTIONS: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/leave", "Leave"],
  ["/leaves", "Leave"],
  ["/approvals", "Leave"],
  ["/calendar", "Leave calendar"],
  ["/tasks/board", "Task board"],
  ["/tasks", "Tasks"],
  ["/analytics", "Team analytics"],
  ["/documents", "Policies"],
  ["/profile", "Profile"],
  ["/admin/users", "Users & roles"],
  ["/admin/reports", "Reports"],
  ["/admin", "Admin"],
];

export function PageTitle() {
  const path = usePathname();
  const hit = path === "/tasks" ? [path, "My tasks"] : SECTIONS.find(([p]) => path === p || path.startsWith(p + "/"));
  return <div className="truncate text-[19px] font-extrabold tracking-[-0.02em]">{hit?.[1] ?? ""}</div>;
}
