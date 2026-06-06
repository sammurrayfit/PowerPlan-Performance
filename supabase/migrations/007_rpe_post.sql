-- Add post-workout RPE to attendance
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS rpe_post integer CHECK (rpe_post >= 1 AND rpe_post <= 10);
