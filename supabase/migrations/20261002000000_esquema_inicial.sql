-- supabase/migrations/20261002000000_esquema_inicial.sql
-- Esquema del CMMS Biomédico en Supabase (Postgres). PREPARADO, NO APLICADO: se ejecuta solo
-- el día de la migración, con aprobación explícita (ver MIGRACION.md).
--
-- PRINCIPIOS
-- 1. Sin pérdida de datos: cada registro guarda su JSON original completo en `datos jsonb`
--    (todos los campos, también los que hoy no tienen columna propia). Las columnas tipadas
--    (empresa, sede, fecha, estado...) son COPIAS para consultar, filtrar e indexar; las
--    mantiene la capa de datos (lib/datos/supabase.js) en cada escritura.
-- 2. El historial de cada equipo (preventivos, correctivos, calibraciones, instalaciones,
--    documentos, bajas) va en tablas hijas: una edición toca solo el equipo modificado.
-- 3. Los archivos (base64) van a Supabase Storage (bucket privado `archivos`); en la tabla
--    `archivos` queda su ruta, empresa, tipo, tamaño y SHA-256.
-- 4. Acceso: el backend (funciones de Vercel) usa la clave service_role, que salta RLS. RLS
--    queda ACTIVADO en todas las tablas y SIN políticas para `anon`: nadie puede leer ni
--    escribir con la clave pública. Para `authenticated` se dejan políticas de solo lectura
--    por empresa (claim `empresa_id` del JWT) por si en el futuro se usa Supabase Auth.
-- 5. `cmms_versiones`: un contador por colección que sube con cada escritura (triggers). La
--    API lo usa como ETag/caché, igual que hoy `cmms:equipos:version` en Redis.

set client_min_messages = warning;

begin;

-- ---------------------------------------------------------------------------------------
-- Versiones por colección (caché y ETag)
-- ---------------------------------------------------------------------------------------
create table if not exists public.cmms_versiones (
  coleccion text primary key,
  version   bigint not null default 0
);
insert into public.cmms_versiones (coleccion) values
  ('empresas'), ('usuarios'), ('equipos'), ('personal'), ('reportes_falla'), ('capacitaciones'),
  ('planes_programas'), ('tecno_reportes'), ('tecno_transversal'), ('limpieza_desinfeccion'),
  ('limpieza_plantillas'), ('alert_emails')
on conflict do nothing;

create or replace function public.cmms_subir_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.cmms_versiones set version = version + 1 where coleccion = tg_argv[0];
  return null;
end $$;

