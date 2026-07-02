-- Add name column to user_roles
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS name VARCHAR DEFAULT '' NOT NULL;
