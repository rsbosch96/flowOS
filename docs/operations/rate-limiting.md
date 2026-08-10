# Rate limiting (RC1)

`rate_limit_windows` bevat uitsluitend policy, SHA-256-subjecthash, vensterstart en teller. De tabel heeft geen directe clienttoegang; alleen de server-routehelper en de publieke offerte-RPC's gebruiken `consume_rate_limit`.

## Retentie

Er draait bewust geen cronjob in RC1. Verwijder periodiek, na controle in een onderhoudsvenster, windows ouder dan 32 dagen:

```sql
delete from public.rate_limit_windows
where window_start < now() - interval '32 days';
```

Dit verwijdert geen bedrijfs-, klant-, token- of inhoudsgegevens.
