-- Chạy một lần trong Supabase > SQL Editor.
-- 1) Thêm ô để admin ghi đè điểm trung bình.
-- 2) Tạo kho ảnh hồ sơ công khai, nhưng chỉ chủ tài khoản được sửa file của mình.

alter table public.user_stats
  add column if not exists admin_score_override numeric(4,2);

comment on column public.user_stats.admin_score_override is
  'Admin ghi điểm trung bình hiển thị từ 0 đến 10; để NULL để hệ thống tự tính.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_stats_admin_score_override_range'
      and conrelid = 'public.user_stats'::regclass
  ) then
    alter table public.user_stats
      add constraint user_stats_admin_score_override_range
      check (admin_score_override is null or admin_score_override between 0 and 10);
  end if;
end $$;

-- RPC thống kê cá nhân: luôn khóa theo auth.uid(), không cho client chọn user_id.
-- Dashboard vì vậy đọc được điểm admin mà không phụ thuộc policy SELECT hiện tại.
create or replace function public.get_my_user_stats()
returns table (
  completed_exams bigint,
  active_days integer,
  current_streak integer,
  longest_streak integer,
  last_study_date date,
  score_sum numeric,
  scored_count integer,
  admin_exam_bonus integer,
  admin_streak_override integer,
  admin_score_override numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with history_total as (
    select count(*)::bigint as value
    from public.exam_history as h
    where h.user_id = auth.uid()
  )
  select
    greatest(coalesce(s.completed_exams, 0)::bigint, h.value)::bigint,
    coalesce(s.active_days, 0)::integer,
    coalesce(s.current_streak, 0)::integer,
    coalesce(s.longest_streak, 0)::integer,
    s.last_study_date,
    coalesce(s.score_sum, 0)::numeric,
    coalesce(s.scored_count, 0)::integer,
    coalesce(s.admin_exam_bonus, 0)::integer,
    s.admin_streak_override::integer,
    s.admin_score_override::numeric
  from history_total as h
  left join public.user_stats as s on s.user_id = auth.uid()
  where auth.uid() is not null;
$$;

revoke all on function public.get_my_user_stats() from public;
revoke all on function public.get_my_user_stats() from anon;
grant execute on function public.get_my_user_stats() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 2097152, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own profile images" on storage.objects;
create policy "Users upload own profile images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own profile images" on storage.objects;
create policy "Users update own profile images"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own profile images" on storage.objects;
create policy "Users delete own profile images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
