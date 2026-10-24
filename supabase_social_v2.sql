-- ═══════════════════════════════════════════════════════════
-- ANITR SOSYAL v2  —  Supabase SQL Editor'da bir kez çalıştırın
-- (Akış, beğeniler, yorumlar ve okundu bilgisi için gerekli)
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Mesajlarda "okundu" bilgisi
ALTER TABLE public.friend_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- 2) Akış gönderileri
CREATE TABLE IF NOT EXISTS public.social_posts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username TEXT NOT NULL,
    kind TEXT DEFAULT 'status',          -- status | review | recommend
    content TEXT,
    anime_title TEXT,
    anime_img TEXT,
    anime_id TEXT,
    anime_slug TEXT,
    rating INT,
    spoiler BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_posts_created_idx ON public.social_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS social_posts_user_idx ON public.social_posts (username);

-- 3) Beğeniler
CREATE TABLE IF NOT EXISTS public.social_likes (
    post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, username)
);

-- 4) Gönderi yorumları
CREATE TABLE IF NOT EXISTS public.social_post_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_post_comments_post_idx ON public.social_post_comments (post_id);

-- 5) Güvenlik (RLS) — mevcut tablolarla aynı mantık
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_posts_all" ON public.social_posts;
DROP POLICY IF EXISTS "social_likes_all" ON public.social_likes;
DROP POLICY IF EXISTS "social_post_comments_all" ON public.social_post_comments;

CREATE POLICY "social_posts_all" ON public.social_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "social_likes_all" ON public.social_likes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "social_post_comments_all" ON public.social_post_comments FOR ALL USING (true) WITH CHECK (true);
