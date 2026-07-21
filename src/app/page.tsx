import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("companies(slug)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const company = membership?.companies as unknown as { slug: string } | null;
  redirect(company ? `/app/${company.slug}` : "/onboarding");
}
