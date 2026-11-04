import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const links: [string, string][] = [
    ["/dashboard", "Dashboard"],
    ["/leaves/apply", "Apply leave"],
    ["/leaves", "Leave history"],
    ["/calendar", "Calendar"],
    ...(user.role !== "EMPLOYEE" ? ([["/approvals", "Approvals"]] as [string, string][]) : []),
    ["/documents", "Policies"],
    ["/profile", "Profile"],
    ...(user.role === "ADMIN"
      ? ([["/admin/reports", "Reports"], ["/admin/users", "Users"], ["/admin/departments", "Departments"], ["/admin/balances", "Balances"], ["/admin/leave-types", "Leave types"], ["/admin/holidays", "Holidays"], ["/admin/settings", "Settings"]] as [string, string][])
      : []),
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <span className="mr-2 font-semibold">LMS</span>
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="text-gray-700 hover:text-blue-600 capitalize">{label}</Link>
          ))}
          <span className="ml-auto text-gray-500 capitalize">{user.name} · {user.role.toLowerCase()}</span>
          <form action={logout}><button className="text-gray-700 hover:text-blue-600 hover:cursor-pointer">Log out</button></form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
