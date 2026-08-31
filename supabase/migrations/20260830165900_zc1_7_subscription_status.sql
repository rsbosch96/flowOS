-- ZC1.7: internal commercial lifecycle states for the existing subscription enum.
alter type public.subscription_status add value if not exists 'grace_period';
alter type public.subscription_status add value if not exists 'suspended';
