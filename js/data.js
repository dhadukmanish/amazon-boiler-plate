/* Data model + helpers shared by every page.
   - RR.setData(raw) takes the raw rows (from the demo store or from Supabase, see js/api.js) and builds every derived list the pages use.
   - The arrays (RR.OUTFITS, RR.BOOKINGS ...) are replaced IN PLACE, so `const { BOOKINGS } = RR` stays valid after a reload.
   Raw shapes
     outfit   {id, name, cat, size, rent, dep, c1, c2, status, note, photo?, active}
     customer {id, name, phone, city, idProof, notes}
     booking  {no, outfit, customerId, from, to, status: upcoming|out|returned|cancelled, rent, deposit, notes, createdAt}
     payment  {id, booking, type, mode, amount, reference, at}      type: advance|deposit|balance|late_fee|damage|refund
     event    {id, booking, kind, message, who, at}                  returned   {booking, date, depositHeld, lateFee, damage, other, net, mode, next, notes, items[]}
   Derived booking status "overdue" = raw "out" and return date before RR.TODAY. */
(function () {
  const DEMO_TODAY = '2026-10-12';
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());                 // local date, no UTC shift
  const addDays = (s, n) => iso(new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n));
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const fmt = (s) => new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).replace(' ', '\u00a0');   // non-breaking space: a date never splits over two lines

  const STATUS = {
    upcoming:  { label: 'Upcoming',      cls: 'blue' },
    out:       { label: 'With customer', cls: 'orange' },
    overdue:   { label: 'Overdue',       cls: 'red' },
    returned:  { label: 'Returned',      cls: 'green' },
    cancelled: { label: 'Cancelled',     cls: '' },
  };
  const OUTFIT_STATUS = {
    available: { label: 'Available', cls: 'green' },
    rented:    { label: 'Rented',    cls: 'orange' },
    cleaning:  { label: 'Cleaning',  cls: 'blue' },
    repair:    { label: 'Repair',    cls: 'red' },
  };

  /* ---------------- permissions ----------------
     Every action is one permission. Roles are named bundles of permissions that the OWNER edits in Settings > Roles & permissions.
     The same list lives in supabase/schema.sql (table `permissions`); supabase/tests checks the two stay identical. */
  const PERMS = [
    ['view_dashboard',    'Overview',  'See the dashboard',                          "Today's pickups, returns, overdue list and pending money."],
    ['view_calendar',     'Overview',  'See the calendar',                           'Availability of every piece day by day. Customer names only show with "See bookings".'],
    ['view_bookings',     'Bookings',  'See bookings',                               'Open the bookings list and booking details (includes rent, deposit and customer names).'],
    ['create_booking',    'Bookings',  'Create a booking',                           'Book a piece for a customer and take the advance. Can also add a new customer while booking.'],
    ['handover',          'Bookings',  'Hand over an outfit',                        'Collect the balance and give the outfit to the customer.'],
    ['receive_return',    'Bookings',  'Receive a return',                           'Check condition, add damage charges, settle the deposit and refund.'],
    ['cancel_booking',    'Bookings',  'Cancel a booking',                           'Cancel a booking that has not been picked up.'],
    ['view_payments',     'Money',     'See payments',                               'Open the Payments page: receipts, pending balances, deposits held.'],
    ['take_payment',      'Money',     'Take a payment',                             'Record advance, balance, late fee, damage charge or refund.'],
    ['override_late_fee', 'Money',     'Charge more late fee than the daily rate',   'Without this, the late fee can be lowered or waived but never raised above days x daily rate.'],
    ['view_customers',    'Customers', 'See customers',                              'Customer list, profiles, phone numbers and history.'],
    ['edit_customers',    'Customers', 'Add and edit customers',                     'Add a customer, change name, city, ID proof and notes.'],
    ['view_weddings',     'Weddings',  'See weddings',                               'Open bridal bookings: functions, services, outfits, payments, checklist and the salon schedule.'],
    ['edit_weddings',     'Weddings',  'Create and edit weddings',                   'Add a bride, functions, services and checklist items, assign artists, link rented outfits.'],
    ['wedding_payments',  'Weddings',  'Take wedding payments',                      'Record advance and instalments for a wedding.'],
    ['manage_salon',      'Weddings',  'Manage artists and service prices',          'Add artists and edit the salon price list.'],
    ['view_inventory',    'Inventory', 'See inventory',                              'Outfits, photos, status and booking dates (without customer details).'],
    ['manage_outfits',    'Inventory', 'Add and edit outfits',                       'Add a piece, change its rent, deposit, details and photo.'],
    ['set_outfit_status', 'Inventory', 'Mark cleaning, repair or ready',             'Move a piece between available, cleaning and repair.'],
    ['print_tags',        'Inventory', 'Print piece tags',                           'QR and barcode tags for pieces.'],
    ['view_reports',      'Admin',     'See reports',                                'Revenue, utilisation, late returns and CSV export.'],
    ['manage_settings',   'Admin',     'Change shop settings',                       'Shop details, rental rules, late fee, slip terms and WhatsApp messages.'],
    ['manage_users',      'Admin',     'Manage users and permissions',               'Change who can sign in, their role, and what each role may do.'],
    ['view_audit',        'Admin',     'See the activity log',                       'Who did what and when (bookings, payments, returns, changes).'],
  ].map(([key, grp, label, description]) => ({ key, grp, label, description }));
  // ticking a permission also needs these (the matrix in Settings switches them on for you; the database does not require it)
  const PERM_NEEDS = {
    create_booking: ['view_bookings', 'view_inventory', 'view_customers'], handover: ['view_bookings'], receive_return: ['view_bookings'], cancel_booking: ['view_bookings'],
    view_payments: ['view_bookings'], take_payment: ['view_payments'], override_late_fee: ['receive_return'], edit_customers: ['view_customers'],
    manage_outfits: ['view_inventory'], set_outfit_status: ['view_inventory'], print_tags: ['view_inventory'], view_reports: ['view_bookings', 'view_payments'],
    edit_weddings: ['view_weddings', 'view_customers'], wedding_payments: ['view_weddings'], manage_salon: ['view_weddings'],
  };
  const ROLES = {
    owner: { label: 'Owner', blurb: 'Everything. Always. This role cannot be edited.' },
    staff: { label: 'Counter staff', blurb: 'Works the counter: bookings, returns, payments, customers.' },
    stock: { label: 'Stock keeper', blurb: 'Looks after the pieces: inventory, cleaning, repair, tags.' },
  };
  const DEFAULT_PERMS = {
    staff: ['view_dashboard', 'view_calendar', 'view_bookings', 'create_booking', 'handover', 'receive_return', 'cancel_booking', 'view_payments', 'take_payment', 'view_customers', 'edit_customers', 'view_weddings', 'edit_weddings', 'wedding_payments', 'view_inventory', 'set_outfit_status', 'print_tags'],
    stock: ['view_calendar', 'view_inventory', 'manage_outfits', 'set_outfit_status', 'print_tags'],
  };

  /* ---------------- live state (filled by setData) ---------------- */
  const OUTFITS = [], BOOKINGS = [], CUSTOMERS = [], PAYMENTS = [], EVENTS = [], RETURNS = [];
  const WEDDINGS = [], ARTISTS = [], SERVICES = [], WEVENTS = [];
  const SETTINGS = { shopName: 'Pratishtha Bridal', address: '', phone: '', gstin: '', lateFeePerDay: 300, graceHours: 3, depositPct: 30, advancePct: 50, minDays: 1, upi: '', receiptPrefix: 'RC-', terms: [], salonTerms: [],
    msgConfirm: 'Hi {customer}, your booking {booking} is confirmed: {outfit} (piece {piece}), {pickup} to {return_date}. Balance at pickup: {balance}. - {shop}',
    msgOverdue: 'Hi {customer}, your outfit {outfit} (piece {piece}) was due on {return_date}. Please return it today to avoid more late fees of {late_fee}. - {shop}' };
  const R = { TODAY: DEMO_TODAY, BUFFER_DAYS: 1, SETTINGS, OUTFITS, BOOKINGS, CUSTOMERS, PAYMENTS, EVENTS, RETURNS, WEDDINGS, ARTISTS, SERVICES, WEVENTS, STATUS, OUTFIT_STATUS, PERMS, PERM_NEEDS, ROLES, DEFAULT_PERMS };
  const replace = (arr, rows) => arr.splice(0, arr.length, ...rows);
  const LIVE = (b) => b.status === 'upcoming' || b.status === 'out' || b.status === 'overdue';
  const CITY = ['Surat', 'Ahmedabad', 'Vadodara', 'Surat', 'Rajkot', 'Surat'], IDP = ['Aadhaar', 'Driving licence', 'Voter ID'];

  R.setData = function setData(d) {
    if (d.today) R.TODAY = d.today;
    if (d.settings) Object.assign(SETTINGS, d.settings);
    const today = R.TODAY;
    const custRaw = new Map(d.customers.map((c) => [c.id, c]));
    const oRaw = new Map(d.outfits.map((o) => [o.id, o]));

    // payments -> per-booking sums
    const paid = new Map(), depPaid = new Map();
    d.payments.forEach((p) => {
      if (p.type === 'advance' || p.type === 'deposit' || p.type === 'balance') paid.set(p.booking, (paid.get(p.booking) || 0) + p.amount);
      if (p.type === 'deposit') depPaid.set(p.booking, (depPaid.get(p.booking) || 0) + p.amount);
    });
    // people who may see bookings but not the payments list get the paid totals per booking instead (so balances stay right)
    if (d.moneyByBooking) Object.entries(d.moneyByBooking).forEach(([no, m]) => { paid.set(+no, m.paid); depPaid.set(+no, m.depositPaid); });

    replace(BOOKINGS, d.bookings.map((b) => {
      const c = custRaw.get(b.customerId) || {}, status = b.status === 'out' && b.to < today ? 'overdue' : b.status;
      const x = { no: b.no, id: 'BK-' + pad(b.no, 4), weddingId: b.weddingId || null, outfit: b.outfit, customerId: b.customerId, customer: c.name || 'Customer', phone: c.phone || '', from: b.from, to: b.to,
        status, rawStatus: b.status, rent: b.rent, deposit: b.deposit, paid: paid.get(b.no) || 0, depositPaid: depPaid.get(b.no) || 0, notes: b.notes || '', createdAt: b.createdAt || b.from };
      x.due = LIVE(x) ? Math.max(0, x.rent + x.deposit - x.paid) : 0;
      x.lateDays = status === 'overdue' ? daysBetween(b.to, today) : 0;
      x.lateFee = x.lateDays * SETTINGS.lateFeePerDay;
      return x;
    }));
    const bByNo = new Map(BOOKINGS.map((b) => [b.no, b]));

    replace(OUTFITS, d.outfits.filter((o) => o.active !== false).map((o) => {
      const x = { ...o }, live = BOOKINGS.filter((b) => b.outfit === o.id && (b.status === 'out' || b.status === 'overdue')).sort((a, b) => (a.to < b.to ? -1 : 1))[0];
      x.overdue = !!(live && live.status === 'overdue');
      x.note = o.status === 'rented' ? (live ? (x.overdue ? live.lateDays + ' day' + (live.lateDays > 1 ? 's' : '') + ' overdue' : 'Back on ' + fmt(live.to)) : 'With customer')
        : o.status === 'available' ? 'Deposit ' + inr(o.dep) : (o.note || (o.status === 'cleaning' ? 'In cleaning' : 'In repair'));
      return x;
    }));

    replace(PAYMENTS, d.payments.map((p) => { const b = bByNo.get(p.booking) || {};
      return { id: p.id, no: SETTINGS.receiptPrefix + p.id, booking: p.booking, bookingId: b.id || '', customer: b.customer || '', customerId: b.customerId, date: p.at.slice(0, 10), type: p.type, mode: p.mode, amount: p.amount, reference: p.reference || '' }; })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)));
    replace(EVENTS, (d.events || []).map((e) => ({ ...e })).sort((a, b) => (a.at < b.at ? 1 : -1)));
    replace(RETURNS, (d.returned || []).map((r) => ({ ...r })));

    replace(CUSTOMERS, d.customers.map((c) => {
      const x = { ...c, bookings: BOOKINGS.filter((b) => b.customerId === c.id).sort((a, b) => (a.from < b.from ? 1 : -1)) };
      const counted = x.bookings.filter((b) => b.status === 'out' || b.status === 'overdue' || b.status === 'returned');
      x.spent = counted.reduce((a, b) => a + b.rent, 0);
      x.deposit = x.bookings.filter((b) => b.status === 'out' || b.status === 'overdue').reduce((a, b) => a + b.depositPaid, 0);
      x.due = x.bookings.reduce((a, b) => a + b.due + b.lateFee, 0);
      x.last = x.bookings[0] || null;
      x.since = x.bookings.length ? x.bookings[x.bookings.length - 1].from : (c.createdAt || today).slice(0, 10);
      x.hasOut = x.bookings.some((b) => b.status === 'out' || b.status === 'overdue'); x.hasLate = x.bookings.some((b) => b.status === 'overdue');
      x.tags = [x.bookings.length > 1 ? 'Repeat' : 'New', ...(x.spent >= 10000 ? ['VIP'] : []), ...(x.hasLate ? ['Overdue'] : [])];
      x.initials = c.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      return x;
    }));

    // ---------- weddings (salon + planning) ----------
    replace(ARTISTS, (d.artists || []).map((a) => ({ ...a })));
    replace(SERVICES, (d.services || []).map((x) => ({ ...x })));
    const aName = new Map(ARTISTS.map((a) => [a.id, a.name])), byWhen = (a, b) => ((a.date + (a.start || '99')) < (b.date + (b.start || '99')) ? -1 : 1);
    replace(WEDDINGS, (d.weddings || []).map((w) => {
      const c = custRaw.get(w.customerId) || {};
      const events = (d.wevents || []).filter((e) => e.wedding === w.id).map((e) => ({ ...e, artistName: aName.get(e.artist) || '' })).sort(byWhen);
      const items = (d.witems || []).filter((i) => i.wedding === w.id).map((i) => ({ ...i, total: i.qty * i.price }));
      const payments = (d.wpayments || []).filter((p) => p.wedding === w.id).map((p) => ({ ...p, date: String(p.at).slice(0, 10) })).sort((a, b) => (a.date < b.date ? 1 : b.id - a.id));
      const tasks = (d.wtasks || []).filter((t) => t.wedding === w.id).map((t) => ({ ...t })).sort((a, b) => (a.done - b.done) || ((a.due || '9') < (b.due || '9') ? -1 : 1));
      const rentals = BOOKINGS.filter((b) => b.weddingId === w.id && b.status !== 'cancelled');
      const servicesTotal = items.reduce((a, i) => a + i.total, 0), total = Math.max(0, servicesTotal - (w.discount || 0)), paid = payments.reduce((a, p) => a + p.amount, 0);
      return { ...w, code: 'WD-' + w.id, bride: c.name || 'Customer', phone: c.phone || '', initials: (c.name || '?').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase(),
        events, items, payments, tasks, rentals, servicesTotal, total, paid, balance: Math.max(0, total - paid),
        rentalRent: rentals.reduce((a, b) => a + b.rent, 0), rentalDue: rentals.reduce((a, b) => a + b.due + b.lateFee, 0),
        daysLeft: daysBetween(today, w.date), tasksDone: tasks.filter((t) => t.done).length, tasksTotal: tasks.length,
        nextEvent: events.find((e) => !e.done && e.date >= today) || null };
    }).sort((a, b) => (a.date < b.date ? -1 : 1)));
    replace(WEVENTS, WEDDINGS.flatMap((w) => w.events.map((e) => ({ ...e, weddingId: w.id, weddingCode: w.code, bride: w.bride, weddingStatus: w.status }))));
    // the bride's wedding on each customer
    CUSTOMERS.forEach((c) => { c.weddings = WEDDINGS.filter((w) => w.customerId === c.id); });
    if (R.onData) R.onData();
  };

  /* ---------------- helpers ---------------- */
  Object.assign(R, {
    pad, iso, addDays, daysBetween, inr, fmt, LIVE,
    range: (b) => fmt(b.from) + ' – ' + fmt(b.to),
    outfitById: (id) => OUTFITS.find((o) => o.id === +id),
    bookingsOf: (id) => BOOKINGS.filter((b) => b.outfit === +id).sort((a, b) => (a.from < b.from ? 1 : -1)),
    bookingByNo: (no) => BOOKINGS.find((b) => b.no === +no),
    customerById: (id) => CUSTOMERS.find((c) => c.id === +id),
    customerOf: (b) => CUSTOMERS.find((c) => c.id === b.customerId),
    lateDays: (b) => b.lateDays || 0,
    weddingById: (id) => WEDDINGS.find((w) => w.id === +id),
    artistById: (id) => ARTISTS.find((a) => a.id === +id),
    /* another function (not cancelled) where this artist is already booked at the same time? same rule as the database */
    artistClash: (artist, date, start, end, ignoreId) => (!artist || !start || !end) ? null
      : WEVENTS.find((e) => e.artist === +artist && e.id !== ignoreId && e.date === date && e.start && e.end && e.weddingStatus !== 'cancelled' && start < e.end && e.start < end) || null,
    KINDS: { trial: 'Trial', engagement: 'Engagement', haldi: 'Haldi', mehendi: 'Mehendi', sangeet: 'Sangeet', wedding: 'Wedding day', reception: 'Reception', photoshoot: 'Photoshoot', other: 'Other' },
    WSTATUS: { enquiry: { label: 'Enquiry', cls: 'blue' }, confirmed: { label: 'Confirmed', cls: 'green' }, completed: { label: 'Completed', cls: '' }, cancelled: { label: 'Cancelled', cls: 'red' } },
    /* fill a WhatsApp template from Settings with a booking's details and return a wa.me link */
    waLink: (kind, b) => {
      const o = R.outfitById(b.outfit) || {}, tpl = kind === 'overdue' ? SETTINGS.msgOverdue : SETTINGS.msgConfirm;
      const v = { customer: b.customer, piece: b.outfit, outfit: o.name || '', booking: b.id, pickup: fmt(b.from), return_date: fmt(b.to), late_fee: inr(b.lateFee || 0), balance: inr(b.due + (b.lateFee || 0)), shop: SETTINGS.shopName };
      const text = String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
      return `https://wa.me/91${String(b.phone || '').replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;
    },
    /* first live booking of this piece that would collide with from..to (the day after a return is a cleaning buffer, same rule as the database) */
    clash: (piece, from, to, ignoreNo) => BOOKINGS.find((x) => x.outfit === +piece && x.no !== ignoreNo && LIVE(x) && from <= addDays(x.to, R.BUFFER_DAYS) && x.from <= addDays(to, R.BUFFER_DAYS)),
    /* money still to collect, as rows for the payments page */
    dues: () => BOOKINGS.filter(LIVE).flatMap((b) => [
      ...(b.due > 0 ? [{ booking: b, kind: 'balance', amount: b.due, label: b.status === 'upcoming' ? 'Due at pickup' : 'Balance due' }] : []),
      ...(b.lateFee > 0 ? [{ booking: b, kind: 'late_fee', amount: b.lateFee, label: 'Overdue ' + b.lateDays + 'd' }] : [])]),
  });

  /* ---------------- demo dataset (used without Supabase; supabase/seed.sql is generated from it) ---------------- */
  R.DEMO_TODAY = DEMO_TODAY;
  R.demoRaw = function demoRaw() {
    const O = [
      [1007, 'Pink Gota Patti', 'Wedding guest', 'L', 1100, 2500, '#e91e63', '#ff9800', 'rented', ''],
      [1009, 'Maroon Bridal Lehenga', 'Bridal', 'XL', 2500, 8000, '#7b1fa2', '#b71c1c', 'rented', ''],
      [1014, 'Royal Red Bandhani', 'Navratri / Garba', 'M', 900, 2000, '#c62828', '#ef6c00', 'available', ''],
      [1018, 'Green Rajwadi', 'Navratri / Garba', 'S', 750, 1500, '#2e7d32', '#f9a825', 'available', ''],
      [1022, 'Navratri Mirror Work', 'Navratri / Garba', 'M', 950, 2000, '#6a1b9a', '#f06292', 'rented', ''],
      [1025, 'Orange Kutchi Work', 'Navratri / Garba', 'M', 800, 1800, '#ef6c00', '#d84315', 'rented', ''],
      [1031, 'Peacock Blue Embroidered', 'Wedding guest', 'M', 1200, 2500, '#1565c0', '#00897b', 'available', ''],
      [1033, 'Teal Sequin Garba', 'Navratri / Garba', 'S', 850, 1800, '#00838f', '#7cb342', 'cleaning', 'Ready tomorrow'],
      [1036, 'Gold Zari Bridal', 'Bridal', 'M', 3000, 9000, '#c9a227', '#8d1c1c', 'repair', 'Torn dupatta'],
      [1040, 'Yellow Haldi Special', 'Haldi / Mehendi', 'L', 700, 1500, '#f9a825', '#ef6c00', 'available', ''],
    ];
    // [no, piece, customer, phone, from, to, status, rent]
    const B = [
      [1042, 1014, 'Priya Patel', '98250 11122', '2026-10-12', '2026-10-15', 'upcoming', 3600], [1019, 1014, 'Kinjal Shah', '98980 12121', '2026-10-07', '2026-10-09', 'returned', 2700],
      [1010, 1014, 'Riya Desai', '99250 77788', '2026-10-03', '2026-10-05', 'returned', 2700], [968, 1014, 'Mansi Parekh', '98790 88899', '2026-04-20', '2026-04-22', 'returned', 2700],
      [951, 1014, 'Hetal Modi', '98240 45454', '2026-03-14', '2026-03-16', 'returned', 2700], [1038, 1007, 'Kajal Mehta', '99090 22233', '2026-10-10', '2026-10-13', 'out', 4400],
      [985, 1007, 'Nidhi Shah', '97270 33344', '2026-05-02', '2026-05-04', 'returned', 3300], [940, 1007, 'Bhumi Vyas', '98250 66655', '2026-02-08', '2026-02-09', 'returned', 2200],
      [1031, 1009, 'Pooja Rana', '97270 99900', '2026-10-08', '2026-10-11', 'out', 10000], [975, 1009, 'Rinku Shah', '98980 10101', '2026-04-28', '2026-04-30', 'returned', 7500],
      [930, 1009, 'Sejal Amin', '99090 20202', '2026-01-25', '2026-01-27', 'returned', 7500], [1044, 1018, 'Sneha Joshi', '98980 55566', '2026-10-12', '2026-10-14', 'upcoming', 2250],
      [1012, 1018, 'Pinal Joshi', '98240 30303', '2026-10-04', '2026-10-06', 'returned', 2250], [1035, 1022, 'Riya Desai', '99250 77788', '2026-10-09', '2026-10-12', 'out', 3800],
      [1002, 1022, 'Heena Rana', '97370 40404', '2026-09-26', '2026-09-28', 'returned', 2850], [1029, 1025, 'Anjali Trivedi', '97370 44455', '2026-10-07', '2026-10-10', 'out', 3200],
      [1008, 1025, 'Disha Patel', '98250 50505', '2026-09-30', '2026-10-02', 'returned', 2400], [1021, 1031, 'Neha Shah', '98240 66677', '2026-10-08', '2026-10-12', 'returned', 6000],
      [1005, 1031, 'Dhara Mehta', '98790 60606', '2026-09-20', '2026-09-22', 'returned', 3600], [962, 1031, 'Jinal Patel', '99090 70707', '2026-04-10', '2026-04-12', 'returned', 3600],
      [1015, 1033, 'Komal Parmar', '98980 80808', '2026-10-05', '2026-10-07', 'returned', 2550], [958, 1036, 'Mital Desai', '97270 90909', '2026-03-30', '2026-04-01', 'returned', 9000],
      [1000, 1036, 'Aarti Shah', '98250 11313', '2026-09-12', '2026-09-14', 'returned', 9000], [1046, 1040, 'Mansi Parekh', '98790 88899', '2026-10-17', '2026-10-19', 'upcoming', 2100],
      [990, 1040, 'Foram Desai', '98240 14141', '2026-05-10', '2026-05-11', 'returned', 1400],
    ];
    const outfits = O.map(([id, name, cat, size, rent, dep, c1, c2, status, note]) => ({ id, name, cat, size, rent, dep, c1, c2, status, note, active: true }));
    const dep = (id) => outfits.find((o) => o.id === id).dep;
    const customers = [], byPhone = new Map();
    B.forEach(([, , name, phone]) => { if (!byPhone.has(phone)) { const i = customers.length; byPhone.set(phone, 3001 + i); customers.push({ id: 3001 + i, name, phone, city: CITY[i % CITY.length], idProof: IDP[i % IDP.length], notes: '' }); } });
    const bookings = B.map(([no, outfit, , phone, from, to, status, rent]) => ({ no, outfit, customerId: byPhone.get(phone), from, to, status, rent, deposit: dep(outfit), notes: '', createdAt: addDays(from, -2) + 'T09:00' }));
    const payments = [], events = [], returned = []; let pid = 2001;
    const MODES = ['upi', 'cash', 'card'];
    bookings.forEach((b) => {
      const mode = MODES[b.customerId % 3], who = 'Ravi', half = b.rent / 2;
      payments.push({ id: pid++, booking: b.no, type: 'deposit', mode, amount: b.deposit, reference: '', at: addDays(b.from, -2) });
      payments.push({ id: pid++, booking: b.no, type: 'advance', mode, amount: half, reference: '', at: addDays(b.from, -2) });
      events.push({ id: events.length + 1, booking: b.no, kind: 'created', message: 'Booking created, advance received', who, at: addDays(b.from, -2) + 'T09:05' });
      if (b.status !== 'upcoming') {
        payments.push({ id: pid++, booking: b.no, type: 'balance', mode: 'cash', amount: half, reference: '', at: b.from });
        events.push({ id: events.length + 1, booking: b.no, kind: 'handover', message: 'Outfit handed over to customer', who, at: b.from + 'T11:00' });
      }
      if (b.status === 'returned') {
        payments.push({ id: pid++, booking: b.no, type: 'refund', mode: 'cash', amount: b.deposit, reference: '', at: b.to });
        events.push({ id: events.length + 1, booking: b.no, kind: 'return', message: 'Returned in good condition, deposit refunded', who, at: b.to + 'T17:00' });
        returned.push({ booking: b.no, date: b.to, depositHeld: b.deposit, lateFee: 0, damage: 0, other: 0, net: b.deposit, mode: 'cash', next: 'cleaning', notes: '', items: [] });
      }
    });
    // ---------- bridal salon + weddings ----------
    const cid = (name) => customers.find((c) => c.name === name).id;
    const artists = [
      { id: 1, name: 'Pooja Desai', phone: '98250 70001', skill: 'Makeup', active: true },
      { id: 2, name: 'Hetal Shah', phone: '98250 70002', skill: 'Hair', active: true },
      { id: 3, name: 'Disha Mehta', phone: '98250 70003', skill: 'Mehendi', active: true },
    ];
    const services = [
      [1, 'HD Bridal Makeup', 'Makeup', 18000, 180], [2, 'Airbrush Bridal Makeup', 'Makeup', 25000, 180], [3, 'Bridal Hairstyle', 'Hair', 4000, 60],
      [4, 'Saree / Lehenga Draping', 'Styling', 1500, 30], [5, 'Bridal Mehendi (hands and feet)', 'Mehendi', 8000, 240], [6, 'Engagement Makeup', 'Makeup', 8000, 120],
      [7, 'Party Makeup (family member)', 'Makeup', 2500, 60], [8, 'Trial Makeup', 'Makeup', 3000, 90], [9, 'Pre-bridal Package', 'Skin', 15000, 240],
      [10, 'Nail Extension', 'Nails', 1500, 60], [11, 'Haldi Look', 'Makeup', 5000, 90],
    ].map(([id, name, category, price, minutes]) => ({ id, name, category, price, minutes, active: true }));
    const D = (n) => addDays(DEMO_TODAY, n);
    const weddings = [
      { id: 5001, customerId: cid('Anjali Trivedi'), groom: 'Kunal', date: D(41), venue: 'Sarsana Party Plot', city: 'Surat', status: 'confirmed', discount: 2000, notes: 'Bride prefers a natural, dewy look. Allergic to some perfumes.', createdAt: D(-20) + 'T10:00' },
      { id: 5002, customerId: cid('Hetal Modi'), groom: 'Rohan', date: D(54), venue: 'Hotel Lords Plaza', city: 'Surat', status: 'enquiry', discount: 0, notes: '', createdAt: D(-3) + 'T16:00' },
      { id: 5003, customerId: cid('Priya Patel'), groom: 'Jay', date: D(13), venue: 'Taj Gateway', city: 'Surat', status: 'confirmed', discount: 0, notes: 'Wearing the rented red bandhani for the haldi function.', createdAt: D(-30) + 'T12:00' },
      { id: 5004, customerId: cid('Neha Shah'), groom: 'Dev', date: D(-8), venue: 'The Grand Bhagwati', city: 'Surat', status: 'completed', discount: 0, notes: '', createdAt: D(-45) + 'T11:00' },
    ];
    const ev = (id, wedding, kind, title, date, start, end, venue, artist, people, done) => ({ id, wedding, kind, title, date, start, end, venue, artist, people, notes: '', done: !!done });
    const wevents = [
      ev(1, 5001, 'trial', 'Trial', D(8), '11:00', '12:30', 'Salon', 1, 1), ev(2, 5001, 'mehendi', 'Mehendi', D(39), '14:00', '18:00', 'Bride\'s home', 3, 1),
      ev(3, 5001, 'haldi', 'Haldi', D(40), '09:00', '10:30', 'Bride\'s home', 1, 3), ev(4, 5001, 'wedding', 'Wedding day makeup', D(41), '05:00', '09:00', 'Sarsana Party Plot', 1, 4),
      ev(5, 5001, 'wedding', 'Wedding day hair', D(41), '05:00', '08:00', 'Sarsana Party Plot', 2, 1),
      ev(6, 5002, 'trial', 'Trial', D(37), '15:00', '16:30', 'Salon', 1, 1), ev(7, 5002, 'wedding', 'Wedding day', D(54), '06:00', '10:00', 'Hotel Lords Plaza', null, 3),
      ev(8, 5003, 'mehendi', 'Mehendi', D(11), '15:00', '19:00', 'Bride\'s home', 3, 1), ev(9, 5003, 'haldi', 'Haldi', D(12), '10:00', '11:30', 'Taj Gateway', 2, 2),
      ev(10, 5003, 'wedding', 'Wedding day makeup', D(13), '05:30', '09:30', 'Taj Gateway', 1, 3),
      ev(11, 5004, 'trial', 'Trial', D(-30), '11:00', '12:30', 'Salon', 1, 1, true), ev(12, 5004, 'wedding', 'Wedding day makeup', D(-8), '05:00', '09:00', 'The Grand Bhagwati', 1, 2, true),
    ];
    const it = (id, wedding, event, service, qty) => { const sv = services.find((x) => x.id === service); return { id, wedding, event, service, desc: sv.name, qty, price: sv.price }; };
    const witems = [
      it(1, 5001, 4, 1, 1), it(2, 5001, 5, 3, 1), it(3, 5001, 4, 4, 1), it(4, 5001, 2, 5, 1), it(5, 5001, 4, 7, 3), it(6, 5001, 1, 8, 1), it(7, 5001, 3, 11, 1),
      it(8, 5002, 7, 2, 1), it(9, 5002, 7, 3, 1), it(10, 5002, 6, 8, 1),
      it(11, 5003, 10, 1, 1), it(12, 5003, 10, 3, 1), it(13, 5003, 8, 5, 1), it(14, 5003, 10, 4, 1),
      it(15, 5004, 12, 1, 1), it(16, 5004, 12, 3, 1),
    ];
    const wpayments = [
      { id: 1, wedding: 5001, amount: 15000, mode: 'upi', note: 'Advance to confirm the date', at: D(-11), who: 'Ravi' }, { id: 2, wedding: 5001, amount: 10000, mode: 'cash', note: 'Second instalment', at: D(-4), who: 'Ravi' },
      { id: 3, wedding: 5003, amount: 20000, mode: 'upi', note: 'Advance', at: D(-10), who: 'Ravi' },
      { id: 4, wedding: 5004, amount: 12000, mode: 'upi', note: 'Advance', at: D(-33), who: 'Ravi' }, { id: 5, wedding: 5004, amount: 10000, mode: 'cash', note: 'Balance', at: D(-9), who: 'Ravi' },
    ];
    const T = ['Trial booked and done', 'Bridal outfit finalised', 'Jewellery and accessories decided', 'Advance received', 'Artists assigned to every function', 'Final confirmation call to the family'];
    const OFF = [-21, -14, -10, -30, -7, -3];
    let tid = 1; const wtasks = [];
    weddings.forEach((w) => T.forEach((title, i) => {
      const doneAt = { 5001: [1, 3], 5003: [0, 1, 3, 4] };           // which checklist rows are already ticked in the sample weddings
      const done = w.status === 'completed' || (doneAt[w.id] || []).includes(i);
      wtasks.push({ id: tid++, wedding: w.id, title, due: addDays(w.date, OFF[i]), done: !!done });
    }));
    bookings.find((b) => b.no === 1042).weddingId = 5003;     // Priya rents the red bandhani for her haldi
    bookings.find((b) => b.no === 1021).weddingId = 5004;     // Neha rented the peacock blue lehenga

    return { today: DEMO_TODAY, settings: { shopName: 'Pratishtha Bridal', address: '12, Ring Road, Surat, Gujarat 395002', phone: '98250 00000', gstin: '', lateFeePerDay: 300, graceHours: 3, depositPct: 30, advancePct: 50, minDays: 1, upi: 'pratishthabridal@upi', receiptPrefix: 'RC-',
      salonTerms: ['An advance is needed to confirm the dates and is non-refundable.', 'The balance is payable before the first function of the wedding.', 'Trial is chargeable and is adjusted in the package if the booking is confirmed.', 'Artists are reserved for the booked times; extra time or extra people are charged separately.', 'Date changes depend on artist availability.'],
      msgConfirm: 'Hi {customer}, your booking {booking} is confirmed: {outfit} (piece {piece}), {pickup} to {return_date}. Balance at pickup: {balance}. - {shop}',
      msgOverdue: 'Hi {customer}, your outfit {outfit} (piece {piece}) was due on {return_date}. Please return it today to avoid more late fees of {late_fee}. - {shop}',
      terms: ['Return the outfit by the date on the slip. Late return is charged per day after the grace period.', 'The deposit is refunded after inspection of the outfit, on safe return.', 'Stains, tears, missing pieces or damage are charged from the deposit.', "No alteration without the shop's permission. Do not wash or dry-clean.", 'ID proof is verified at pickup. Advance is non-refundable on cancellation within 24 hours of pickup.'] },
      outfits, customers, bookings, payments, events, returned, artists, services, weddings, wevents, witems, wpayments, wtasks };
  };
  R.setData(R.demoRaw());                                   // start with demo data; js/api.js replaces it after sign-in when Supabase is configured

  /* ---------------- design illustration (used when an outfit has no real photo) ---------------- */
  let seq = 0;
  const escA = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  R.esc = escA;
  R.outfitArt = function outfitArt(o) {
    const k = 'a' + (++seq);
    return `<svg class="art" viewBox="0 0 120 150" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${escA(o.name)}">
      <defs>
        <linearGradient id="${k}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.c1}" stop-opacity=".14"/><stop offset="1" stop-color="${o.c2}" stop-opacity=".30"/></linearGradient>
        <linearGradient id="${k}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.c1}"/><stop offset="1" stop-color="${o.c2}"/></linearGradient>
        <pattern id="${k}p" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="1.4" fill="#fff" fill-opacity=".6"/></pattern>
      </defs>
      <rect width="120" height="150" fill="url(#${k}b)"/>
      <path d="M60 14v-3a3 3 0 1 0-3-3M60 14 22 28M60 14l38 14" stroke="#8a94a3" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M22 132 46 56h28l24 76q-38 9-76 0Z" fill="url(#${k}s)"/>
      <path d="M22 132 46 56h28l24 76q-38 9-76 0Z" fill="url(#${k}p)"/>
      <path d="M32 106q28 7 56 0M27 120q33 8 66 0" stroke="#f5d27a" stroke-width="2" fill="none" stroke-dasharray="3 2"/>
      <path d="M22 132q38 9 76 0v7q-38 9-76 0Z" fill="#f5d27a"/>
      <rect x="46" y="52" width="28" height="4.5" rx="1" fill="#f5d27a"/>
      <path d="M43 26 60 20l17 6 10 10-8 8-6-4v14H47V40l-6 4-8-8Z" fill="${o.c1}"/>
      <path d="M52 21q8 9 16 0" fill="#fff" fill-opacity=".55"/>
      <path d="M38 28c-9 22-6 52-18 98 7-2 12-3 16-9 7-24 6-62 13-87Z" fill="${o.c2}" fill-opacity=".92"/>
      <path d="M38 28c-9 22-6 52-18 98 7-2 12-3 16-9 7-24 6-62 13-87Z" fill="url(#${k}p)"/>
    </svg>`;
  };
  R.outfitPhoto = (o) => o.photo ? `<img class="art" src="${escA(o.photo)}" alt="${escA(o.name)}" loading="lazy">` : R.outfitArt(o);

  window.RR = R;
})();
