ALTER TABLE certifications ADD COLUMN icon TEXT NOT NULL DEFAULT 'award' CHECK (icon IN ('award', 'star'));
ALTER TABLE certifications ADD COLUMN color TEXT NOT NULL DEFAULT 'emerald' CHECK (color IN ('emerald', 'gold', 'blue', 'purple', 'red', 'orange', 'pink', 'gray'));
