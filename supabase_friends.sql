-- Supabase SQL Editor'da çalıştırılacak SQL komutları
-- Arkadaşlar ve Mesajlar sistemi için gerekli tablolar

-- 1. Profiller Tablosu (Kullanıcı adlarını ve son görülmeleri tutar)
CREATE TABLE IF NOT EXISTS public.profiles (
    username TEXT PRIMARY KEY,
    current_anime TEXT,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Arkadaşlar Tablosu
CREATE TABLE IF NOT EXISTS public.friends (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender TEXT REFERENCES public.profiles(username) ON DELETE CASCADE,
    receiver TEXT REFERENCES public.profiles(username) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', -- 'pending' veya 'accepted'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(sender, receiver)
);

-- 3. Mesajlar Tablosu
CREATE TABLE IF NOT EXISTS public.friend_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender TEXT REFERENCES public.profiles(username) ON DELETE CASCADE,
    receiver TEXT REFERENCES public.profiles(username) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Ayarları
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_messages ENABLE ROW LEVEL SECURITY;

-- Politikalar
CREATE POLICY "Herkes profilleri görebilir" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Kullanıcılar kendi profilini güncelleyebilir" ON public.profiles FOR ALL USING (true);

CREATE POLICY "Herkes arkadaşlıkları görebilir ve güncelleyebilir" ON public.friends FOR ALL USING (true);
CREATE POLICY "Herkes mesajları görebilir ve yazabilir" ON public.friend_messages FOR ALL USING (true);
