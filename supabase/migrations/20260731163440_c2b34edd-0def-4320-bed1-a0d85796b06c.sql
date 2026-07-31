-- ============ enums ============
CREATE TYPE public.app_role AS ENUM ('admin', 'founder', 'member');
CREATE TYPE public.image_kind AS ENUM ('original', 'cutout', 'thumbnail', 'modeled', 'reference');
CREATE TYPE public.wishlist_status AS ENUM ('pending', 'processing', 'ready', 'failed');

-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ app_config (server only) ============
CREATE TABLE public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
-- no policies: unreachable from browser, service role bypasses RLS

INSERT INTO public.app_config (key, value) VALUES ('founder_email', '');

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  is_founder BOOLEAN NOT NULL DEFAULT false,
  onboarding_step TEXT NOT NULL DEFAULT 'privacy',
  onboarding_completed_at TIMESTAMPTZ,
  ai_consent_at TIMESTAMPTZ,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE TO authenticated USING (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ user_roles ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ============ wardrobes ============
CREATE TABLE public.wardrobes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My wardrobe',
  is_primary BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wardrobes_owner_idx ON public.wardrobes (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wardrobes TO authenticated;
GRANT ALL ON public.wardrobes TO service_role;
ALTER TABLE public.wardrobes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wardrobes_select_own_or_demo" ON public.wardrobes FOR SELECT TO authenticated USING (owner_id = auth.uid() OR is_demo);
CREATE POLICY "wardrobes_insert_own" ON public.wardrobes FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wardrobes_update_own" ON public.wardrobes FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wardrobes_delete_own" ON public.wardrobes FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER wardrobes_updated_at BEFORE UPDATE ON public.wardrobes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ garments ============
CREATE TABLE public.garments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wardrobe_id UUID NOT NULL REFERENCES public.wardrobes(id) ON DELETE CASCADE,
  legacy_id TEXT,
  name TEXT NOT NULL DEFAULT 'Untitled piece',
  part TEXT NOT NULL DEFAULT 'upperbody',
  brand TEXT,
  occasion TEXT,
  value_amount NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  color TEXT,
  secondary_color TEXT,
  palette JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'import',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT garments_part_check CHECK (part IN ('upperbody','wholebody_up','lowerbody','accessories_up','shoes')),
  CONSTRAINT garments_legacy_unique UNIQUE (owner_id, legacy_id)
);
CREATE INDEX garments_owner_idx ON public.garments (owner_id);
CREATE INDEX garments_wardrobe_idx ON public.garments (wardrobe_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garments TO authenticated;
GRANT ALL ON public.garments TO service_role;
ALTER TABLE public.garments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "garments_select_own_or_demo" ON public.garments FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.wardrobes w WHERE w.id = garments.wardrobe_id AND w.is_demo));
CREATE POLICY "garments_insert_own" ON public.garments FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "garments_update_own" ON public.garments FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "garments_delete_own" ON public.garments FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER garments_updated_at BEFORE UPDATE ON public.garments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ garment_images ============
CREATE TABLE public.garment_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  garment_id UUID REFERENCES public.garments(id) ON DELETE CASCADE,
  kind public.image_kind NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'wardrobe-private',
  storage_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  byte_size BIGINT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX garment_images_garment_idx ON public.garment_images (garment_id, kind);
CREATE INDEX garment_images_owner_idx ON public.garment_images (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garment_images TO authenticated;
GRANT ALL ON public.garment_images TO service_role;
ALTER TABLE public.garment_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "garment_images_select_own_or_demo" ON public.garment_images FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.garments g JOIN public.wardrobes w ON w.id = g.wardrobe_id
    WHERE g.id = garment_images.garment_id AND w.is_demo));
