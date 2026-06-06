-- Expand RPE columns to allow 0 (No exertion, at rest)
ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_rpe_pre_check,
  DROP CONSTRAINT IF EXISTS attendance_rpe_post_check;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_rpe_pre_check  CHECK (rpe_pre  >= 0 AND rpe_pre  <= 10),
  ADD CONSTRAINT attendance_rpe_post_check CHECK (rpe_post >= 0 AND rpe_post <= 10);
