import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ workflow: string }> }) {
  const secret = process.env.N8N_WEBHOOK_SECRET; if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const body = await request.text(); const signature = request.headers.get("x-ai-flowos-signature") ?? "";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const { workflow } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(workflow)) return NextResponse.json({ error: "Invalid workflow" }, { status: 400 });
  // Route each allow-listed workflow to an application use-case; never execute arbitrary n8n instructions.
  return NextResponse.json({ accepted: true, workflow }, { status: 202 });
}
