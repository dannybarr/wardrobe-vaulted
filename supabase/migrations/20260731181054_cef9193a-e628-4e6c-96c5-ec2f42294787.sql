insert into public.invites (code, email, note, max_uses)
values ('FOUNDER-DB-001', 'dannybarr092@gmail.com', 'Founder account for Danny Barr', 1)
on conflict (code) do nothing;