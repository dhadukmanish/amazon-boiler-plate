-- Photo storage buckets + access rules. Run after schema.sql.
--   piece-photos  : public read (so <img> works), only owner / stock keeper can upload
--   return-photos : private (damage evidence), staff / stock / owner can upload and view
insert into storage.buckets (id, name, public) values ('piece-photos', 'piece-photos', true), ('return-photos', 'return-photos', false)
on conflict (id) do nothing;

create policy "piece photos are public" on storage.objects for select using (bucket_id = 'piece-photos');
create policy "owner/stock upload piece photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'piece-photos' and public.app_role() in ('owner', 'stock'));
create policy "owner/stock change piece photos" on storage.objects for update to authenticated
  using (bucket_id = 'piece-photos' and public.app_role() in ('owner', 'stock'));
create policy "owner/stock delete piece photos" on storage.objects for delete to authenticated
  using (bucket_id = 'piece-photos' and public.app_role() in ('owner', 'stock'));

create policy "team views return photos" on storage.objects for select to authenticated
  using (bucket_id = 'return-photos' and public.app_role() is not null);
create policy "team uploads return photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'return-photos' and public.app_role() in ('owner', 'staff', 'stock'));
create policy "owner deletes return photos" on storage.objects for delete to authenticated
  using (bucket_id = 'return-photos' and public.app_role() = 'owner');
