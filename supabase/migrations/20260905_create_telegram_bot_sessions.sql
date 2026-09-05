create table if not exists public.telegram_bot_sessions (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  user_id text not null,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  constraint telegram_bot_sessions_unique unique (chat_id, user_id)
);

create index if not exists telegram_bot_sessions_chat_user_idx
  on public.telegram_bot_sessions (chat_id, user_id);

create index if not exists telegram_bot_sessions_expires_idx
  on public.telegram_bot_sessions (expires_at);

alter table public.telegram_bot_sessions enable row level security;

-- No public policies: this table is used only by Supabase Edge Functions with the service role key.
