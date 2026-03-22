-- Create the task-attachments storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', true);

-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to read their own files
CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to delete their own files
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
