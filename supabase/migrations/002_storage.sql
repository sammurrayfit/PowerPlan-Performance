-- Create storage bucket for exercise media (videos + images)
insert into storage.buckets (id, name, public)
values ('exercise-media', 'exercise-media', true)
on conflict (id) do nothing;

-- Authenticated users can read exercise media
create policy "exercise_media_read" on storage.objects
  for select using (bucket_id = 'exercise-media' and auth.role() = 'authenticated');

-- Authenticated users can upload exercise media
create policy "exercise_media_insert" on storage.objects
  for insert with check (bucket_id = 'exercise-media' and auth.role() = 'authenticated');

-- Authenticated users can update their uploads
create policy "exercise_media_update" on storage.objects
  for update using (bucket_id = 'exercise-media' and auth.role() = 'authenticated');

-- Authenticated users can delete their uploads
create policy "exercise_media_delete" on storage.objects
  for delete using (bucket_id = 'exercise-media' and auth.role() = 'authenticated');
