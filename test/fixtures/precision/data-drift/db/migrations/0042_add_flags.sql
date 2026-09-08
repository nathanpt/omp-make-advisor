-- 0042: user moderation flags. Applied in staging; schema.sql was never
-- updated to match.
ALTER TABLE users ADD COLUMN is_suspended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN suspension_reason TEXT;
