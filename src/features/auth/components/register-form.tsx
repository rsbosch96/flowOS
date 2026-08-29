"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export function RegisterForm() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function onSubmit(formData: FormData) {
    setError(undefined); setMessage(undefined);
    const supabase = createClient();
    const email = String(formData.get("email"));
    const { error } = await supabase.auth.signUp({ email, password: String(formData.get("password")), options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    if (error) { setError(error.message); return; }
    setMessage("Controleer je e-mail om je account te bevestigen.");
  }
  return <Card className="w-full space-y-6"><div className="flex justify-center"><Image src="/brand/flowos-logo.svg" alt="FlowOS" width={200} height={58} priority className="h-11 w-auto" /></div><div><h1 className="text-2xl font-semibold">Start met AI FlowOS</h1><p className="mt-1 text-sm text-slate-600">Maak je bedrijfsaccount aan.</p></div><form action={onSubmit} className="space-y-4"><label className="block text-sm font-medium">E-mail<input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-md border bg-white px-3 py-2" /></label><label className="block text-sm font-medium">Wachtwoord<input name="password" type="password" required minLength={12} autoComplete="new-password" className="mt-1 w-full rounded-md border bg-white px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p className="text-sm text-emerald-700">{message}</p>}<Button type="submit" className="w-full">Account maken</Button></form><p className="text-sm text-slate-600">Al een account? <Link className="font-medium text-blue-700" href="/login">Inloggen</Link></p></Card>;
}
