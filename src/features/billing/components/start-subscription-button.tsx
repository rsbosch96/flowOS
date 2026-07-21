"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function StartSubscriptionButton({ companyId }: { companyId: string }) { const [message, setMessage] = useState<string>(); async function start() { const response = await fetch(`/api/v1/companies/${companyId}/billing/checkout`, { method: "POST" }); const data = await response.json() as { url?: string; error?: { message?: string } }; if (data.url) window.location.assign(data.url); else setMessage(data.error?.message ?? "Checkout starten mislukt."); } return <div className="space-y-2"><Button onClick={start}>Start 14 dagen gratis</Button>{message && <p className="text-sm text-red-600">{message}</p>}</div>; }
