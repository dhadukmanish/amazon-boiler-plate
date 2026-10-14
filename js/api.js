/* The only file that talks to a server. Every page uses RR.api.* (never Supabase directly).
   Two interchangeable back ends with identical methods AND identical rules:
     DEMO  - no config: data lives in this browser (localStorage).
     LIVE  - js/config.js filled in: Supabase Auth + Postgres + Storage. Writes go through the SQL functions in supabase/schema.sql.
   What a person may do is decided by PERMISSIONS (RR.PERMS), not by role name. A role is a bundle of permissions the owner edits in Settings.
   Pages wait for  RR.ready  (resolves after sign-in + first data load).  api.has('create_booking') tells a page what to show. */
(function () {
  const RR = window.RR, cfg = window.RR_CONFIG || {};
  const live = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const { inr } = RR;
  const ALL_KEYS = RR.PERMS.map((p) => p.key);
  const API = { live, user: null, role: null, perms: new Set(), sb: null, session: null };
  RR.api = API;
  const nowHM = () => new Date().toTimeString().slice(0, 5);
  const MODES = ['cash', 'upi', 'card', 'bank'];

  /* ---------------- friendly errors (same codes in DEMO and in the SQL functions) ---------------- */
  const MSG = {
    piece_already_booked: (d) => `This piece is already booked${d ? ' (' + String(d).replace(/ to /, ' to ') + ')' : ''}. Choose other dates or another outfit.`,
    piece_in_repair: 'This piece is in repair and cannot be booked.', piece_not_found: 'Piece not found.', booking_not_found: 'Booking not found.', customer_not_found: 'Customer not found.',
    bad_dates: 'Return date must be on or after the pickup date.', past_date: 'Pickup date cannot be in the past.',
    below_min_days: (d) => `Minimum rental is ${d} day(s).`, bad_advance: 'Advance cannot be more than rent + deposit.',
    balance_due: (d) => `Collect the balance of ${inr(parseFloat(d) || 0)} before handing over.`, piece_not_ready: (d) => `This piece is ${d || 'not ready'}, so it cannot be handed over yet.`,
    not_upcoming: 'This booking has already been picked up, returned or cancelled.', not_out: 'This booking is not with the customer, so it cannot be returned.',
    late_fee_too_high: (d) => `Late fee cannot be more than ${inr(parseFloat(d) || 0)}. Ask the owner to change it.`, bad_next_status: 'Choose cleaning, repair or ready to rent.',
    forbidden: 'You do not have permission to do this. Ask the owner.', customer_exists: 'A customer with this mobile number already exists.', bad_phone: 'Enter a valid 10-digit mobile number.',
    bad_amount: 'Enter an amount greater than zero.', use_hand_over: 'A piece becomes "rented" only when you hand it over to a customer.', piece_is_out: 'This piece is with a customer right now.', empty_comment: 'Write something first.', empty_name: 'Enter the name.',
    user_not_found: 'That user does not exist.', cannot_change_self: 'You cannot change your own role or switch yourself off. Ask another owner.', last_owner: 'There must always be at least one active owner.',
    owner_is_fixed: 'The owner role cannot be edited: it always has every permission.', unknown_permission: 'Unknown permission.',
    artist_busy: (d) => `This artist is already booked for another function at that time${d ? ' (' + d + ')' : ''}. Choose another time or artist.`,
    wedding_not_found: 'Wedding not found.', bad_time: 'A function must end after it starts.', empty_title: 'Enter a name.',
  };
  function friendly(err) {
    let code = String((err && err.message) || '').trim(); const detail = err && (err.details || err.detail);
    if (/no_artist_clash/.test(code)) code = 'artist_busy'; else if (/row-level security|permission denied/i.test(code)) code = 'forbidden';
    const f = MSG[code];
    const e = new Error(f ? (typeof f === 'function' ? f(detail) : f) : (code || 'Something went wrong. Please try again.'));
    e.code = f ? code : 'unknown'; e.detail = detail; return e;
  }
  const fail = (code, detail) => { throw friendly({ message: code, detail }); };

  /* ---------------- permissions ---------------- */
  API.has = (key) => API.perms.has(key);
  API.hasAny = (...keys) => keys.some((k) => API.perms.has(k));
  API.can = (...roles) => roles.includes(API.role);                 // role name check: use has() in new code
  const permsOf = (role, table) => (role === 'owner' ? new Set(ALL_KEYS) : new Set((table && table[role]) || []));
  // first page this person may open (used after sign-in and on "No access")
  const HOME = [['view_dashboard', 'index.html'], ['view_bookings', 'bookings.html'], ['view_weddings', 'weddings.html'], ['view_calendar', 'calendar.html'], ['view_inventory', 'inventory.html'], ['view_customers', 'customers.html'],
    ['view_payments', 'payments.html'], ['print_tags', 'tags.html'], ['view_reports', 'reports.html'], ['manage_settings', 'settings.html'], ['manage_users', 'settings.html'], ['view_audit', 'settings.html']];
  const homeFrom = (perms) => { const h = HOME.find(([k]) => perms.has(k)); return h ? h[1] : 'login.html?msg=noaccess'; };
  API.homePage = () => homeFrom(API.perms);

  /* ---------------- shared helpers ---------------- */
  /* shrink a photo before it is stored/uploaded (phone photos are huge) -> Promise<Blob> */
  API.prepareImage = async (file, max = 800) => {
    const draw = (src, w, h) => new Promise((resolve, reject) => {
      const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this image'))), 'image/jpeg', 0.82);
    });
    if (window.createImageBitmap) {                              // does not depend on the page being visible
      try { const bmp = await createImageBitmap(file); const out = await draw(bmp, bmp.width, bmp.height); if (bmp.close) bmp.close(); return out; } catch (e) { /* fall back below */ }
    }
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); draw(img, img.width, img.height).then(resolve, reject); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image')); };
      img.src = url;
    });
  };
  const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  const normPhone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); if (d.length !== 10) fail('bad_phone'); return d.slice(0, 5) + ' ' + d.slice(5); };

  /* =====================================================================
     DEMO back end (mirrors supabase/schema.sql rule for rule)
     ===================================================================== */
  const KEY = 'rr:demo:v2', ROLEKEY = 'rr:demo:role';
  let DB = null;
  const DEMO_USERS = [
    { id: 'u1', name: 'Ravi Kumar', email: 'ravi@pratishthabridal.in', role: 'owner', active: true },
    { id: 'u2', name: 'Meena Shah', email: 'meena@pratishthabridal.in', role: 'staff', active: true },
    { id: 'u3', name: 'Imran Khan', email: 'imran@pratishthabridal.in', role: 'stock', active: true },
  ];
  /* people without "See bookings" / "See payments" / "See customers" never receive that data (the database does the same with RLS) */
  function scrub(raw) {
    const r = { ...raw };
    if (!API.has('view_bookings')) { r.bookings = raw.bookings.map((b) => ({ no: b.no, outfit: b.outfit, customerId: null, from: b.from, to: b.to, status: b.status, rent: 0, deposit: 0, notes: '', createdAt: b.from })); r.events = []; r.returned = []; }
    if (!API.has('view_payments')) {
      r.payments = [];
      if (API.has('view_bookings')) { r.moneyByBooking = {}; raw.bookings.forEach((b) => { r.moneyByBooking[b.no] = { paid: paidSum(b.no, ['advance', 'deposit', 'balance']), depositPaid: paidSum(b.no, ['deposit']) }; }); }
    }
    if (!API.hasAny('view_customers', 'create_booking', 'view_weddings')) r.customers = [];
    if (!API.has('view_weddings')) { ['artists', 'services', 'weddings', 'wevents', 'witems', 'wpayments', 'wtasks'].forEach((k) => { r[k] = []; }); }
    return r;
  }
  const apply = () => RR.setData(scrub(DB));
  const demoSave = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* storage full or blocked: data stays in memory for this tab */ } apply(); };
  const need = (...perms) => { if (!API.hasAny(...perms)) fail('forbidden'); };
  const nextId = (arr, key, start) => arr.reduce((m, x) => Math.max(m, x[key]), start - 1) + 1;
  const who = () => (API.user ? API.user.name : 'You');
  const audit = (action, details) => DB.audit.push({ id: nextId(DB.audit, 'id', 1), at: new Date().toISOString(), who: who(), action, details: details || {} });
  const ev = (booking, kind, message) => DB.events.push({ id: nextId(DB.events, 'id', 1), booking, kind, message, who: who(), at: RR.TODAY + 'T' + nowHM() });
  const pay = (booking, type, mode, amount, reference) => DB.payments.push({ id: nextId(DB.payments, 'id', 2001), booking, type, mode: MODES.includes(mode) ? mode : 'cash', amount, reference: reference || '', at: RR.TODAY });
  const paidSum = (no, types) => DB.payments.filter((p) => p.booking === no && types.includes(p.type)).reduce((a, p) => a + p.amount, 0);
  const bk = (no) => DB.bookings.find((b) => b.no === +no) || fail('booking_not_found');
  const ownersLeft = (exceptId) => DB.users.some((u) => u.role === 'owner' && u.active && u.id !== exceptId);

  const demo = {
    async createBooking(a) {
      need('create_booking');
      const o = DB.outfits.find((x) => x.id === +a.piece && x.active !== false) || fail('piece_not_found');
      if (o.status === 'repair') fail('piece_in_repair');
      if (a.to < a.from) fail('bad_dates');
      if (a.from < RR.TODAY) fail('past_date');
      if (!DB.customers.some((c) => c.id === +a.customerId)) fail('customer_not_found');
      const days = RR.daysBetween(a.from, a.to) + 1; if (days < RR.SETTINGS.minDays) fail('below_min_days', RR.SETTINGS.minDays);
      const rent = days * o.rent, adv = +a.advance || 0; if (adv < 0 || adv > rent + o.dep) fail('bad_advance');
      const c = RR.clash(o.id, a.from, a.to); if (c) fail('piece_already_booked', `${c.id} ${RR.fmt(c.from)} to ${RR.fmt(c.to)}`);
      if (a.weddingId && !DB.weddings.some((w) => w.id === +a.weddingId)) fail('wedding_not_found');
      const no = nextId(DB.bookings, 'no', 1100);
      DB.bookings.push({ no, outfit: o.id, customerId: +a.customerId, weddingId: a.weddingId ? +a.weddingId : null, from: a.from, to: a.to, status: 'upcoming', rent, deposit: o.dep, notes: a.notes || '', createdAt: RR.TODAY + 'T' + nowHM() });
      if (adv > 0) { const d = Math.min(adv, o.dep); if (d > 0) pay(no, 'deposit', a.mode, d); if (adv - d > 0) pay(no, 'advance', a.mode, adv - d); }
      ev(no, 'created', `Booking created for piece ${o.id}, ${a.from} to ${a.to}`); audit('create_booking', { booking: no, piece: o.id, advance: adv }); demoSave(); return no;
    },
    async handOver(no, { amount = 0, mode = 'cash' } = {}) {
      need('handover'); const b = bk(no); if (b.status !== 'upcoming') fail('not_upcoming');
      const o = DB.outfits.find((x) => x.id === b.outfit); if (o.status !== 'available') fail('piece_not_ready', o.status);
      const due = Math.max(0, b.rent + b.deposit - paidSum(b.no, ['advance', 'deposit', 'balance']));
      if ((+amount || 0) < due) fail('balance_due', due);
      if (due > 0) { const d = Math.min(due, Math.max(0, b.deposit - paidSum(b.no, ['deposit']))); if (d > 0) pay(b.no, 'deposit', mode, d); if (due - d > 0) pay(b.no, 'balance', mode, due - d); }
      b.status = 'out'; o.status = 'rented'; o.note = ''; ev(b.no, 'handover', 'Outfit handed over to customer'); audit('hand_over', { booking: b.no, collected: due }); demoSave();
    },
    async completeReturn(no, a) {
      need('receive_return'); const b = bk(no); if (b.status !== 'out') fail('not_out');
      if (a.next === 'rented') fail('bad_next_status');
      const cur = RR.bookingByNo(no), maxLate = (cur ? cur.lateDays : 0) * RR.SETTINGS.lateFeePerDay, late = Math.max(+a.lateFee || 0, 0), other = Math.max(+a.other || 0, 0);
      if (!API.has('override_late_fee') && late > maxLate) fail('late_fee_too_high', maxLate);
      const items = (a.items || []).map((i) => ({ name: i.name, state: i.state, charge: i.state === 'ok' ? 0 : +i.charge || 0 }));
      const dep = paidSum(b.no, ['deposit']), dmg = items.reduce((s, i) => s + i.charge, 0), net = dep - late - dmg - other;
      DB.returned.push({ booking: b.no, date: RR.TODAY, depositHeld: dep, lateFee: late, damage: dmg, other, net, mode: a.mode || 'cash', next: a.next, notes: a.notes || '', items, photos: (a.photos || []).length });
      if (net > 0) pay(b.no, 'refund', a.mode, net);
      else if (net < 0) { const col = -net, lp = Math.min(col, late); if (lp > 0) pay(b.no, 'late_fee', a.mode, lp); if (col - lp > 0) pay(b.no, 'damage', a.mode, col - lp); }
      b.status = 'returned'; const o = DB.outfits.find((x) => x.id === b.outfit); o.status = a.next; o.note = a.next === 'repair' ? 'In repair' : a.next === 'cleaning' ? 'In cleaning' : '';
      ev(b.no, 'return', `Returned. Deposit settled: ${net >= 0 ? 'refund ' + net : 'customer paid ' + -net}`); audit('complete_return', { booking: b.no, net, late, damage: dmg }); demoSave();
      return { net, depositHeld: dep, lateFee: late, damage: dmg, other };
    },
    async recordPayment({ booking, type, mode, amount, reference }) {
      need('take_payment'); if (!(+amount > 0)) fail('bad_amount'); const b = bk(booking); if (b.status === 'cancelled') fail('booking_not_found');
      pay(b.no, type, mode, +amount, reference); ev(b.no, 'payment', `${type} ${amount} received (${mode})`); audit('record_payment', { booking: b.no, type, amount: +amount }); demoSave();
    },
    async cancelBooking(no, reason = '') { need('cancel_booking'); const b = bk(no); if (b.status !== 'upcoming') fail('not_upcoming'); b.status = 'cancelled'; ev(b.no, 'cancel', 'Booking cancelled. ' + reason); audit('cancel_booking', { booking: b.no }); demoSave(); },
    async addComment(no, message) { need('view_bookings'); if (!String(message || '').trim()) fail('empty_comment'); ev(bk(no).no, 'comment', String(message).trim()); demoSave(); },
    async addCustomer({ name, phone, city = '', idProof = 'Aadhaar', notes = '' }) {
      need('edit_customers', 'create_booking', 'edit_weddings'); const p = normPhone(phone), ex = DB.customers.find((c) => c.phone === p); if (ex) { const e = friendly({ message: 'customer_exists', detail: ex.id }); e.existingId = ex.id; throw e; }
      if (!String(name || '').trim()) fail('empty_name');
      const id = nextId(DB.customers, 'id', 3001); DB.customers.push({ id, name: String(name).trim(), phone: p, city, idProof, notes }); audit('add_customer', { customer: id }); demoSave(); return id;
    },
    async updateCustomer({ id, name, city = '', idProof = 'Aadhaar', notes = '' }) {
      need('edit_customers'); const c = DB.customers.find((x) => x.id === +id) || fail('customer_not_found');
      if (!String(name || '').trim()) fail('empty_name'); Object.assign(c, { name: String(name).trim(), city, idProof, notes }); audit('update_customer', { customer: c.id }); demoSave();
    },
    async upsertOutfit(o) {
      need('manage_outfits'); const ex = DB.outfits.find((x) => x.id === +o.id);
      const row = { id: +o.id, name: o.name, cat: o.cat, size: o.size, rent: +o.rent, dep: +o.dep, c1: o.c1 || '#c62828', c2: o.c2 || '#ef6c00', status: ex ? ex.status : 'available', note: o.note || '', active: true, photo: ex && ex.photo };
      if (o.photoBlob) row.photo = await blobToDataURL(o.photoBlob);
      if (ex) Object.assign(ex, row); else DB.outfits.push(row); audit('upsert_outfit', { piece: row.id }); demoSave(); return row.id;
    },
    async setOutfitStatus(id, status, note = '') {
      need('set_outfit_status'); if (status === 'rented') fail('use_hand_over');
      if (status === 'available' && DB.bookings.some((b) => b.outfit === +id && b.status === 'out')) fail('piece_is_out');
      const o = DB.outfits.find((x) => x.id === +id) || fail('piece_not_found'); o.status = status; o.note = note; audit('set_outfit_status', { piece: o.id, status }); demoSave();
    },
    async saveSettings(s) { need('manage_settings'); DB.settings = { ...DB.settings, ...s }; audit('save_settings', {}); demoSave(); },

    /* ---- bridal salon + weddings ---- */
    async createWedding({ customerId, groom = '', date, venue = '', city = '', status = 'enquiry', notes = '' }) {
      need('edit_weddings'); if (!DB.customers.some((c) => c.id === +customerId)) fail('customer_not_found'); if (!date) fail('bad_dates');
      const id = nextId(DB.weddings, 'id', 5001);
      DB.weddings.push({ id, customerId: +customerId, groom: String(groom).trim(), date, venue, city, status, discount: 0, notes, createdAt: RR.TODAY + 'T' + nowHM() });
      [['Trial booked and done', -21], ['Bridal outfit finalised', -14], ['Jewellery and accessories decided', -10], ['Advance received', -30], ['Artists assigned to every function', -7], ['Final confirmation call to the family', -3]]
        .forEach(([title, off]) => DB.wtasks.push({ id: nextId(DB.wtasks, 'id', 1), wedding: id, title, due: RR.addDays(date, off), done: false }));
      audit('create_wedding', { wedding: id, customer: +customerId }); demoSave(); return id;
    },
    async updateWedding(id, patch) {
      need('edit_weddings'); const w = DB.weddings.find((x) => x.id === +id) || fail('wedding_not_found');
      ['groom', 'date', 'venue', 'city', 'notes'].forEach((k) => { if (k in patch) w[k] = patch[k]; }); if ('discount' in patch) w.discount = Math.max(0, +patch.discount || 0);
      demoSave();
    },
    async setWeddingStatus(id, status) { need('edit_weddings'); const w = DB.weddings.find((x) => x.id === +id) || fail('wedding_not_found'); w.status = status; audit('set_wedding_status', { wedding: w.id, status }); demoSave(); },
    async saveEvent(e) {
      need('edit_weddings'); if (!DB.weddings.some((w) => w.id === +e.wedding)) fail('wedding_not_found');
      if (!String(e.title || '').trim()) fail('empty_title'); if (!e.date) fail('bad_dates'); if (e.start && e.end && e.end <= e.start) fail('bad_time');
      const c = RR.artistClash(e.artist, e.date, e.start, e.end, e.id); if (c) fail('artist_busy', c.weddingCode + ' ' + c.bride + ', ' + c.start + '–' + c.end);
      const row = { id: e.id || nextId(DB.wevents, 'id', 1), wedding: +e.wedding, kind: e.kind || 'other', title: String(e.title).trim(), date: e.date, start: e.start || null, end: e.end || null, venue: e.venue || '', artist: e.artist ? +e.artist : null, people: Math.max(1, +e.people || 1), notes: e.notes || '', done: !!e.done };
      const ex = e.id && DB.wevents.find((x) => x.id === e.id); if (ex) Object.assign(ex, row); else DB.wevents.push(row); demoSave(); return row.id;
    },
    async deleteEvent(id) { need('edit_weddings'); DB.wevents = DB.wevents.filter((e) => e.id !== +id); DB.witems.forEach((i) => { if (i.event === +id) i.event = null; }); demoSave(); },
    async saveItem(i) {
      need('edit_weddings'); if (!String(i.desc || '').trim()) fail('empty_title'); if (!(+i.qty >= 1) || !(+i.price >= 0)) fail('bad_amount');
      const row = { id: i.id || nextId(DB.witems, 'id', 1), wedding: +i.wedding, event: i.event ? +i.event : null, service: i.service ? +i.service : null, desc: String(i.desc).trim(), qty: Math.floor(+i.qty), price: +i.price };
      const ex = i.id && DB.witems.find((x) => x.id === i.id); if (ex) Object.assign(ex, row); else DB.witems.push(row); demoSave(); return row.id;
    },
    async deleteItem(id) { need('edit_weddings'); DB.witems = DB.witems.filter((i) => i.id !== +id); demoSave(); },
    async addWeddingPayment({ wedding, amount, mode = 'cash', note = '' }) {
      need('wedding_payments'); if (!(+amount > 0)) fail('bad_amount'); const w = DB.weddings.find((x) => x.id === +wedding); if (!w || w.status === 'cancelled') fail('wedding_not_found');
      const id = nextId(DB.wpayments, 'id', 1); DB.wpayments.push({ id, wedding: w.id, amount: +amount, mode: MODES.includes(mode) ? mode : 'cash', note, at: RR.TODAY, who: who() });
      audit('add_wedding_payment', { wedding: w.id, amount: +amount }); demoSave(); return id;
    },
    async saveTask(t) {
      need('edit_weddings'); if (!String(t.title || '').trim()) fail('empty_title');
      const row = { id: t.id || nextId(DB.wtasks, 'id', 1), wedding: +t.wedding, title: String(t.title).trim(), due: t.due || null, done: !!t.done };
      const ex = t.id && DB.wtasks.find((x) => x.id === t.id); if (ex) Object.assign(ex, row); else DB.wtasks.push(row); demoSave(); return row.id;
    },
    async setTaskDone(id, done) { need('edit_weddings'); const t = DB.wtasks.find((x) => x.id === +id); if (t) t.done = !!done; demoSave(); },
    async deleteTask(id) { need('edit_weddings'); DB.wtasks = DB.wtasks.filter((t) => t.id !== +id); demoSave(); },
    async saveArtist(a) {
      need('manage_salon'); if (!String(a.name || '').trim()) fail('empty_title');
      const row = { id: a.id || nextId(DB.artists, 'id', 1), name: String(a.name).trim(), phone: a.phone || '', skill: a.skill || 'Makeup', active: a.active !== false };
      const ex = a.id && DB.artists.find((x) => x.id === a.id); if (ex) Object.assign(ex, row); else DB.artists.push(row); demoSave(); return row.id;
    },
    async saveService(x) {
      need('manage_salon'); if (!String(x.name || '').trim()) fail('empty_title'); if (!(+x.price >= 0)) fail('bad_amount');
      const row = { id: x.id || nextId(DB.services, 'id', 1), name: String(x.name).trim(), category: x.category || 'Makeup', price: +x.price, minutes: Math.max(1, +x.minutes || 60), active: x.active !== false };
      const ex = x.id && DB.services.find((y) => y.id === x.id); if (ex) Object.assign(ex, row); else DB.services.push(row); demoSave(); return row.id;
    },

    /* ---- users, roles, permissions ---- */
    async listUsers() { need('manage_users'); return DB.users.map((u) => ({ ...u })); },
    async setUserRole(id, role, active) {
      need('manage_users'); const t = DB.users.find((x) => x.id === id) || fail('user_not_found');
      if ((role === 'owner' || t.role === 'owner') && API.role !== 'owner') fail('forbidden');
      if (id === API.user.id && (role !== t.role || !active)) fail('cannot_change_self');
      if (t.role === 'owner' && t.active && (role !== 'owner' || !active) && !ownersLeft(id)) fail('last_owner');
      t.role = role; t.active = active; audit('set_user_role', { user: id, role, active }); demoSave();
    },
    async getRolePermissions() { return { staff: [...DB.rolePerms.staff], stock: [...DB.rolePerms.stock] }; },
    async setRolePermissions(role, perms) {
      need('manage_users'); if (role === 'owner') fail('owner_is_fixed');
      perms = [...new Set(perms || [])]; if (perms.some((k) => !ALL_KEYS.includes(k))) fail('unknown_permission');
      if (API.role !== 'owner') {                                    // nobody can hand out what they do not hold, nor "Manage users"
        const before = new Set(DB.rolePerms[role]);
        if (perms.some((k) => !API.has(k) || (k === 'manage_users' && !before.has(k)))) fail('forbidden');
      }
      DB.rolePerms[role] = ALL_KEYS.filter((k) => perms.includes(k)); audit('set_role_permissions', { role, permissions: DB.rolePerms[role] });
      API.perms = permsOf(API.role, DB.rolePerms); demoSave();
    },
    async listAudit(limit = 200) { need('view_audit'); return [...DB.audit].reverse().slice(0, limit); },
    async reload() { apply(); },
  };

  /* =====================================================================
     LIVE back end (Supabase)
     ===================================================================== */
  const toDate = (ts) => RR.iso(new Date(ts));
  async function fetchAll(table, select = '*', order = 'id') {
    const rows = []; for (let from = 0; ; from += 1000) {
      const { data, error } = await API.sb.from(table).select(select).order(order).range(from, from + 999);
      if (error) throw friendly(error); rows.push(...data); if (data.length < 1000) break;
    } return rows;
  }
  const rpc = async (fn, args) => { const { data, error } = await API.sb.rpc(fn, args); if (error) throw friendly(error); return data; };
  const photoUrl = (path) => (path ? API.sb.storage.from('piece-photos').getPublicUrl(path).data.publicUrl : undefined);
  const group = (rows) => { const t = { staff: [], stock: [] }; rows.forEach((r) => { if (r.allowed && t[r.role]) t[r.role].push(r.perm); }); return t; };
  async function loadPerms() { API.perms = permsOf(API.role, group(await fetchAll('role_permissions', 'role, perm, allowed', 'role'))); }

  async function liveReload() {
    // only ask for what this person may see; the database enforces the same rules, so a blocked table would just come back empty
    const none = Promise.resolve([]);
    const canBk = API.has('view_bookings');
    const needMoney = canBk && !API.has('view_payments'), canWd = API.has('view_weddings');
    const [outfits, customers, bookings, payments, events, returns, money, artists, services, weddings, wevents, witems, wpayments, wtasks] = await Promise.all([
      fetchAll('outfits', '*', 'piece_no'),
      API.hasAny('view_customers', 'create_booking', 'view_weddings') ? fetchAll('customers') : none,
      canBk ? fetchAll('bookings') : fetchAll('booking_slots'),
      API.has('view_payments') ? fetchAll('payments') : none,
      canBk ? fetchAll('booking_events') : none,
      canBk ? fetchAll('returns', '*, return_items(*)') : none,
      needMoney ? fetchAll('booking_money', '*', 'booking_id') : none,
      canWd ? fetchAll('artists') : none, canWd ? fetchAll('salon_services') : none, canWd ? fetchAll('weddings') : none, canWd ? fetchAll('wedding_events') : none,
      canWd ? fetchAll('wedding_items') : none, canWd ? fetchAll('wedding_payments') : none, canWd ? fetchAll('wedding_tasks') : none]);
    const { data: s } = await API.sb.from('shop_settings').select('*').eq('id', 1).single();
    RR.setData({
      today: RR.iso(new Date()),
      moneyByBooking: needMoney ? Object.fromEntries(money.map((m) => [m.booking_id, { paid: +m.paid, depositPaid: +m.deposit_paid }])) : undefined,
      settings: s ? { shopName: s.shop_name, address: s.address, phone: s.phone, gstin: s.gstin, lateFeePerDay: +s.late_fee_per_day, graceHours: s.grace_hours, depositPct: s.deposit_pct, advancePct: s.advance_pct, minDays: s.min_days, upi: s.upi_id, receiptPrefix: s.receipt_prefix, terms: s.terms || [], msgConfirm: s.msg_confirm, msgOverdue: s.msg_overdue, salonTerms: s.salon_terms || [] } : undefined,
      outfits: outfits.map((o) => ({ id: o.piece_no, name: o.name, cat: o.category, size: o.size, rent: +o.rent_per_day, dep: +o.deposit, c1: o.color1, c2: o.color2, status: o.status, note: o.note, active: o.active, photo: photoUrl(o.photo_path) })),
      customers: customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, city: c.city, idProof: c.id_proof, notes: c.notes, createdAt: c.created_at })),
      bookings: bookings.map((b) => ({ no: b.id, outfit: b.piece_no, customerId: b.customer_id == null ? null : b.customer_id, weddingId: b.wedding_id || null, from: b.from_date, to: b.to_date, status: b.status, rent: +(b.rent || 0), deposit: +(b.deposit || 0), notes: b.notes || '', createdAt: b.created_at || b.from_date })),
      payments: payments.map((p) => ({ id: p.id, booking: p.booking_id, type: p.type, mode: p.mode, amount: +p.amount, reference: p.reference, at: toDate(p.created_at) })),
      events: events.map((e) => ({ id: e.id, booking: e.booking_id, kind: e.kind, message: e.message, who: e.by_name || '', at: e.created_at })),
      artists: artists.map((a) => ({ id: a.id, name: a.name, phone: a.phone, skill: a.skill, active: a.active })),
      services: services.map((x) => ({ id: x.id, name: x.name, category: x.category, price: +x.price, minutes: x.minutes, active: x.active })),
      weddings: weddings.map((w) => ({ id: w.id, customerId: w.customer_id, groom: w.groom_name, date: w.wedding_date, venue: w.venue, city: w.city, status: w.status, discount: +w.discount, notes: w.notes, createdAt: w.created_at })),
      wevents: wevents.map((e) => ({ id: e.id, wedding: e.wedding_id, kind: e.kind, title: e.title, date: e.event_date, start: e.start_time ? e.start_time.slice(0, 5) : null, end: e.end_time ? e.end_time.slice(0, 5) : null, venue: e.venue, artist: e.artist_id, people: e.people, notes: e.notes, done: e.done })),
      witems: witems.map((i) => ({ id: i.id, wedding: i.wedding_id, event: i.event_id, service: i.service_id, desc: i.description, qty: i.qty, price: +i.price })),
      wpayments: wpayments.map((p) => ({ id: p.id, wedding: p.wedding_id, amount: +p.amount, mode: p.mode, note: p.note, at: toDate(p.created_at), who: p.by_name })),
      wtasks: wtasks.map((t) => ({ id: t.id, wedding: t.wedding_id, title: t.title, due: t.due, done: t.done })),
      returned: returns.map((r) => ({ booking: r.booking_id, date: r.returned_on, depositHeld: +r.deposit_held, lateFee: +r.late_fee, damage: +r.damage_total, other: +r.other_deduction, net: +r.net_refund, mode: r.mode, next: r.next_status, notes: r.notes, items: (r.return_items || []).map((i) => ({ name: i.item, state: i.state, charge: +i.charge })) })),
    });
  }
  const after = async (p) => { const r = await p; await liveReload(); return r; };
  /* insert (no id) or update (id) one row of a planning table. Row level security refuses it for people without the permission. */
  const save = async (table, row, id) => {
    const q = id ? API.sb.from(table).update(row).eq('id', id).select() : API.sb.from(table).insert(row).select();
    const { data, error } = await q; if (error) throw friendly(error); if (!data || !data.length) fail('forbidden');
    await liveReload(); return data[0].id;
  };
  const remove = async (table, id) => { const { data, error } = await API.sb.from(table).delete().eq('id', id).select(); if (error) throw friendly(error); if (!data || !data.length) fail('forbidden'); await liveReload(); };
  const hhmm = (t) => (t ? t : null);
  const liveApi = {
    createBooking: (a) => after(rpc('create_booking', { p_piece: +a.piece, p_customer: +a.customerId, p_from: a.from, p_to: a.to, p_advance: +a.advance || 0, p_mode: a.mode || 'cash', p_notes: a.notes || '', p_wedding: a.weddingId ? +a.weddingId : null })),
    handOver: (no, { amount = 0, mode = 'cash' } = {}) => after(rpc('hand_over', { p_booking: +no, p_amount: +amount || 0, p_mode: mode })),
    async completeReturn(no, a) {
      const row = await rpc('complete_return', { p_booking: +no, p_items: (a.items || []).map((i) => ({ name: i.name, state: i.state, charge: +i.charge || 0 })), p_late_fee: +a.lateFee || 0, p_other: +a.other || 0, p_mode: a.mode || 'cash', p_next: a.next, p_notes: a.notes || '' });
      for (let i = 0; i < (a.photos || []).length; i++) {            // upload after the return is saved; a failed photo never undoes the settlement
        try { const path = `${no}/${row.id}-${i}.jpg`; const { error } = await API.sb.storage.from('return-photos').upload(path, a.photos[i], { contentType: 'image/jpeg' }); if (!error) await rpc('add_return_photo', { p_return: row.id, p_path: path }); } catch (e) { console.warn('photo upload failed', e); }
      }
      await liveReload(); return { net: +row.net_refund, depositHeld: +row.deposit_held, lateFee: +row.late_fee, damage: +row.damage_total, other: +row.other_deduction };
    },
    recordPayment: (a) => after(rpc('record_payment', { p_booking: +a.booking, p_type: a.type, p_mode: a.mode || 'cash', p_amount: +a.amount, p_reference: a.reference || '' })),
    cancelBooking: (no, reason = '') => after(rpc('cancel_booking', { p_booking: +no, p_reason: reason })),
    addComment: (no, message) => after(rpc('add_comment', { p_booking: +no, p_message: message })),
    async addCustomer(c) {
      try { return await after(rpc('add_customer', { p_name: c.name, p_phone: c.phone, p_city: c.city || '', p_id_proof: c.idProof || 'Aadhaar', p_notes: c.notes || '' })); }
      catch (e) { if (e.code === 'customer_exists') e.existingId = +e.detail; throw e; }
    },
    updateCustomer: (c) => after(rpc('update_customer', { p_id: +c.id, p_name: c.name, p_city: c.city || '', p_id_proof: c.idProof || 'Aadhaar', p_notes: c.notes || '' })),
    async upsertOutfit(o) {
      let path = null;
      if (o.photoBlob) { path = `${o.id}/${Date.now()}.jpg`; const { error } = await API.sb.storage.from('piece-photos').upload(path, o.photoBlob, { contentType: 'image/jpeg' }); if (error) throw new Error('Photo upload failed: ' + error.message); }
      return after(rpc('upsert_outfit', { p_piece: +o.id, p_name: o.name, p_category: o.cat, p_size: o.size, p_rent: +o.rent, p_deposit: +o.dep, p_color1: o.c1 || '#c62828', p_color2: o.c2 || '#ef6c00', p_note: o.note || '', p_photo_path: path }));
    },
    setOutfitStatus: (id, status, note = '') => after(rpc('set_outfit_status', { p_piece: +id, p_status: status, p_note: note })),
    async saveSettings(s) {
      const map = { shopName: 'shop_name', address: 'address', phone: 'phone', gstin: 'gstin', lateFeePerDay: 'late_fee_per_day', graceHours: 'grace_hours', depositPct: 'deposit_pct', advancePct: 'advance_pct', minDays: 'min_days', upi: 'upi_id', receiptPrefix: 'receipt_prefix', terms: 'terms', msgConfirm: 'msg_confirm', msgOverdue: 'msg_overdue', salonTerms: 'salon_terms' };
      const row = {}; Object.keys(s).forEach((k) => { if (map[k]) row[map[k]] = s[k]; }); row.updated_at = new Date().toISOString();
      const { data, error } = await API.sb.from('shop_settings').update(row).eq('id', 1).select(); if (error) throw friendly(error);
      if (!data || !data.length) fail('forbidden'); await liveReload();      // an update that RLS blocks changes 0 rows without an error
    },

    /* ---- bridal salon + weddings ---- */
    createWedding: (w) => after(rpc('create_wedding', { p_customer: +w.customerId, p_groom: w.groom || '', p_date: w.date, p_venue: w.venue || '', p_city: w.city || '', p_status: w.status || 'enquiry', p_notes: w.notes || '' })),
    updateWedding: (id, p) => { const m = { groom: 'groom_name', date: 'wedding_date', venue: 'venue', city: 'city', notes: 'notes', discount: 'discount' }; const row = {}; Object.keys(p).forEach((k) => { if (m[k]) row[m[k]] = p[k]; }); return save('weddings', row, +id); },
    setWeddingStatus: (id, status) => after(rpc('set_wedding_status', { p_wedding: +id, p_status: status })),
    saveEvent: (e) => save('wedding_events', { wedding_id: +e.wedding, kind: e.kind || 'other', title: String(e.title || '').trim(), event_date: e.date, start_time: hhmm(e.start), end_time: hhmm(e.end), venue: e.venue || '', artist_id: e.artist ? +e.artist : null, people: Math.max(1, +e.people || 1), notes: e.notes || '', done: !!e.done }, e.id),
    deleteEvent: (id) => remove('wedding_events', +id),
    saveItem: (i) => save('wedding_items', { wedding_id: +i.wedding, event_id: i.event ? +i.event : null, service_id: i.service ? +i.service : null, description: String(i.desc || '').trim(), qty: Math.floor(+i.qty), price: +i.price }, i.id),
    deleteItem: (id) => remove('wedding_items', +id),
    addWeddingPayment: (p) => after(rpc('add_wedding_payment', { p_wedding: +p.wedding, p_amount: +p.amount, p_mode: p.mode || 'cash', p_note: p.note || '' })),
    saveTask: (t) => save('wedding_tasks', { wedding_id: +t.wedding, title: String(t.title || '').trim(), due: t.due || null, done: !!t.done }, t.id),
    setTaskDone: (id, done) => save('wedding_tasks', { done: !!done, done_at: done ? new Date().toISOString() : null }, +id),
    deleteTask: (id) => remove('wedding_tasks', +id),
    saveArtist: (a) => save('artists', { name: String(a.name || '').trim(), phone: a.phone || '', skill: a.skill || 'Makeup', active: a.active !== false }, a.id),
    saveService: (x) => save('salon_services', { name: String(x.name || '').trim(), category: x.category || 'Makeup', price: +x.price, minutes: Math.max(1, +x.minutes || 60), active: x.active !== false }, x.id),

    /* ---- users, roles, permissions ---- */
    async listUsers() { const { data, error } = await API.sb.from('profiles').select('id, full_name, email, role, active').order('created_at'); if (error) throw friendly(error); return data.map((u) => ({ id: u.id, name: u.full_name, email: u.email, role: u.role, active: u.active })); },
    async setUserRole(id, role, active) { await rpc('set_user_role', { p_user: id, p_role: role, p_active: active }); },
    async getRolePermissions() { return group(await fetchAll('role_permissions', 'role, perm, allowed', 'role')); },
    async setRolePermissions(role, perms) { await rpc('set_role_permissions', { p_role: role, p_perms: [...new Set(perms || [])] }); await loadPerms(); document.dispatchEvent(new CustomEvent('rr:data')); },
    async listAudit(limit = 200) {
      const { data, error } = await API.sb.from('audit_log').select('id, at, by_name, action, details').order('id', { ascending: false }).limit(limit); if (error) throw friendly(error);
      return data.map((a) => ({ id: a.id, at: a.at, who: a.by_name, action: a.action, details: a.details || {} }));
    },
    reload: liveReload,
  };

  Object.assign(API, live ? liveApi : demo);

  /* ---------------- sign in / out ---------------- */
  API.signIn = async (email, password) => {
    if (!live) throw new Error('Demo mode: no sign-in needed.');
    const { error } = await API.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? 'Wrong email or password.' : error.message);
  };
  API.signOut = async () => { if (live) await API.sb.auth.signOut(); location.href = 'login.html'; };
  API.setDemoRole = (role) => { try { localStorage.setItem(ROLEKEY, role); } catch (e) { /* ignore */ } location.reload(); };
  API.resetDemo = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } location.reload(); };
  API.homeFor = (role) => homeFrom(permsOf(role, DB && DB.rolePerms));       // demo login screen: where this role lands

  /* ---------------- startup ---------------- */
  const onLogin = /login(\.html)?$/.test(location.pathname);
  const loadLib = () => new Promise((res, rej) => { if (window.supabase) return res(); const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the Supabase library (offline?)')); document.head.appendChild(s); });

  API.ready = (async () => {
    if (!live) {
      DB = (() => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.bookings) return s; } catch (e) { /* fall through */ } return RR.demoRaw(); })();
      DB.users = DB.users || DEMO_USERS.map((u) => ({ ...u }));
      DB.rolePerms = DB.rolePerms || { staff: [...RR.DEFAULT_PERMS.staff], stock: [...RR.DEFAULT_PERMS.stock] };
      DB.audit = DB.audit || [];
      if (!DB.weddings) {                                         // an older saved demo: add the wedding sample data without touching the rest
        const dr = RR.demoRaw(); ['artists', 'services', 'weddings', 'wevents', 'witems', 'wpayments', 'wtasks'].forEach((k) => { DB[k] = dr[k]; });
        DB.settings = { ...DB.settings, salonTerms: dr.settings.salonTerms };
        [[1042, 5003], [1021, 5004]].forEach(([no, w]) => { const b = DB.bookings.find((x) => x.no === no); if (b) b.weddingId = w; });
      }
      let role = 'owner'; try { role = localStorage.getItem(ROLEKEY) || 'owner'; } catch (e) { /* ignore */ }
      const me = DB.users.find((u) => u.role === role && u.active) || DB.users.find((u) => u.role === role) || DEMO_USERS.find((u) => u.role === role);
      API.role = role; API.user = { id: me.id, name: me.name, email: me.email }; API.perms = permsOf(role, DB.rolePerms); apply(); return;
    }
    try { await loadLib(); } catch (e) { API.error = e; return; }
    API.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data: { session } } = await API.sb.auth.getSession(); API.session = session;
    if (!session) { if (onLogin) return; location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)); return new Promise(() => {}); }
    const { data: prof } = await API.sb.from('profiles').select('full_name, role, active').eq('id', session.user.id).maybeSingle();
    if (!prof || !prof.active) { await API.sb.auth.signOut(); location.replace('login.html?msg=noaccess'); return new Promise(() => {}); }
    API.role = prof.role; API.user = { id: session.user.id, name: prof.full_name || session.user.email, email: session.user.email };
    await loadPerms();
    if (!onLogin) await liveReload();
  })();
  RR.ready = API.ready;
})();
