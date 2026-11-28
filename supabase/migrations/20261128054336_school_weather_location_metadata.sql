alter table public.schools add column if not exists weather_location_address text, add column if not exists weather_location_mode text;
alter table public.schools add constraint school_weather_location_metadata check (
 (weather_location_mode is null and weather_location_address is null)
 or (weather_location_mode is not null and weather_location_mode in ('auto','manual') and weather_location_address is not null and char_length(btrim(weather_location_address)) between 1 and 240 and weather_nx is not null and weather_ny is not null)
);
grant update(weather_location_address,weather_location_mode) on public.schools to authenticated;
