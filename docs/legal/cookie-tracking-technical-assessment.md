# CONCEPT — TECHNISCHE COOKIE- EN TRACKINGBEOORDELING

Datum: `[EFFECTIVE_DATE]` · eigenaar: `[LEGAL_COMPANY_NAME]`
Dit is een read-only technische inventaris; geen cookie-juridisch oordeel en
geen besluit over toestemming.

| Onderzoekspunt | Technisch bewijs in repository | Beoordeling voor legal review |
| --- | --- | --- |
| Auth-cookies | Supabase SSR leest/schrijft sessiecookies in `src/lib/supabase/server.ts` en `src/lib/supabase/middleware.ts` | Nodig voor sessie/auth; attributen en grondslag juridisch beoordelen |
| Local/session storage | Geen gebruik aangetroffen in `src`, `middleware.ts`, `package.json` of `next.config.ts` | Hercontrole bij nieuwe clientcode |
| Analytics/pixels | Geen PostHog, Google Analytics, Segment, Hotjar, Clarity, Facebook-pixel of vergelijkbare clientcode aangetroffen | Geen claim over browserextensies of toekomstige Vercel-instellingen |
| Advertentie-/remarketingtags | Geen code aangetroffen | Niet activeren zonder nieuwe beoordeling |
| Niet-essentiële cookies | Geen repositorybewijs aangetroffen | Browser/runtimecontrole nodig vóór launch |
| Vercel clienttracking | Geen `@vercel/analytics`-integratie aangetroffen | Platformtelemetrie/logvoorwaarden apart beoordelen |
| UptimeRobot | Monitort generieke `/api/health`; de publieke response bevat geen klant- of database-inhoud | Contract/logretentie en doorgiften beoordelen |

Als analytics, pixels, consent tooling of third-party scripts worden toegevoegd,
moet deze inventaris én de privacy/cookie-communicatie vóór release worden
herzien.
