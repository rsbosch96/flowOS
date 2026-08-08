"use client";

import { useEffect } from "react";

export default function GlobalError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", event: "ui.unhandled_error", timestamp: new Date().toISOString() }));
  }, []);

  return <html lang="nl"><body className="bg-slate-50 text-slate-950"><main className="mx-auto flex min-h-screen max-w-lg items-center px-6"><section className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-semibold">Er is iets misgegaan</h1><p className="mt-2 text-sm text-slate-600">Probeer de pagina opnieuw. Blijft het probleem bestaan, neem dan contact op met support.</p><button type="button" onClick={reset} className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2">Opnieuw proberen</button></section></main></body></html>;
}
