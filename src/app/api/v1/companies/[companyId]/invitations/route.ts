import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({ email: z.string().trim().email().max(254), role: z.enum(["employee", "technician"]) });

function invitationError(error: { code?: string; message?: string }) {
  const value = error.message ?? "";
  const codes: Record<string, string> = {
    COMMERCIAL_SUBSCRIPTION_REQUIRED: "Een actief FlowOS-abonnement is vereist om teamleden uit te nodigen.",
    SEAT_LIMIT_REACHED: "Het maximumaantal teamleden is bereikt.",
    SEAT_CAPACITY_BELOW_USAGE: "De seatcapaciteit kan niet onder het huidige gebruik worden verlaagd.",
    INVITATION_ALREADY_PENDING: "Er staat al een uitnodiging klaar voor dit e-mailadres.",
    INVITATION_TARGET_ALREADY_MEMBER: "Deze gebruiker maakt al deel uit van dit team.",
    INVITATION_ROLE_NOT_ALLOWED: "Deze rol is niet toegestaan voor een uitnodiging.",
    INVITATION_EMAIL_INVALID: "Vul een geldig e-mailadres in.",
    MEMBERSHIP_OWNER_REQUIRED: "Alleen een eigenaar kan uitnodigingen beheren.",
  };
  const key = Object.keys(codes).find((candidate) => value.includes(candidate));
  return key ? codes[key] : "Uitnodiging kon niet worden aangemaakt.";
}

async function owner(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 }) };
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "owner") return { supabase, error: NextResponse.json({ error: { message: "Alleen een eigenaar kan uitnodigingen beheren." } }, { status: 403 }) };
  return { supabase, error: null };
}

export async function GET(_request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const access = await owner(companyId);
  if (access.error) return access.error;
  const { data, error } = await access.supabase.rpc("list_company_invitations", { target_company_id: companyId });
  if (error) return NextResponse.json({ error: { message: "Uitnodigingen konden niet worden geladen." } }, { status: 500 });
  return NextResponse.json({ invitations: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { message: "Controleer e-mail en rol." } }, { status: 400 });
  const { companyId } = await params;
  const access = await owner(companyId);
  if (access.error) return access.error;
  const { data, error } = await access.supabase.rpc("create_company_invitation", { target_company_id: companyId, target_email: parsed.data.email, target_role: parsed.data.role });
  if (error) return NextResponse.json({ error: { message: invitationError(error) } }, { status: error.message?.includes("SUBSCRIPTION") ? 403 : 409 });
  const invitation = data as Record<string, unknown> | null;
  const tokenEnabled = process.env.FLOWOS_INVITATION_TOKEN_MODE === "staging" && process.env.VERCEL_ENV !== "production";
  if (invitation && !tokenEnabled) delete invitation.token;
  return NextResponse.json({ invitation, delivery: "disabled", message: tokenEnabled ? "Uitnodiging aangemaakt. E-mailverzending is niet actief; de eenmalige testlink wordt één keer getoond." : "Uitnodiging aangemaakt. E-mailverzending is niet actief." });
}
