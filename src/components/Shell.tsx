"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { canAccess } from "@/lib/rbac";

type SessionUser = { id: string; name: string; email: string; role: string; centerId?: string | null; allowedModules?: string[] | null };

const NAV_GROUPS: { title: string; items: { mod: string; href: string; label: string; icon: string }[] }[] = [
  {
    title: "Workspace", items: [
      { mod: "dashboard", href: "/dashboard", label: "Dashboard", icon: "🏠" },
      { mod: "occupancy", href: "/occupancy", label: "Occupancy", icon: "🪑" },
      { mod: "centers", href: "/centers", label: "Centers", icon: "🏢" },
    ]
  },
  {
    title: "Sales", items: [
      { mod: "leads", href: "/leads", label: "CRM / Leads", icon: "📞" },
      { mod: "visitors", href: "/visitors", label: "Visitors / KYC", icon: "👤" },
      { mod: "proposals", href: "/proposals", label: "Proposals", icon: "📄" },
      { mod: "clients", href: "/clients", label: "Clients", icon: "🤝" },
      { mod: "referrals", href: "/referrals", label: "Referrals", icon: "🎁" },
    ]
  },
  {
    title: "Operations", items: [
      { mod: "vendors", href: "/vendors", label: "Vendors", icon: "🚚" },
      { mod: "procurement", href: "/procurement", label: "PR / PO", icon: "🧾" },
      { mod: "vendor_invoices", href: "/vendor-invoices", label: "Vendor Invoices", icon: "📥" },
      { mod: "recurring", href: "/recurring", label: "Recurring POs", icon: "🔁" },
      { mod: "inventory", href: "/inventory", label: "Inventory & Assets", icon: "📦" },
      { mod: "repairs", href: "/repairs", label: "Repairs", icon: "🔧" },
      { mod: "attendance", href: "/attendance", label: "Center Daily Logs", icon: "✅" },
      { mod: "bookings", href: "/bookings", label: "Meeting Rooms", icon: "📅" },
    ]
  },
  {
    title: "People", items: [
      { mod: "my_attendance", href: "/my-attendance", label: "My Attendance", icon: "🕒" },
      { mod: "staff_attendance", href: "/staff-attendance", label: "Staff Attendance", icon: "📍" },
      { mod: "leave_management", href: "/leave-management", label: "Leave Management", icon: "🏖️" },
    ]
  },
  {
    title: "Finance", items: [
      { mod: "invoices", href: "/invoices", label: "Client Invoices", icon: "💸" },
      { mod: "accounts", href: "/accounts", label: "Accounts / Ledger", icon: "📊" },
      { mod: "cashflow", href: "/accounts/cashflow", label: "Cashflow (Admin)", icon: "📈" },
      { mod: "contracts", href: "/contracts", label: "Contracts", icon: "📑" },
      { mod: "contracts_inbox", href: "/contracts-inbox", label: "Contracts Inbox", icon: "📨" },
    ]
  },
  {
    title: "Service", items: [
      { mod: "tickets", href: "/tickets", label: "Tickets", icon: "🎫" },
      { mod: "notices", href: "/notices", label: "Notice Board / Ads", icon: "📢" },
      { mod: "reviews", href: "/reviews", label: "Reviews / Feedback", icon: "⭐" },
      { mod: "sops", href: "/sops", label: "SOPs", icon: "📚" },
    ]
  },
  {
    title: "Admin", items: [
      { mod: "users", href: "/users", label: "Users", icon: "👥" },
      { mod: "audit_logs", href: "/audit-logs", label: "Audit Log", icon: "🔍" },
    ]
  },
];

export default function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => canAccess(user.role, i.mod, user.allowedModules)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <header className="lg:hidden flex items-center justify-between bg-white border-b px-4 py-3 sticky top-0 z-30">
        <button className="text-gray-600" onClick={() => setOpen(!open)}>☰</button>
        <img src="/logo.png" alt="Connect HQ" className="h-8 w-auto" />
        <button onClick={logout} className="text-xs text-gray-500">Logout</button>
      </header>
      <aside className={`${open ? "block" : "hidden"} lg:block lg:w-64 bg-gray-900 text-gray-200 flex-shrink-0 lg:min-h-screen p-4 lg:sticky lg:top-0 lg:h-screen overflow-y-auto`}>
        <div className="mb-6 hidden lg:block">
          <div className="bg-white/95 ring-1 ring-white/15 rounded-lg p-3 shadow-md flex items-center justify-center">
            <img src="/logo.png" alt="Connect HQ" className="w-full h-auto max-h-14 object-contain" />
          </div>
          <div className="text-xs text-gray-400 mt-2 text-center">{user.role}</div>
        </div>
        {visibleGroups.map((g) => (
          <div key={g.title} className="mb-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-2 mb-1">{g.title}</div>
            <nav className="space-y-0.5">
              {g.items.map((i) => {
                const active = pathname === i.href || pathname.startsWith(i.href + "/");
                return (
                  <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${active ? "bg-brand-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}>
                    <span>{i.icon}</span><span>{i.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
        <div className="mt-6 pt-4 border-t border-gray-700 hidden lg:block">
          <div className="text-xs text-gray-400 mb-2">{user.name}</div>
          <button onClick={logout} className="text-xs text-gray-300 hover:text-white">Logout →</button>
        </div>
      </aside>
      <main className="flex-1 p-4 lg:p-8 max-w-full">{children}</main>
    </div>
  );
}
