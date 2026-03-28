-- skills.category の固定CHECK制約を削除し、自由なカテゴリ名を許可する
ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_category_check;
