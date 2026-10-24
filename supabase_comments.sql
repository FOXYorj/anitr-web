-- Anitr yorum sistemi: eksik sütunları ekler (Supabase > SQL Editor'de bir kez çalıştır)
alter table public.comments add column if not exists avatar_url  text;
alter table public.comments add column if not exists parent_id   bigint;
alter table public.comments add column if not exists likes_count integer default 0;
alter table public.comments add column if not exists is_spoiler  boolean default false;

-- Beğeni güncellemesi için (zaten varsa hata verirse yok sayabilirsin)
do $$ begin
  create policy "anon can update likes" on public.comments for update using (true) with check (true);
exception when duplicate_object then null; end $$;
