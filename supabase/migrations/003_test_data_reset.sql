-- =============================================
-- テストデータ一括消去
-- ※ work_hours / achievements は CASCADE で自動削除されます
-- =============================================

DELETE FROM employees
WHERE email LIKE '%@example.test';
