// Runs schema.sql + storage.sql + seed.sql on an empty in-memory Postgres and checks the demo data is consistent.
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
const root = path.join(__dirname, '..') + '/';
let fail = 0;
const ok = (c, m) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

(async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;`);
  for (const f of ['schema.sql', 'storage.sql', 'seed.sql']) { await db.exec(fs.readFileSync(root + f, 'utf8')); ok(true, f + ' runs without error'); }
  const n = async (t) => (await db.query(`select count(*)::int c from ${t}`)).rows[0].c;
  ok((await n('outfits')) === 10 && (await n('customers')) === 23 && (await n('bookings')) === 25, 'seed has 10 outfits, 23 customers, 25 bookings');
  ok((await n('weddings')) === 4 && (await n('wedding_events')) === 12 && (await n('artists')) === 3 && (await n('salon_services')) === 11 && (await n('wedding_tasks')) === 24 && (await n('wedding_payments')) === 5,
    'seed has 4 weddings, 12 functions, 3 artists, 11 services, 24 checklist rows, 5 wedding payments');
  ok((await db.query(`select count(*)::int c from bookings where wedding_id is not null`)).rows[0].c === 2, 'two rented outfits are linked to weddings');
  ok((await db.query(`select (select sum(qty*price) from wedding_items where wedding_id=5001) - (select discount from weddings where id=5001) t`)).rows[0].t == 45000, 'wedding 5001 totals ₹45,000 after the discount');
  const st = Object.fromEntries((await db.query(`select status, count(*)::int c from bookings_v group by 1`)).rows.map((r) => [r.status, r.c]));
  ok(st.overdue === 2 && st.out === 2 && st.upcoming === 3 && st.returned === 18, 'statuses relative to today: 2 overdue, 2 out, 3 upcoming, 18 returned');
  const next = (await db.query(`select nextval(pg_get_serial_sequence('bookings','id')) n`)).rows[0].n;
  ok(+next >= 1100, 'next booking number starts at ' + next);
  const dup = (await db.query(`select count(*)::int c from (select piece_no from bookings where status in ('upcoming','out') group by piece_no having count(*) > 1) x`)).rows[0].c;
  ok(dup === 0, 'no piece has two live bookings');
  console.log(fail ? `\n${fail} failed` : '\nall seed checks passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e.message); process.exit(2); });
