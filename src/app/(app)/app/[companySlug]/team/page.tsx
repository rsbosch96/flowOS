import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { TeamManager } from "@/features/team/components/team-manager";
export default async function TeamPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  const { data: members } = await supabase.from("company_memberships").select("user_id,role,users(email,full_name)").eq("company_id", company.id);
  const { data: invitations } = await supabase.rpc("list_company_invitations", { target_company_id: company.id });
  return <Card><h1 className="text-xl font-semibold">Team</h1><p className="mt-1 text-sm text-slate-600">Beheer actieve teamleden en veilige uitnodigingen.</p><div className="mt-6"><TeamManager companyId={company.id} members={(members ?? []) as unknown as Array<{ user_id: string; role: string; users: { email: string; full_name: string | null } | null }>} invitations={(invitations ?? []) as unknown as Array<{ id: string; email: string; role: string; status: string; expires_at: string }>} /></div></Card>;
}
