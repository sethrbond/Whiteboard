-- Minimal analytics: daily active users + page views
-- No personal data, no tracking, just counts
CREATE TABLE IF NOT EXISTS analytics (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event      TEXT NOT NULL DEFAULT 'pageview',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: anyone authenticated can insert, nobody can read (admin only via dashboard)
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can insert" ON analytics
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
