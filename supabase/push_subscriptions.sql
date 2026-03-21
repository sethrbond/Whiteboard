-- Push subscriptions table for v8 push notifications
-- Run this in Supabase SQL editor to create the table

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- RLS: users can only manage their own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_push_subs" ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS for edge functions
-- (service_role key is used in push-notify function)

-- Add daily_plan column to user_data if not exists (for v7)
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS daily_plan JSONB DEFAULT NULL;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