-- ---------------------------------------------------------------------------------------
-- Empresas y sedes
-- ---------------------------------------------------------------------------------------
create table if not exists public.empresas (
  id          text primary key,
  nombre      text not null,
  nit         text,
  estado      text not null default 'activo' check (estado in ('activo', 'inactivo')),
  color       text,
  logo        text,
  orden       int  not null default 0,          -- posición original (la app las muestra en ese orden)
  datos       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists empresas_nombre_unico on public.empresas (lower(nombre));

create table if not exists public.sedes (
  empresa_id  text not null references public.empresas (id) on update cascade on delete cascade,
  nombre      text not null,
  orden       int  not null,
  primary key (empresa_id, nombre)
);

-- ---------------------------------------------------------------------------------------
-- Usuarios (login propio de la app; las sesiones siguen en Redis)
-- ---------------------------------------------------------------------------------------
create table if not exists public.usuarios (
  id             text primary key,
  email          text,
  username       text,
  nombre         text,
  role           text not null check (role in ('SUPER_ADMIN', 'EMPRESA', 'LECTURA')),
  empresa_id     text references public.empresas (id) on update cascade,
  estado         text not null default 'activo' check (estado in ('activo', 'inactivo')),
  password_hash  text,
  orden          int  not null default 0,
  datos          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint usuarios_empresa_por_rol check (role = 'SUPER_ADMIN' or empresa_id is not null)
);
create unique index if not exists usuarios_email_unico on public.usuarios (lower(email)) where email is not null and email <> '';
create unique index if not exists usuarios_username_unico on public.usuarios (lower(username)) where username is not null and username <> '';

-- ---------------------------------------------------------------------------------------
-- Equipos y su historial
-- ---------------------------------------------------------------------------------------
create table if not exists public.equipos (
  id            text primary key,
  empresa       text not null references public.empresas (id) on update cascade,
  sede          text,
  equipo        text,
  marca         text,
  modelo        text,
  numero_serie  text,
  inventario    text,
  estado        text,
  orden         bigint not null,               -- posición original en el arreglo de Redis
  version       bigint not null default 1,     -- control de concurrencia optimista
  datos         jsonb not null,                -- registro completo (sin los arreglos de historial no vacíos)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists equipos_empresa_sede on public.equipos (empresa, sede);
create index if not exists equipos_orden on public.equipos (orden);
create index if not exists equipos_serie on public.equipos (numero_serie);
create index if not exists equipos_inventario on public.equipos (inventario);

-- Las 6 tablas de historial comparten forma: equipo, posición, copia de empresa (para RLS y
-- filtros), fecha y estado como columnas de consulta, y el ítem completo en `datos`.
do $$
declare t text;
begin
  foreach t in array array['equipo_preventivos', 'equipo_correctivos', 'equipo_calibraciones',
                           'equipo_instalaciones', 'equipo_documentos', 'equipo_bajas'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id         bigint generated always as identity primary key,
        equipo_id  text not null references public.equipos (id) on update cascade on delete cascade,
        empresa    text not null,
        orden      int  not null,
        fecha      text,
        estado     text,
        datos      jsonb not null,
        unique (equipo_id, orden)
      );
      create index if not exists %1$s_empresa_fecha on public.%1$I (empresa, fecha);
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------
-- Personal y reportes de falla
-- ---------------------------------------------------------------------------------------
create table if not exists public.personal (
  id                text primary key,
  empresa           text not null references public.empresas (id) on update cascade,
  nombre_completo   text,
  numero_documento  text,
  cargo             text,
  estado            text,
  orden             bigint not null,
  version           bigint not null default 1,
  datos             jsonb not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists personal_empresa on public.personal (empresa);

create table if not exists public.reportes_falla (
  id          text primary key,
  empresa     text not null references public.empresas (id) on update cascade,
  sede        text,
  equipo_id   text,                              -- sin FK: el reporte sobrevive a la baja del equipo
  fecha       text,
  estado      text,
  prioridad   text,
  orden       bigint not null,
  version     bigint not null default 1,
  datos       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists reportes_falla_empresa_estado on public.reportes_falla (empresa, estado);
create index if not exists reportes_falla_equipo on public.reportes_falla (equipo_id);

-- ---------------------------------------------------------------------------------------
-- Capacitaciones (snapshot sincronizado desde Google Sheets)
-- ---------------------------------------------------------------------------------------
create table if not exists public.capacitaciones_registros (
  orden    int primary key,
  empresa  text not null,                        -- incluye 'OTRAS' (no es una empresa del CMMS)
  datos    jsonb not null
);
create index if not exists capacitaciones_registros_empresa on public.capacitaciones_registros (empresa);
create table if not exists public.capacitaciones_meta (
  id     int primary key default 1 check (id = 1),
  datos  jsonb not null                          -- snapshot sin `records` (errores, configuradas, updatedAt)
);

-- ---------------------------------------------------------------------------------------
-- Documentos por empresa (antes objetos { [empresa]: ... } en una sola clave)
-- ---------------------------------------------------------------------------------------
create table if not exists public.planes_programas (
  empresa  text not null references public.empresas (id) on update cascade on delete cascade,
  campo    text not null,
  valor    jsonb,
  primary key (empresa, campo)
);
create table if not exists public.tecno_reportes (
  empresa    text not null references public.empresas (id) on update cascade on delete cascade,
  sede       text not null,
  anio       text not null,
  trimestre  text not null,
  valor      jsonb,
  primary key (empresa, sede, anio, trimestre)
);
-- empresa = '' → valor global (plano) del documento; '_default' → valor heredado compartido.
create table if not exists public.tecno_transversal (
  doc_key  text not null,
  empresa  text not null default '',
  valor    jsonb,
  primary key (doc_key, empresa)
);
create table if not exists public.limpieza_desinfeccion (
  empresa  text not null references public.empresas (id) on update cascade on delete cascade,
  sede     text not null,
  anio     text not null,
  mes      text not null,
  datos    jsonb not null,                       -- { url, updatedAt }
  primary key (empresa, sede, anio, mes)
);
create table if not exists public.limpieza_plantillas (
  empresa  text primary key references public.empresas (id) on update cascade on delete cascade,
  datos    jsonb not null                        -- { nombre, tipo, tamano, archivoUrl|storage, updatedAt }
);
create table if not exists public.alert_emails (
  email  text primary key,
  orden  int not null
);

-- ---------------------------------------------------------------------------------------
-- Archivos en Storage (antes base64 dentro de Redis)
-- ---------------------------------------------------------------------------------------
create table if not exists public.archivos (
  ruta        text primary key,                  -- ruta dentro del bucket `archivos`
  empresa     text,                              -- null = archivo global (solo SUPER_ADMIN)
  tipo        text not null,
  tamano      bigint not null,
  sha256      text not null,
  encabezado  text,                              -- 'data:<tipo>;...;base64' original (para revertir byte a byte)
  origen      text,                              -- p. ej. 'equipos/eq_123/documentos/0/archivoDatos'
  created_at  timestamptz not null default now()
);
create index if not exists archivos_empresa on public.archivos (empresa);

-- ---------------------------------------------------------------------------------------
-- Registro de eliminaciones (para que la API refresque su caché de forma INCREMENTAL: pide
-- solo lo que cambió desde la última vez en vez de volver a descargar la colección completa)
-- ---------------------------------------------------------------------------------------
create table if not exists public.cmms_eliminados (
  tabla         text not null,
  id            text not null,
  eliminado_at  timestamptz not null default now()
);
create index if not exists cmms_eliminados_tabla_fecha on public.cmms_eliminados (tabla, eliminado_at);

create or replace function public.cmms_registrar_eliminado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cmms_eliminados (tabla, id) values (tg_table_name, old.id);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['equipos', 'personal', 'reportes_falla'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_eliminado', t);
    execute format('create trigger %I after delete on public.%I for each row execute function public.cmms_registrar_eliminado()', t || '_eliminado', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------
-- Triggers de versión
-- ---------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values
    ('empresas', 'empresas'), ('sedes', 'empresas'), ('usuarios', 'usuarios'),
    ('equipos', 'equipos'), ('equipo_preventivos', 'equipos'), ('equipo_correctivos', 'equipos'),
    ('equipo_calibraciones', 'equipos'), ('equipo_instalaciones', 'equipos'),
    ('equipo_documentos', 'equipos'), ('equipo_bajas', 'equipos'),
    ('personal', 'personal'), ('reportes_falla', 'reportes_falla'),
    ('capacitaciones_registros', 'capacitaciones'), ('capacitaciones_meta', 'capacitaciones'),
    ('planes_programas', 'planes_programas'), ('tecno_reportes', 'tecno_reportes'),
    ('tecno_transversal', 'tecno_transversal'), ('limpieza_desinfeccion', 'limpieza_desinfeccion'),
    ('limpieza_plantillas', 'limpieza_plantillas'), ('alert_emails', 'alert_emails')
  ) as v(tabla, coleccion) loop
    execute format('drop trigger if exists %I on public.%I', r.tabla || '_version', r.tabla);
    execute format('create trigger %I after insert or update or delete or truncate on public.%I
                    for each statement execute function public.cmms_subir_version(%L)',
                   r.tabla || '_version', r.tabla, r.coleccion);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------
-- Funciones de escritura atómica (las llama la API con la clave service_role)
-- ---------------------------------------------------------------------------------------

-- Guarda UN registro (equipos | personal | reportes_falla) y, opcionalmente, reemplaza los
-- arreglos de historial indicados en p_hijos ({ "equipo_preventivos": [...], ... }).
-- p_version: versión esperada (null = alta nueva). Si otro usuario guardó entretanto, lanza
-- 'cmms_conflicto' (HTTP 409) y la API relee y reintenta: nunca se pisa un cambio ajeno.
create or replace function public.cmms_guardar(p_tabla text, p_fila jsonb, p_hijos jsonb default null, p_version bigint default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id      text := p_fila->>'id';
  v_actual  bigint;
  v_nueva   bigint;
  v_cols    text;
  v_hijo    text;
begin
  if p_tabla not in ('equipos', 'personal', 'reportes_falla') then
    raise exception 'cmms_tabla_no_permitida: %', p_tabla;
  end if;
  execute format('select version from public.%I where id = $1 for update', p_tabla) into v_actual using v_id;
  if p_version is null and v_actual is not null then
    raise exception 'cmms_conflicto: el id % ya existe', v_id using errcode = '23505';
  end if;
  if p_version is not null and v_actual is distinct from p_version then
    -- PT409: PostgREST responde HTTP 409. (No usar 40001: PostgREST reintenta solo esos
    -- errores de serialización y, como el conflicto persiste, la petición nunca terminaría.)
    raise exception 'cmms_conflicto: versión esperada %, actual %', p_version, v_actual using errcode = 'PT409';
  end if;
  v_nueva := coalesce(v_actual, 0) + 1;

  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
    from pg_attribute
   where attrelid = format('public.%I', p_tabla)::regclass and attnum > 0 and not attisdropped
     and attname not in ('id', 'created_at', 'version', 'updated_at');
  execute format(
    'insert into public.%1$I as t (id, %2$s, version, updated_at)
       select id, %2$s, $2, now() from jsonb_populate_record(null::public.%1$I, $1)
     on conflict (id) do update set (%2$s, version, updated_at) =
       (select %2$s, $2, now() from jsonb_populate_record(null::public.%1$I, $1))',
    p_tabla, v_cols) using p_fila, v_nueva;

  if p_tabla = 'equipos' then
    foreach v_hijo in array array['equipo_preventivos', 'equipo_correctivos', 'equipo_calibraciones',
                                  'equipo_instalaciones', 'equipo_documentos', 'equipo_bajas'] loop
      if p_hijos ? v_hijo then
        execute format('delete from public.%I where equipo_id = $1', v_hijo) using v_id;
        execute format('insert into public.%I (equipo_id, empresa, orden, fecha, estado, datos)
                          select $1, $2, (e.ordinality - 1)::int, e.valor->>''fecha'', e.valor->>''estado'', e.valor
                            from jsonb_array_elements($3) with ordinality as e(valor, ordinality)', v_hijo)
          using v_id, p_fila->>'empresa', p_hijos->v_hijo;
      else
        -- Si el equipo cambió de empresa, la copia de `empresa` del historial se actualiza.
        execute format('update public.%I set empresa = $2 where equipo_id = $1 and empresa <> $2', v_hijo)
          using v_id, p_fila->>'empresa';
      end if;
    end loop;
  end if;
  return v_nueva;
end $$;

-- Alta en lote (importación de Excel y migración): inserta los registros que NO existen y
-- omite los que ya existen (idempotente). Cada elemento trae su historial en `_hijos`.
create or replace function public.cmms_insertar(p_tabla text, p_filas jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_elem jsonb;
  v_existe boolean;
  v_n int := 0;
begin
  if p_tabla not in ('equipos', 'personal', 'reportes_falla') then
    raise exception 'cmms_tabla_no_permitida: %', p_tabla;
  end if;
  for v_elem in select * from jsonb_array_elements(p_filas) loop
    execute format('select exists (select 1 from public.%I where id = $1)', p_tabla) into v_existe using v_elem->>'id';
    if not v_existe then
      perform public.cmms_guardar(p_tabla, v_elem - '_hijos', coalesce(v_elem->'_hijos', '{}'::jsonb), null);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Importación idempotente (scripts/migracion/importar-supabase.mjs): crea o ACTUALIZA cada
-- registro para que quede igual al respaldo (con todo su historial). Repetirla no duplica nada.
create or replace function public.cmms_importar(p_tabla text, p_filas jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_elem jsonb;
  v_version bigint;
  v_n int := 0;
begin
  if p_tabla not in ('equipos', 'personal', 'reportes_falla') then
    raise exception 'cmms_tabla_no_permitida: %', p_tabla;
  end if;
  for v_elem in select * from jsonb_array_elements(p_filas) loop
    execute format('select version from public.%I where id = $1', p_tabla) into v_version using v_elem->>'id';
    perform public.cmms_guardar(p_tabla, v_elem - '_hijos', coalesce(v_elem->'_hijos', '{}'::jsonb), v_version);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Reemplaza el snapshot completo de capacitaciones en una sola transacción.
create or replace function public.cmms_reemplazar_capacitaciones(p_meta jsonb, p_registros jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.capacitaciones_registros where true;
  insert into public.capacitaciones_registros (orden, empresa, datos)
    select (e.ordinality - 1)::int, coalesce(e.valor->>'empresa', ''), e.valor
      from jsonb_array_elements(coalesce(p_registros, '[]'::jsonb)) with ordinality as e(valor, ordinality);
  insert into public.capacitaciones_meta (id, datos) values (1, p_meta)
    on conflict (id) do update set datos = excluded.datos;
end $$;

-- Guarda una empresa y su lista de sedes (en orden) atómicamente.
create or replace function public.cmms_guardar_empresa(p_fila jsonb, p_sedes jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_id text := p_fila->>'id';
begin
  insert into public.empresas (id, nombre, nit, estado, color, logo, orden, datos, created_at, updated_at)
    select id, nombre, nit, estado, color, logo, coalesce(orden, 0), datos, coalesce(created_at, now()), now()
      from jsonb_populate_record(null::public.empresas, p_fila)
  on conflict (id) do update set nombre = excluded.nombre, nit = excluded.nit, estado = excluded.estado,
    color = excluded.color, logo = excluded.logo, orden = excluded.orden, datos = excluded.datos, updated_at = now();
  delete from public.sedes where empresa_id = v_id;
  insert into public.sedes (empresa_id, nombre, orden)
    select v_id, e.valor, (e.ordinality - 1)::int
      from jsonb_array_elements_text(coalesce(p_sedes, '[]'::jsonb)) with ordinality as e(valor, ordinality);
end $$;

-- Solo la clave service_role puede ejecutar las funciones de escritura.
revoke all on function public.cmms_guardar(text, jsonb, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.cmms_reemplazar_capacitaciones(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.cmms_insertar(text, jsonb) from public, anon, authenticated;
revoke all on function public.cmms_importar(text, jsonb) from public, anon, authenticated;
revoke all on function public.cmms_guardar_empresa(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.cmms_subir_version() from public, anon, authenticated;
revoke all on function public.cmms_registrar_eliminado() from public, anon, authenticated;
grant execute on function public.cmms_guardar(text, jsonb, jsonb, bigint) to service_role;
grant execute on function public.cmms_reemplazar_capacitaciones(jsonb, jsonb) to service_role;
grant execute on function public.cmms_insertar(text, jsonb) to service_role;
grant execute on function public.cmms_importar(text, jsonb) to service_role;
grant execute on function public.cmms_guardar_empresa(jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------
-- RLS: activado en todo; sin políticas para anon (acceso denegado con la clave pública)
-- ---------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['cmms_versiones', 'cmms_eliminados', 'empresas', 'sedes', 'usuarios', 'equipos',
    'equipo_preventivos', 'equipo_correctivos', 'equipo_calibraciones', 'equipo_instalaciones',
    'equipo_documentos', 'equipo_bajas', 'personal', 'reportes_falla', 'capacitaciones_registros',
    'capacitaciones_meta', 'planes_programas', 'tecno_reportes', 'tecno_transversal',
    'limpieza_desinfeccion', 'limpieza_plantillas', 'alert_emails', 'archivos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Solo lectura por empresa para un futuro uso de Supabase Auth (JWT con claim empresa_id).
-- Hoy la app NO usa estas políticas: todo pasa por la API con service_role.
create or replace function public.cmms_empresa_jwt() returns text
language sql stable as $$ select nullif(coalesce(auth.jwt() ->> 'empresa_id', ''), '') $$;

do $$
declare t text;
begin
  foreach t in array array['equipos', 'equipo_preventivos', 'equipo_correctivos', 'equipo_calibraciones',
    'equipo_instalaciones', 'equipo_documentos', 'equipo_bajas', 'personal', 'reportes_falla',
    'planes_programas', 'tecno_reportes', 'limpieza_desinfeccion', 'limpieza_plantillas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lectura_empresa', t);
    execute format('create policy %I on public.%I for select to authenticated using (empresa = public.cmms_empresa_jwt())',
                   t || '_lectura_empresa', t);
  end loop;
end $$;
drop policy if exists empresas_lectura_propia on public.empresas;
create policy empresas_lectura_propia on public.empresas for select to authenticated using (id = public.cmms_empresa_jwt());

-- ---------------------------------------------------------------------------------------
-- Bucket privado de Storage (solo si el esquema storage existe: en Supabase siempre)
-- ---------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('archivos', 'archivos', false)
    on conflict (id) do nothing;
  end if;
end $$;

commit;

-- Que PostgREST (API de Supabase) vea las tablas y funciones nuevas de inmediato.
notify pgrst, 'reload schema';
