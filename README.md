# AI FlowOS

SaaS-basis voor Nederlandse installatiebedrijven: organisaties, rollen, Supabase-authenticatie en een RLS-gefilterd dashboard.

## Lokaal starten

1. Installeer Node.js 20.9 of hoger en voer `npm install` uit.
2. Kopieer `.env.example` naar `.env.local` en vul uitsluitend de browser-safe Supabase URL/anon key in om de app te starten. Server-secrets blijven leeg totdat de bijbehorende features worden toegevoegd.
3. Maak in Supabase een private Storage-bucket `company-documents`.
4. Plak eerst [outputs/database-schema.sql](./outputs/database-schema.sql) in de Supabase SQL editor of registreer het als migratie `001_initial.sql`; voer daarna `supabase/migrations/002_bootstrap_company.sql` uit.
5. Configureer in Supabase Auth de redirect URL `http://localhost:3000/auth/callback`.
6. Start met `npm run dev` en open `http://localhost:3000`.

## Veiligheidsgrenzen

- `NEXT_PUBLIC_*` bevat uitsluitend de Supabase URL en anon key.
- Gebruik de service-role key nooit in clientcode, Edge Middleware of logs.
- De database is beveiligd met RLS. De dashboardqueries gebruiken de sessie van de ingelogde gebruiker; een `companySlug` geeft dus geen extra toegang.
- De onboarding-RPC maakt organisatie en eigenaar in één transactie aan.
- Zet voor kosteloos lokaal testen `AI_MODE=mock` in `.env.local`. Deze modus genereert vaste testconcepten en is geblokkeerd in productie.

## Volgende bouwblokken

1. Document-upload met signed URLs, antivirus/OCR en jobstatus.
2. AI-documentextractie en de offerte-editor met review/provenance.
3. Stripe-webhooks, subscription-gating, n8n-HMAC-webhooks en audit logging.

Zie `outputs/architecture.md` en `outputs/api-design.md` voor de volledige ontwerpkeuzes.
