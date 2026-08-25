-- Chạy toàn bộ file này một lần trong Supabase > SQL Editor.
-- Hàm chỉ trả dữ liệu công khai cần cho bảng xếp hạng; không trả email hay dữ liệu riêng.

create or replace function public.get_global_leaderboard(limit_count integer default 10)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  total_exams bigint,
  streak integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with history_totals as (
    select h.user_id, count(*)::bigint as completed_exams
    from public.exam_history as h
    group by h.user_id
  ),
  ranked as (
    select
      u.id as user_id,
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'username'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'user_name'), ''),
        'Thành viên'
      )::text as display_name,
      coalesce(
        nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
        nullif(u.raw_user_meta_data ->> 'picture', ''),
        ''
      )::text as avatar_url,
      greatest(
        0,
        greatest(coalesce(s.completed_exams, 0)::bigint, coalesce(h.completed_exams, 0))
          + coalesce(s.admin_exam_bonus, 0)
      )::bigint as total_exams,
      greatest(
        0,
        coalesce(s.admin_streak_override, s.current_streak, 0)
      )::integer as streak
    from auth.users as u
    left join public.user_stats as s on s.user_id = u.id
    left join history_totals as h on h.user_id = u.id
  ),
  selected_users as (
    select top_total.user_id
    from (
      select r.user_id
      from ranked as r
      order by r.total_exams desc, r.display_name asc
      limit least(greatest(limit_count, 1), 20)
    ) as top_total
    union
    select top_streak.user_id
    from (
      select r.user_id
      from ranked as r
      order by r.streak desc, r.total_exams desc, r.display_name asc
      limit least(greatest(limit_count, 1), 20)
    ) as top_streak
  )
  select r.user_id, r.display_name, r.avatar_url, r.total_exams, r.streak
  from ranked as r
  inner join selected_users as picked on picked.user_id = r.user_id;
$$;

revoke all on function public.get_global_leaderboard(integer) from public;
revoke all on function public.get_global_leaderboard(integer) from anon;
grant execute on function public.get_global_leaderboard(integer) to authenticated;

comment on function public.get_global_leaderboard(integer) is
  'Top cày cuốc và giữ lửa toàn hệ thống, chỉ gồm dữ liệu hồ sơ công khai.';
