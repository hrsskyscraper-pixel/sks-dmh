-- 資格アイコンの色分け対応（クライアント指定の配色）
--   3級 = 青(blue) / 2級 = シルバー(silver) / 1級 = ゴールド(gold)
-- および「接客1級」の追加。
-- color の CHECK 制約に 'silver' を追加する。

alter table certifications drop constraint if exists certifications_color_check;
alter table certifications add constraint certifications_color_check
  check (color = any (array['emerald','gold','blue','purple','red','orange','pink','gray','silver']));

update certifications set color = 'silver' where name in ('調理２級', '接客２級');
update certifications set color = 'gold'   where name = '調理１級';

insert into certifications (name, description, order_index, is_active, icon, color)
  select '接客１級', '', 5, true, 'award', 'gold'
  where not exists (select 1 from certifications where name = '接客１級');
