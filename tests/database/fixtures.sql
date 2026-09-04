-- SYNTHETIC LOCAL TEST DATA ONLY. Not a migration or a seed.sql.
-- The harness rolls back or resets the isolated stack after these tests.
insert into auth.users (id,email) values
  ('10000000-0000-4000-8000-000000000001','owner@bootstrap.invalid'),
  ('10000000-0000-4000-8000-000000000002','no-role@bootstrap.invalid'),
  ('10000000-0000-4000-8000-000000000003','pending@bootstrap.invalid'),
  ('10000000-0000-4000-8000-000000000004','disabled@bootstrap.invalid');
update public.profiles set status='active', phone='TEST-PHONE', display_name='TEST-PROFILE';
update public.profiles set status='pending' where id='10000000-0000-4000-8000-000000000003';
update public.profiles set status='disabled' where id='10000000-0000-4000-8000-000000000004';
insert into public.user_roles(user_id,role_id)
select p.id,r.id from public.profiles p cross join public.roles r
where r.code='owner' and p.id <> '10000000-0000-4000-8000-000000000002';

insert into public.room_types(id,code,name,default_capacity,base_rate)
values ('20000000-0000-4000-8000-000000000001','test_local','Test local',2,100);
insert into public.rooms(id,room_type_id,code,display_name,capacity,status)
values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','TEST','Synthetic test room',2,'ready');
insert into public.beds(room_id,code,bed_type,capacity,quantity)
values ('20000000-0000-4000-8000-000000000002','TEST','single',1,2);
insert into public.guests(id,first_name,last_name,phone,email,document_type,document_number,nationality_code,birth_date,emergency_contact)
values ('20000000-0000-4000-8000-000000000003','TEST-FIRST','TEST-LAST','0000000000','test@bootstrap.invalid','other','TEST-DOCUMENT','ZZ','2000-01-01','{"phone":"TEST-EMERGENCY"}');
insert into public.reservations(id,primary_guest_id,guest_count,check_in,check_out,status,source,nightly_rate,agreed_total,internal_summary,created_by)
select id,'20000000-0000-4000-8000-000000000003',1,current_date+30,current_date+32,'confirmed','other',100,200,'TEST-SUMMARY','10000000-0000-4000-8000-000000000001'
from unnest(array['20000000-0000-4000-8000-000000000004'::uuid,'20000000-0000-4000-8000-000000000005'::uuid]) id;
insert into public.internal_notes(entity_type,body,created_by)
values ('general','TEST-SENSITIVE-NOTE','10000000-0000-4000-8000-000000000001');
insert into public.housekeeping_tasks(room_id,notes,created_by)
values ('20000000-0000-4000-8000-000000000002','TEST-HOUSEKEEPING','10000000-0000-4000-8000-000000000001');
insert into public.maintenance_issues(area,title,description,reported_by)
values ('Test','Test issue','TEST-MAINTENANCE','10000000-0000-4000-8000-000000000001');

insert into public.wellness_products(id,code,name,product_type,active,sales_enabled,duration_minutes,pricing_rules,created_by,updated_by)
values ('30000000-0000-4000-8000-000000000001','test_local','Synthetic circuit','circuit_relax',true,true,180,'{"individual":100,"couple":150}',
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.wellness_slots(id,start_at,end_at,capacity_limit,external_capacity_limit,sales_enabled,status,created_by,updated_by)
values ('30000000-0000-4000-8000-000000000002',(current_date+30+time '10:00') at time zone 'America/Argentina/Buenos_Aires',
  (current_date+30+time '13:00') at time zone 'America/Argentina/Buenos_Aires',1,1,true,'open',
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
