-- Composite indexes for the hottest achievements filters
-- (.eq employee_id + status, and status='pending' scans by employee list)
create index if not exists idx_achievements_employee_status
  on achievements (employee_id, status);
create index if not exists idx_achievements_status_employee
  on achievements (status, employee_id);
