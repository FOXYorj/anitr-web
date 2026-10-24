-- Profil tablosuna ekstra özellikler (bio, discord, vs.) eklemek için SQL yaması

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discord TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fav_genre TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_color TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_watched BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_current BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Yorumlardaki resimleri de otomatik güncelleyen bir trigger (isteğe bağlı ama güzel olur)
