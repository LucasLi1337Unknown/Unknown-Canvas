create table public.unknown_canvas_strokes (
 id uuid primary key,
 seq bigint generated always as identity unique,
 color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
 width real not null check(width >= 1 and width <= 80),
 points jsonb not null check(jsonb_typeof(points)='array' and jsonb_array_length(points) between 1 and 400 and octet_length(points::text)<40000),
 min_x double precision not null, max_x double precision not null,
 min_y double precision not null, max_y double precision not null,
 created_at timestamptz not null default now()
);
create function public.validate_unknown_canvas_stroke() returns trigger language plpgsql security invoker set search_path = '' as $$
declare p jsonb; x double precision; y double precision;
begin
 new.min_x := 1e12; new.max_x := -1e12; new.min_y := 1e12; new.max_y := -1e12;
 for p in select value from jsonb_array_elements(new.points) loop
 if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2 or jsonb_typeof(p->0) <> 'number' or jsonb_typeof(p->1) <> 'number' then raise exception 'Invalid point'; end if;
 x := (p->>0)::double precision; y := (p->>1)::double precision;
 if abs(x)>1e9 or abs(y)>1e9 then raise exception 'Coordinate too large'; end if;
 new.min_x:=least(new.min_x,x); new.max_x:=greatest(new.max_x,x);
 new.min_y:=least(new.min_y,y); new.max_y:=greatest(new.max_y,y);
 end loop;
 new.created_at := now();
 return new;
end $$;
revoke all on function public.validate_unknown_canvas_stroke() from public, anon, authenticated;
create trigger validate_unknown_canvas_stroke before insert on public.unknown_canvas_strokes for each row execute function public.validate_unknown_canvas_stroke();
create index unknown_canvas_strokes_bounds on public.unknown_canvas_strokes(min_x,max_x,min_y,max_y);
alter table public.unknown_canvas_strokes enable row level security;
revoke all on public.unknown_canvas_strokes from anon,authenticated;
grant select on public.unknown_canvas_strokes to anon,authenticated;
grant insert(id,color,width,points) on public.unknown_canvas_strokes to anon,authenticated;
grant usage on sequence public.unknown_canvas_strokes_seq_seq to anon,authenticated;
create policy "Anyone can see the shared canvas" on public.unknown_canvas_strokes for select to anon,authenticated using(true);
create policy "Anyone can add a stroke" on public.unknown_canvas_strokes for insert to anon,authenticated with check(true);
