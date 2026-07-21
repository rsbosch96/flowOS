import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuoteAssistant } from "@/features/quotes/components/quote-assistant";

export default async function NewQuotePage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const { data: company } = await supabase.from("companies").select("id,slug").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  return <QuoteAssistant companyId={company.id} companySlug={company.slug} />;
}