CREATE POLICY "garment_images_insert_own" ON public.garment_images FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "garment_images_update_own" ON public.garment_images FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "garment_images_delete_own" ON public.garment_images FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ============ outfits ============
CREATE TABLE public.outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wardrobe_id UUID NOT NULL REFERENCES public.wardrobes(id) ON DELETE CASCADE,
  legacy_id TEXT,
  name TEXT NOT NULL DEFAULT 'Untitled look',
  colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  modeled_image_id UUID REFERENCES public.garment_images(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outfits_legacy_unique UNIQUE (owner_id, legacy_id)
);
CREATE INDEX outfits_owner_idx ON public.outfits (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfits TO authenticated;
GRANT ALL ON public.outfits TO service_role;
ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outfits_select_own_or_demo" ON public.outfits FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.wardrobes w WHERE w.id = outfits.wardrobe_id AND w.is_demo));
CREATE POLICY "outfits_insert_own" ON public.outfits FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "outfits_update_own" ON public.outfits FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "outfits_delete_own" ON public.outfits FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER outfits_updated_at BEFORE UPDATE ON public.outfits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.outfit_garments (
  outfit_id UUID NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  garment_id UUID NOT NULL REFERENCES public.garments(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (outfit_id, garment_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfit_garments TO authenticated;
GRANT ALL ON public.outfit_garments TO service_role;
ALTER TABLE public.outfit_garments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outfit_garments_select_own_or_demo" ON public.outfit_garments FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.outfits o JOIN public.wardrobes w ON w.id = o.wardrobe_id
    WHERE o.id = outfit_garments.outfit_id AND w.is_demo));
CREATE POLICY "outfit_garments_insert_own" ON public.outfit_garments FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "outfit_garments_update_own" ON public.outfit_garments FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "outfit_garments_delete_own" ON public.outfit_garments FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ============ wishlist_items ============
CREATE TABLE public.wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wardrobe_id UUID REFERENCES public.wardrobes(id) ON DELETE CASCADE,
  legacy_id TEXT,
  url TEXT,
  name TEXT,
  brand TEXT,
  price TEXT,
  part TEXT,
  color TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status public.wishlist_status NOT NULL DEFAULT 'pending',
  note TEXT,
  image_id UUID REFERENCES public.garment_images(id) ON DELETE SET NULL,
  modeled_image_id UUID REFERENCES public.garment_images(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wishlist_legacy_unique UNIQUE (owner_id, legacy_id)
);
CREATE INDEX wishlist_owner_idx ON public.wishlist_items (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wishlist_select_own_or_demo" ON public.wishlist_items FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.wardrobes w WHERE w.id = wishlist_items.wardrobe_id AND w.is_demo));
CREATE POLICY "wishlist_insert_own" ON public.wishlist_items FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wishlist_update_own" ON public.wishlist_items FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wishlist_delete_own" ON public.wishlist_items FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER wishlist_updated_at BEFORE UPDATE ON public.wishlist_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ model_profiles ============
CREATE TABLE public.model_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Me',
  bucket TEXT NOT NULL DEFAULT 'wardrobe-private',
  storage_path TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX model_profiles_owner_idx ON public.model_profiles (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_profiles TO authenticated;
GRANT ALL ON public.model_profiles TO service_role;
ALTER TABLE public.model_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_profiles_all_own" ON public.model_profiles FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ============ signup bootstrap ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  founder_email TEXT;
  is_founder_user BOOLEAN := false;
BEGIN
  SELECT NULLIF(lower(trim(value)), '') INTO founder_email FROM public.app_config WHERE key = 'founder_email';
  IF founder_email IS NOT NULL AND lower(NEW.email) = founder_email THEN
    is_founder_user := true;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, is_founder)
  VALUES (NEW.id, NEW.email, NULLIF(NEW.raw_user_meta_data->>'display_name', ''), is_founder_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_founder_user THEN 'founder'::public.app_role ELSE 'member'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.wardrobes (owner_id, name, is_primary)
  VALUES (NEW.id, 'My wardrobe', true);

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();