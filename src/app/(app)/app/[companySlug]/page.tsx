import { notFound, redirect } from "next/navigation";
import { Dashboard } from "@/features/dashboard/components/dashboard";
import { getDashboard } from "@/features/dashboard/queries/get-dashboard";
import { getPreferredLanguage } from "@/i18n/server";

export default async function CompanyDashboardPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const data = await getDashboard(companySlug);
  if (!data) redirect("/login");
  if (data.company.slug !== companySlug) notFound();
  return <Dashboard data={data} language={await getPreferredLanguage()} />;
}
