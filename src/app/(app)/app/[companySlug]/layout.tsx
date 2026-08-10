import Link from "next/link";
import {
  Building2,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MessageSquare,
  Package,
  CalendarDays,
  ReceiptText,
  Settings,
  Users,
} from "lucide-react";
import { getTranslations } from "@/i18n/get-translations";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const root = `/app/${companySlug}`;
  const { t } = getTranslations();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Building2 className="text-blue-700" /> AI FlowOS
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/onboarding" className="text-sm text-slate-600 hover:text-slate-950">
              {t("action.addOrganization")}
            </Link>
            <form action="/api/auth/signout" method="post">
              <button className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950">
                <LogOut size={16} /> {t("action.signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 md:grid-cols-[190px_1fr]">
        <aside>
          <nav className="space-y-1 text-sm">
            <Nav href={root} icon={LayoutDashboard} label={t("navigation.dashboard")} />
            <Nav href={`${root}/quotes`} icon={FileText} label={t("navigation.quotes")} />
            <Nav href={`${root}/invoices`} icon={ReceiptText} label={t("navigation.invoices")} />
            <Nav href={`${root}/catalog`} icon={Package} label={t("navigation.products")} />
            <Nav href={`${root}/conversations`} icon={MessageSquare} label={t("navigation.requests")} />
            <Nav href={`${root}/planning`} icon={CalendarDays} label="Planning" />
            <Nav href={`${root}/tasks`} icon={ListTodo} label={t("navigation.tasks")} />
            <Nav href={`${root}/team`} icon={Users} label={t("navigation.team")} />
            <Nav href={`${root}/settings`} icon={Settings} label={t("navigation.settings")} />
            <Nav href={`${root}/billing`} icon={ReceiptText} label={t("navigation.subscription")} />
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}

function Nav({ href, icon: Icon, label }: { href: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100">
      <Icon size={16} />{label}
    </Link>
  );
}
