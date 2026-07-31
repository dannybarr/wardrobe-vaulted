-- Private per-user files: path must start with the user's id, e.g. <uid>/garments/<file>.png
CREATE POLICY "wardrobe_private_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wardrobe-private' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "wardrobe_private_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wardrobe-private' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "wardrobe_private_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'wardrobe-private' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'wardrobe-private' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "wardrobe_private_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'wardrobe-private' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Demo assets: signed-in read only, writes are service-role only
CREATE POLICY "wardrobe_demo_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wardrobe-demo');