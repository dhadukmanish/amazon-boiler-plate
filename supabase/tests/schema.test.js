const fs = require('fs');
const { PGlite } = require('@electric-sql/pglite');
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
const root = require('path').join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

(async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  // --- Supabase stubs ---
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
  `);
  await db.exec(fs.readFileSync(root + 'schema.sql', 'utf8'));
  await db.exec(`grant usage on schema public to anon, authenticated; grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;`);
  ok(true, 'schema.sql ran without error');

  const owner = (await db.query(`insert into auth.users(email) values ('owner@x.in') returning id`)).rows[0].id;
  const staff = (await db.query(`insert into auth.users(email) values ('staff@x.in') returning id`)).rows[0].id;
  const stock = (await db.query(`insert into auth.users(email) values ('stock@x.in') returning id`)).rows[0].id;
  await db.exec(`update profiles set role='stock' where id='${stock}'`);
  const roles = (await db.query(`select profiles.email as email, role from profiles join auth.users u on u.id=profiles.id order by 1`)).rows;
  ok(roles.find((r) => r.email === 'owner@x.in').role === 'owner', 'first user became owner');
  ok(roles.find((r) => r.email === 'staff@x.in').role === 'staff', 'second user became staff');

  // run SQL as a given user
  const as = async (uid, sql) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false)`);
    try { return await db.query(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false)`); }
  };
  const err = async (uid, sql) => { try { await as(uid, sql); return null; } catch (e) { return e; } };

  // base data (as superuser)
  await db.exec(`
    insert into outfits (piece_no,name,category,size,rent_per_day,deposit) values (1014,'Royal Red','Navratri','M',900,2000),(1031,'Peacock','Wedding','M',1200,2500),(1036,'Gold Zari','Bridal','M',3000,9000);
    update outfits set status='repair' where piece_no=1036;
    insert into customers (name,phone) values ('Priya Patel','98250 11122'),('Riya Desai','99250 77788');
  `);
  const today = (await db.query(`select shop_today() d`)).rows[0].d.toISOString().slice(0, 10);
  const d = (n) => `(shop_today() + ${n})`;

  // --- create_booking ---
  let r = await as(staff, `select create_booking(1014, 3001, ${d(1)}, ${d(3)}, 3800, 'upi', 'test') id`);
  const b1 = r.rows[0].id; ok(b1 >= 1100, 'staff created booking ' + b1);
  let bk = (await db.query(`select * from bookings where id=${b1}`)).rows[0];
  ok(+bk.rent === 2700 && +bk.deposit === 2000, `rent computed server-side (3 days x 900 = ${bk.rent}), deposit ${bk.deposit}`);
  let pay = (await db.query(`select type, amount from payments where booking_id=${b1} order by type`)).rows;
  ok(pay.length === 2 && +pay.find((p) => p.type === 'deposit').amount === 2000 && +pay.find((p) => p.type === 'advance').amount === 1800, 'advance split: deposit 2000 + advance 1800');

  let e = await err(staff, `select create_booking(1014, 3002, ${d(2)}, ${d(4)}, 0, 'cash', '')`);
  ok(e && /piece_already_booked/.test(e.message), 'overlapping booking rejected: ' + (e && e.message) + ' / ' + (e && e.detail));
  e = await err(staff, `select create_booking(1014, 3002, ${d(4)}, ${d(5)}, 0, 'cash', '')`);
  ok(e && /piece_already_booked/.test(e.message), 'booking on cleaning-buffer day rejected');
  r = await as(staff, `select create_booking(1014, 3002, ${d(5)}, ${d(6)}, 0, 'cash', '') id`);
  ok(r.rows[0].id > b1, 'booking after the buffer day accepted');
  e = await err(staff, `select create_booking(1036, 3002, ${d(2)}, ${d(3)}, 0, 'cash', '')`);
  ok(e && /piece_in_repair/.test(e.message), 'piece in repair cannot be booked');
  e = await err(staff, `select create_booking(1031, 3002, ${d(-2)}, ${d(1)}, 0, 'cash', '')`);
  ok(e && /past_date/.test(e.message), 'past date rejected');
  e = await err(stock, `select create_booking(1031, 3002, ${d(2)}, ${d(3)}, 0, 'cash', '')`);
  ok(e && /forbidden/.test(e.message), 'stock keeper cannot create bookings');

  // raw insert can never bypass the constraint, even as owner
  e = await err(owner, `insert into bookings (piece_no,customer_id,from_date,to_date,rent,deposit) values (1014, 3002, ${d(2)}, ${d(2)}, 1, 1)`);
  ok(e && /no_double_booking/.test(e.message), 'database constraint blocks overlapping rows even for direct inserts');

  // --- hand_over ---
  e = await err(staff, `select hand_over(${b1}, 0, 'cash')`);
  ok(e && /balance_due/.test(e.message), 'hand over without paying balance rejected (due ' + (e && e.detail) + ')');
  // make booking start today so we can hand over: new booking today on 1031
  r = await as(staff, `select create_booking(1031, 3002, ${d(0)}, ${d(2)}, 1000, 'cash', '') id`); const b2 = r.rows[0].id;
  // 1031: rent 3600 + 2500 = 6100, paid 1000 -> due 5100
  e = await err(staff, `select hand_over(${b2}, 5000, 'cash')`); ok(e && /balance_due/.test(e.message) && parseFloat(e.detail) === 5100, 'partial balance rejected, due=5100');
  await as(staff, `select hand_over(${b2}, 5100, 'cash')`);
  ok((await db.query(`select status from bookings where id=${b2}`)).rows[0].status === 'out' && (await db.query(`select status from outfits where piece_no=1031`)).rows[0].status === 'rented', 'hand over -> booking out, piece rented');

  // --- complete_return with damage > deposit-late ---
  await db.exec(`update bookings set from_date=${d(-5)}, to_date=${d(-2)} where id=${b2}`);   // pretend it is 2 days overdue
  e = await err(staff, `select complete_return(${b2}, '[]'::jsonb, 9999, 0, 'cash', 'cleaning', '')`);
  ok(e && /late_fee_too_high/.test(e.message), 'staff cannot charge more late fee than allowed (max ' + (e && e.detail) + ')');
  const items = JSON.stringify([{ name: 'Dupatta', state: 'major', charge: 800 }, { name: 'Choli (blouse)', state: 'ok', charge: 999 }, { name: 'Cleanliness', state: 'minor', charge: 200 }]);
  r = await as(staff, `select * from complete_return(${b2}, '${items}'::jsonb, 600, 0, 'upi', 'repair', 'torn border')`);
  const ret = r.rows[0];
  ok(+ret.deposit_held === 2500 && +ret.late_fee === 600 && +ret.damage_total === 1000 && +ret.net_refund === 900, `settlement: deposit 2500 - late 600 - damage 1000 = refund ${ret.net_refund}`);
  ok((await db.query(`select count(*) c from return_items where return_id=${ret.id}`)).rows[0].c == 3, 'return items stored');
  ok((await db.query(`select charge from return_items where return_id=${ret.id} and item like 'Choli%'`)).rows[0].charge == 0, 'OK items never carry a charge');
  const refund = (await db.query(`select amount from payments where booking_id=${b2} and type='refund'`)).rows;
  ok(refund.length === 1 && +refund[0].amount === 900, 'refund payment recorded');
  ok((await db.query(`select status from outfits where piece_no=1031`)).rows[0].status === 'repair', 'piece sent to repair');
  e = await err(staff, `select complete_return(${b2}, '[]'::jsonb, 0, 0, 'cash', 'cleaning', '')`);
  ok(e && /not_out/.test(e.message), 'cannot return the same booking twice');

  // customer owes money: deductions larger than deposit
  await db.exec(`update outfits set status='available' where piece_no=1031`);
  r = await as(staff, `select create_booking(1031, 3001, ${d(10)}, ${d(10)}, 0, 'cash', '') id`); const b3 = r.rows[0].id;
  await db.exec(`update bookings set status='out', from_date=${d(-3)}, to_date=${d(-1)} where id=${b3}; insert into payments (booking_id,type,amount) values (${b3},'deposit',2500);`);
  r = await as(owner, `select * from complete_return(${b3}, '[{"name":"Ghagra (skirt)","state":"missing","charge":3000}]'::jsonb, 300, 0, 'cash', 'cleaning', '')`);
  ok(+r.rows[0].net_refund === -800, 'net refund negative when deductions exceed deposit: ' + r.rows[0].net_refund);
  const coll = (await db.query(`select type, amount from payments where booking_id=${b3} and type in ('late_fee','damage') order by type`)).rows;
  ok(coll.length === 2 && +coll.find((x) => x.type === 'late_fee').amount === 300 && +coll.find((x) => x.type === 'damage').amount === 500, 'collected 800 split into late fee 300 + damage 500');

  // --- RLS ---
  const stockPay = await as(stock, `select count(*) c from payments`);
  ok(stockPay.rows[0].c == 0, 'stock keeper sees no payments');
  ok((await as(stock, `select count(*) c from customers`)).rows[0].c == 0, 'stock keeper sees no customers');
  ok((await as(stock, `select count(*) c from outfits`)).rows[0].c == 3, 'stock keeper sees outfits');
  ok((await as(staff, `select count(*) c from payments`)).rows[0].c > 0, 'staff sees payments');
  e = await err(staff, `update outfits set rent_per_day = 1 where piece_no = 1014`);
  const touched = (await db.query(`select rent_per_day from outfits where piece_no=1014`)).rows[0].rent_per_day;
  ok(+touched === 900, 'staff direct UPDATE on outfits changes nothing (RLS)');
  e = await err(staff, `delete from bookings`); ok((await db.query(`select count(*) c from bookings`)).rows[0].c > 0, 'staff cannot delete bookings');
  ok((await as(staff, `select count(*) c from audit_log`)).rows[0].c == 0, 'staff cannot read audit log');
  ok((await as(owner, `select count(*) c from audit_log`)).rows[0].c > 0, 'owner reads audit log');
  const v = await as(staff, `select status, late_days, paid_in from bookings_v where id=${b2}`);
  ok(v.rows[0].status === 'returned', 'bookings_v works for staff');

  // --- other RPCs ---
  e = await err(staff, `select upsert_outfit(1099,'X','c','M',100,100)`); ok(e && /forbidden/.test(e.message), 'staff cannot add outfits');
  await as(stock, `select upsert_outfit(1099,'Teal Sequin','Navratri / Garba','S',850,1800,'#00838f','#7cb342','')`);
  ok((await db.query(`select name from outfits where piece_no=1099`)).rows.length === 1, 'stock keeper adds an outfit');
  e = await err(stock, `select set_outfit_status(1099,'rented','')`); ok(e && /use_hand_over/.test(e.message), 'cannot set rented by hand');
  await as(stock, `select set_outfit_status(1099,'cleaning','Ready tomorrow')`);
  ok((await db.query(`select status, note from outfits where piece_no=1099`)).rows[0].status === 'cleaning', 'stock keeper sets cleaning');
  e = await err(staff, `select add_customer('Dup','98250 11122')`); ok(e && /customer_exists/.test(e.message) && e.detail == '3001', 'duplicate phone rejected, points to customer ' + (e && e.detail));
  r = await as(staff, `select add_customer('Kajal Mehta','+91 99090-22233','Surat') id`); ok((await db.query(`select phone from customers where id=${r.rows[0].id}`)).rows[0].phone === '99090 22233', 'phone normalised to 99090 22233');
  e = await err(staff, `select add_customer('Bad','123')`); ok(e && /bad_phone/.test(e.message), 'bad phone rejected');
  await as(staff, `select record_payment(${b1}, 'balance', 'cash', 500, 'x')`);
  e = await err(staff, `select record_payment(${b1}, 'balance', 'cash', 0, 'x')`); ok(e && /bad_amount/.test(e.message), 'zero payment rejected');
  await as(staff, `select cancel_booking(${b1}, 'customer changed mind')`);
  ok((await db.query(`select status from bookings where id=${b1}`)).rows[0].status === 'cancelled', 'cancel upcoming booking');
  r = await as(staff, `select create_booking(1014, 3002, ${d(1)}, ${d(2)}, 0, 'cash', '') id`); ok(r.rows[0].id > 0, 'cancelled booking frees the piece for new bookings');
  e = await err(stock, `select add_comment(${b1}, 'stock keepers cannot see bookings')`); ok(e && /forbidden/.test(e.message), 'stock keeper cannot comment on bookings (no "See bookings")');
  await as(staff, `select add_comment(${b1}, 'Checked the piece, ready')`);
  ok((await db.query(`select count(*) c from booking_events where booking_id=${b1}`)).rows[0].c >= 3, 'timeline events written');
  e = await err((await db.query(`select gen_random_uuid() id`)).rows[0].id, `select create_booking(1014,3002,${d(20)},${d(21)},0,'cash','')`); ok(e && /forbidden/.test(e.message), 'signed-in user without a profile is forbidden');
  e = await err(staff, `select * from shop_settings`); ok(!e, 'staff reads settings');
  await as(staff, `select update_customer(3001, 'Priya P. Patel', 'Surat', 'Voter ID', 'prefers red')`);
  ok((await db.query(`select notes from customers where id=3001`)).rows[0].notes === 'prefers red', 'staff updates customer details via RPC');
  e = await err(stock, `select update_customer(3001, 'X', '', '', '')`); ok(e && /forbidden/.test(e.message), 'stock cannot update customers');
  e = await err(staff, `select update_customer(3001, '  ', '', '', '')`); ok(e && /empty_name/.test(e.message), 'empty customer name rejected');
  r = await as(staff, `select create_booking(1031, 3002, ${d(30)}, ${d(31)}, 0, 'cash', '') id`); const bp = r.rows[0].id;
  const ret2 = (await db.query(`insert into returns (booking_id, returned_on, deposit_held, net_refund, next_status) values (${bp}, shop_today(), 0, 0, 'cleaning') returning id`)).rows[0].id;
  await as(staff, `select add_return_photo(${ret2}, 'x/1.jpg')`); ok((await db.query(`select count(*) c from return_photos where return_id=${ret2}`)).rows[0].c == 1, 'staff attaches a return photo via RPC');

  // =================== permissions (the owner edits these in Settings) ===================
  const cnt = async (uid, sql) => +(await as(uid, sql)).rows[0].c;
  ok((await db.query(`select count(*)::int c from permissions`)).rows[0].c === 24, '24 permissions defined');
  { // the list in js/data.js (used for labels, the matrix and page gating) must be identical to the database
    global.window = {}; require(require('path').join(__dirname, '..', '..', 'js', 'data.js')); const RR = global.window.RR;
    const dbp = (await db.query(`select key, grp, label, description from permissions order by sort`)).rows;
    ok(JSON.stringify(dbp) === JSON.stringify(RR.PERMS), 'permission list in js/data.js is identical to the database (keys, groups, labels, descriptions, order)');
    for (const role of ['staff', 'stock']) {
      const dbs = (await db.query(`select perm from role_permissions where role='${role}' and allowed order by perm`)).rows.map((x) => x.perm);
      ok(JSON.stringify(dbs) === JSON.stringify([...RR.DEFAULT_PERMS[role]].sort()), `default permissions of ${role} match between js/data.js and the database`);
    }
    ok(Object.entries(RR.PERM_NEEDS).every(([k, v]) => RR.PERMS.some((p) => p.key === k) && v.every((x) => RR.PERMS.some((p) => p.key === x))), 'every "needs" reference points to a real permission');
  }
  ok((await db.query(`select count(*)::int c from role_permissions where role='staff' and allowed`)).rows[0].c === 17 && (await db.query(`select count(*)::int c from role_permissions where role='stock' and allowed`)).rows[0].c === 5, 'defaults: counter staff 17 permissions, stock keeper 5');
  ok((await db.query(`select count(*)::int c from role_permissions where role='owner'`)).rows[0].c === 0, 'owner has no stored rows: it simply has every permission');
  ok((await as(owner, `select has_perm('manage_users') p`)).rows[0].p === true && (await as(staff, `select has_perm('manage_users') p`)).rows[0].p === false, 'has_perm: owner yes, staff no');

  // dates-only view for people without "See bookings"
  ok(await cnt(stock, `select count(*) c from bookings`) === 0, 'stock keeper cannot read the bookings table (rent, deposit, customers)');
  const slots = (await as(stock, `select * from booking_slots`));
  ok(slots.rows.length > 0 && !('rent' in slots.rows[0]) && !('customer_id' in slots.rows[0]), 'stock keeper sees availability through booking_slots: dates and status only');
  ok(await cnt(staff, `select count(*) c from bookings`) > 0, 'staff reads bookings');

  // paid totals per booking are visible with "See bookings" even without "See payments"
  await as(owner, `select set_role_permissions('staff', (select array_agg(perm) from role_permissions where role='staff' and allowed and perm <> 'view_payments'))`);
  ok(await cnt(staff, `select count(*) c from payments`) === 0, 'staff without "See payments" cannot read the payments table');
  const money = await as(staff, `select * from booking_money where booking_id = ${b2}`);
  ok(money.rows.length === 1 && +money.rows[0].paid > 0 && !('amount' in money.rows[0]), 'but sees how much each booking has paid (totals only), so balances stay correct');
  ok(await cnt(stock, `select count(*) c from booking_money`) === 0, 'stock keeper gets nothing from booking_money');
  await as(owner, `select set_role_permissions('staff', (select array_agg(perm) from role_permissions where role='staff' and allowed) || array['view_payments'])`);

  // matrix changes take effect immediately
  e = await err(staff, `select set_role_permissions('stock', array['view_inventory'])`); ok(e && /forbidden/.test(e.message), 'staff cannot edit permissions (no "Manage users")');
  await as(owner, `select set_role_permissions('staff', array['view_dashboard','view_calendar','view_bookings','create_booking','handover','receive_return','view_payments','take_payment','view_customers','edit_customers','view_inventory','set_outfit_status','print_tags'])`);
  r = await as(owner, `select create_booking(1031, 3002, ${d(40)}, ${d(41)}, 0, 'cash', '') id`); const bc = r.rows[0].id;
  e = await err(staff, `select cancel_booking(${bc}, 'x')`); ok(e && /forbidden/.test(e.message), 'owner removed "Cancel a booking" from staff: staff is refused immediately');
  await as(owner, `select set_role_permissions('staff', array['view_dashboard','view_calendar','view_bookings','create_booking','handover','receive_return','cancel_booking','view_payments','take_payment','view_customers','edit_customers','view_inventory','set_outfit_status','print_tags'])`);
  await as(staff, `select cancel_booking(${bc}, 'x')`); ok(true, 'permission given back: staff can cancel again');
  await as(owner, `select set_role_permissions('stock', array['view_inventory','manage_outfits','set_outfit_status','print_tags','view_calendar','view_payments'])`);
  ok(await cnt(stock, `select count(*) c from payments`) > 0, 'owner gave stock "See payments": stock now reads payments');
  await as(owner, `select set_role_permissions('stock', array['view_calendar','view_inventory','manage_outfits','set_outfit_status','print_tags'])`);
  ok(await cnt(stock, `select count(*) c from payments`) === 0, 'and taking it away hides payments again');
  e = await err(owner, `select set_role_permissions('owner', array['view_dashboard'])`); ok(e && /owner_is_fixed/.test(e.message), 'the owner role cannot be edited');
  e = await err(owner, `select set_role_permissions('staff', array['fly_to_moon'])`); ok(e && /unknown_permission/.test(e.message), 'unknown permission rejected');

  // late fee override is its own permission
  r = await as(staff, `select create_booking(1031, 3002, ${d(50)}, ${d(50)}, 0, 'cash', '') id`); const bl = r.rows[0].id;
  await db.exec(`update bookings set status='out', from_date=${d(-4)}, to_date=${d(-2)} where id=${bl}; insert into payments (booking_id,type,amount) values (${bl},'deposit',2500);`);
  e = await err(staff, `select complete_return(${bl}, '[]'::jsonb, 5000, 0, 'cash', 'cleaning', '')`); ok(e && /late_fee_too_high/.test(e.message), 'without "override late fee" staff cannot raise the late fee');
  await as(owner, `select set_role_permissions('staff', (select array_agg(perm) from role_permissions where role='staff' and allowed) || array['override_late_fee'])`);
  r = await as(staff, `select * from complete_return(${bl}, '[]'::jsonb, 5000, 0, 'cash', 'cleaning', '')`); ok(+r.rows[0].late_fee === 5000, 'with the permission, the staff member can');
  await as(owner, `select set_role_permissions('staff', (select array_agg(perm) from role_permissions where role='staff' and allowed and perm <> 'override_late_fee'))`);

  // delegating "Manage users"
  const mgr = (await db.query(`insert into auth.users(email) values ('manager@x.in') returning id`)).rows[0].id;
  await as(owner, `select set_user_role('${mgr}', 'staff', true)`);
  await as(owner, `select set_role_permissions('staff', (select array_agg(perm) from role_permissions where role='staff' and allowed) || array['manage_users'])`);
  e = await err(mgr, `select set_role_permissions('stock', array['view_reports'])`); ok(e && /forbidden/.test(e.message), 'a delegated manager cannot give a permission they do not hold (view_reports)');
  e = await err(mgr, `select set_role_permissions('stock', array['view_inventory','manage_users'])`); ok(e && /forbidden/.test(e.message), 'and cannot hand out "Manage users"');
  await as(mgr, `select set_role_permissions('stock', array['view_inventory','print_tags'])`); ok((await db.query(`select count(*)::int c from role_permissions where role='stock' and allowed`)).rows[0].c === 2, 'but can narrow down what stock keepers may do');
  e = await err(mgr, `select set_user_role('${owner}', 'staff', true)`); ok(e && /forbidden/.test(e.message), 'a manager cannot demote the owner');
  e = await err(mgr, `select set_user_role('${staff}', 'owner', true)`); ok(e && /forbidden/.test(e.message), 'a manager cannot make someone an owner');
  await as(mgr, `select set_user_role('${stock}', 'staff', true)`); ok((await db.query(`select role from profiles where id='${stock}'`)).rows[0].role === 'staff', 'a manager can move people between staff and stock roles');
  await as(mgr, `select set_user_role('${stock}', 'stock', true)`);
  await as(owner, `select set_role_permissions('staff', (select array_agg(perm) from role_permissions where role='staff' and allowed and perm <> 'manage_users'))`);
  await as(owner, `select set_role_permissions('stock', array['view_calendar','view_inventory','manage_outfits','set_outfit_status','print_tags'])`);

  // user safety rules
  e = await err(owner, `select set_user_role('${owner}', 'staff', true)`); ok(e && /cannot_change_self/.test(e.message), 'nobody can change their own role');
  const o2 = (await db.query(`insert into auth.users(email) values ('owner2@x.in') returning id`)).rows[0].id;
  await as(owner, `select set_user_role('${o2}', 'owner', true)`); ok((await db.query(`select role from profiles where id='${o2}'`)).rows[0].role === 'owner', 'an owner can appoint a second owner');
  await as(o2, `select set_user_role('${owner}', 'staff', true)`); ok((await db.query(`select role from profiles where id='${owner}'`)).rows[0].role === 'staff', 'one owner can demote the other');
  e = await err(owner, `select set_user_role('${o2}', 'staff', true)`); ok(e && /forbidden/.test(e.message), 'the demoted person has lost owner power at once');
  await as(o2, `select set_user_role('${owner}', 'owner', true)`);
  await db.exec(`update profiles set role='staff' where id='${o2}'`);
  e = await err(owner, `select set_user_role(gen_random_uuid(), 'staff', true)`); ok(e && /user_not_found/.test(e.message), 'unknown user rejected');

  // a switched-off person loses everything at once
  await as(owner, `select set_user_role('${staff}', 'staff', false)`);
  e = await err(staff, `select create_booking(1031,3002,${d(60)},${d(61)},0,'cash','')`); ok(e && /forbidden/.test(e.message), 'a deactivated user is refused everywhere');
  ok(await cnt(staff, `select count(*) c from bookings`) === 0, 'and can read nothing');
  await as(owner, `select set_user_role('${staff}', 'staff', true)`);

  // names are stamped on events and audit entries
  ok((await db.query(`select by_name from booking_events where booking_id=${b1} and kind='comment'`)).rows[0].by_name === 'staff', 'timeline events carry the name of who did it');
  ok((await db.query(`select count(*)::int c from audit_log where by_name = 'owner'`)).rows[0].c > 0, 'audit entries carry the name too');

  // audit
  ok((await as(owner, `select count(*) c from audit_log where action in ('set_role_permissions','set_user_role')`)).rows[0].c > 0, 'permission and role changes are written to the audit log');

  // =================== bridal salon + weddings ===================
  const RRd = global.window.RR, sq = (a) => a.map((k) => `'${k}'`).join(',');
  await as(owner, `select set_role_permissions('staff', array[${sq(RRd.DEFAULT_PERMS.staff)}])`);
  await as(owner, `select set_role_permissions('stock', array[${sq(RRd.DEFAULT_PERMS.stock)}])`);
  await db.exec(`insert into artists (name, skill) values ('Pooja','Makeup'), ('Hetal','Hair')`);
  const A1 = (await db.query(`select id from artists order by id limit 1`)).rows[0].id, A2 = A1 + 1;

  r = await as(staff, `select create_wedding(3001, 'Kunal', ${d(60)}, 'Sarsana', 'Surat') id`); const wid = r.rows[0].id;
  ok(wid >= 5001, 'staff created wedding ' + wid);
  ok((await db.query(`select count(*)::int c from wedding_tasks where wedding_id=${wid}`)).rows[0].c === 6, 'the standard 6-point checklist is added');
  ok((await db.query(`select count(*)::int c from wedding_tasks where wedding_id=${wid} and due < shop_today() + 60`)).rows[0].c === 6, 'checklist due dates are counted back from the wedding date');
  e = await err(stock, `select create_wedding(3001, 'X', ${d(60)})`); ok(e && /forbidden/.test(e.message), 'stock keeper cannot create weddings');
  ok(await cnt(stock, `select count(*) c from weddings`) === 0 && await cnt(stock, `select count(*) c from artists`) === 0, 'stock keeper cannot read weddings or artists');
  ok(await cnt(staff, `select count(*) c from weddings`) > 0, 'staff reads weddings');

  // an artist cannot be in two places at once
  await as(staff, `insert into wedding_events (wedding_id, kind, title, event_date, start_time, end_time, artist_id) values (${wid}, 'trial', 'Trial', ${d(30)}, '10:00', '12:00', ${A1})`);
  e = await err(staff, `insert into wedding_events (wedding_id, kind, title, event_date, start_time, end_time, artist_id) values (${wid}, 'haldi', 'Haldi', ${d(30)}, '11:00', '13:00', ${A1})`);
  ok(e && /no_artist_clash/.test(e.message), 'same artist, overlapping time: refused by the database');
  await as(staff, `insert into wedding_events (wedding_id, kind, title, event_date, start_time, end_time, artist_id) values (${wid}, 'haldi', 'Haldi', ${d(30)}, '12:00', '13:00', ${A1})`);
  ok(true, 'the next function starting exactly when the previous one ends is allowed');
  await as(staff, `insert into wedding_events (wedding_id, kind, title, event_date, start_time, end_time, artist_id) values (${wid}, 'haldi', 'Haldi hair', ${d(30)}, '11:00', '13:00', ${A2})`);
  ok(true, 'a different artist can work at the same time');
  await as(staff, `insert into wedding_events (wedding_id, kind, title, event_date, start_time, end_time) values (${wid}, 'wedding', 'Wedding day', ${d(60)}, '05:00', '09:00')`);
  await as(staff, `insert into wedding_events (wedding_id, kind, title, event_date, start_time, end_time) values (${wid}, 'wedding', 'Wedding hair', ${d(60)}, '05:00', '09:00')`);
  ok(true, 'functions without an artist never clash');
  e = await err(staff, `insert into wedding_events (wedding_id, kind, title, event_date, start_time, end_time) values (${wid}, 'other', 'Bad', ${d(61)}, '10:00', '09:00')`);
  ok(e && /check/.test(e.message), 'a function cannot end before it starts');
  e = await err(stock, `insert into wedding_events (wedding_id, kind, title, event_date) values (${wid}, 'other', 'Sneaky', ${d(61)})`);
  ok(e && /row-level security/.test(e.message), 'stock keeper cannot add functions directly');

  // services sold to the wedding
  await as(staff, `insert into wedding_items (wedding_id, description, qty, price) values (${wid}, 'HD Bridal Makeup', 1, 18000), (${wid}, 'Family makeup', 3, 2500)`);
  ok((await db.query(`select sum(qty*price) s from wedding_items where wedding_id=${wid}`)).rows[0].s == 25500, 'wedding items add up');
  e = await err(staff, `insert into wedding_items (wedding_id, description, qty, price) values (${wid}, 'x', 0, 10)`); ok(e && /check/.test(e.message), 'quantity must be at least 1');

  // payments go through the function
  r = await as(staff, `select add_wedding_payment(${wid}, 10000, 'upi', 'Advance') id`); ok(r.rows[0].id > 0, 'staff records a wedding payment');
  ok((await db.query(`select by_name from wedding_payments where wedding_id=${wid}`)).rows[0].by_name === 'staff', 'the payment carries the name of who took it');
  e = await err(staff, `select add_wedding_payment(${wid}, 0)`); ok(e && /bad_amount/.test(e.message), 'zero wedding payment rejected');
  e = await err(stock, `select add_wedding_payment(${wid}, 500)`); ok(e && /forbidden/.test(e.message), 'stock keeper cannot take wedding payments');
  e = await err(staff, `insert into wedding_payments (wedding_id, amount) values (${wid}, 999)`); ok(e && /row-level security/.test(e.message), 'payments cannot be inserted directly, only through the function');
  await as(owner, `select set_role_permissions('staff', (select array_agg(perm) from role_permissions where role='staff' and allowed and perm <> 'wedding_payments'))`);
  e = await err(staff, `select add_wedding_payment(${wid}, 500)`); ok(e && /forbidden/.test(e.message), 'owner removed "Take wedding payments": staff is refused at once');
  await as(owner, `select set_role_permissions('staff', array[${sq(RRd.DEFAULT_PERMS.staff)}])`);

  // rented outfits belong to a wedding
  r = await as(staff, `select create_booking(1031, 3002, ${d(70)}, ${d(71)}, 0, 'cash', '', ${wid}) id`);
  ok((await db.query(`select wedding_id from bookings where id=${r.rows[0].id}`)).rows[0].wedding_id == wid, 'a rental booking can be linked to the wedding');
  e = await err(staff, `select create_booking(1031, 3002, ${d(80)}, ${d(81)}, 0, 'cash', '', 999999)`); ok(e && /wedding_not_found/.test(e.message), 'linking to an unknown wedding is refused');

  // status, and the permission to edit
  await as(staff, `select set_wedding_status(${wid}, 'confirmed')`); ok((await db.query(`select status from weddings where id=${wid}`)).rows[0].status === 'confirmed', 'wedding confirmed');
  e = await err(staff, `select set_wedding_status(999999, 'confirmed')`); ok(e && /wedding_not_found/.test(e.message), 'unknown wedding rejected');
  await as(owner, `select set_role_permissions('staff', (select array_agg(perm) from role_permissions where role='staff' and allowed and perm <> 'edit_weddings'))`);
  e = await err(staff, `select create_wedding(3001, 'Y', ${d(90)})`); ok(e && /forbidden/.test(e.message), 'without "Create and edit weddings" staff cannot create weddings');
  e = await err(staff, `insert into wedding_tasks (wedding_id, title) values (${wid}, 'sneaky')`); ok(e && /row-level security/.test(e.message), 'nor edit the checklist directly');
  await as(owner, `select set_role_permissions('staff', array[${sq(RRd.DEFAULT_PERMS.staff)}])`);

  // price list + artists need "Manage artists and service prices"
  e = await err(staff, `insert into salon_services (name, price) values ('Facial', 2000)`); ok(e && /row-level security/.test(e.message), 'counter staff cannot change the price list by default');
  await as(owner, `insert into salon_services (name, price) values ('Facial', 2000)`); ok(true, 'the owner can');

  // deleting a function keeps the services that were sold for it
  const evx = (await db.query(`select id from wedding_events where wedding_id=${wid} and title='Wedding day'`)).rows[0].id;
  await db.exec(`insert into wedding_items (wedding_id, event_id, description, qty, price) values (${wid}, ${evx}, 'Draping', 1, 1500)`);
  await as(staff, `delete from wedding_events where id=${evx}`);
  ok((await db.query(`select event_id from wedding_items where description='Draping'`)).rows[0].event_id === null, 'deleting a function keeps its services (they just lose the link)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e.message); process.exit(2); });
