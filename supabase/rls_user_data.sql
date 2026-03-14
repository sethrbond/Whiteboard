-- Enable RLS on user_data table and create policy
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/puchukhutxtilniqtlnt/sql)
-- Idempotent — safe to run multiple times

ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (idempotent)
DO $$ BEGIN
  DROP POLICY IF EXISTS "users_own_data" ON user_data;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Users can only SELECT/INSERT/UPDATE/DELETE their own rows
CREATE POLICY "users_own_data" ON user_data
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verify RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'user_data';
