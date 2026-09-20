-- 社員番号（名簿との突き合わせ用。退職者データは氏名なし・社員番号のみで来るため）
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_employee_number ON public.employees (employee_number) WHERE employee_number IS NOT NULL;
COMMENT ON COLUMN public.employees.employee_number IS '社員番号（人事の名簿と同じ値。名簿の一括取込で登録）';
