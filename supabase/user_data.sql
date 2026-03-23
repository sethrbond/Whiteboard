-- Core data table for Whiteboards
-- Each authenticated user gets one row containing all their data as JSONB
CREATE TABLE IF NOT EXISTS user_data (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tasks       JSONB DEFAULT '[]'::jsonb,
  projects    JSONB DEFAULT '[]'::jsonb,
  ai_memory   JSONB DEFAULT '[]'::jsonb,
  ai_memory_archive JSONB DEFAULT '[]'::jsonb,
  settings    JSONB DEFAULT '{}'::jsonb,
  daily_plan  JSONB DEFAULT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_data_updated_at
  BEFORE UPDATE ON user_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data(user_id);
