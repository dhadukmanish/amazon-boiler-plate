/* Builds the shared top bar + side nav once, so each page only contains its own content.
   Page contract: <body data-active="bookings"> <div id="page" data-banner="optional text">…content…</div>
   Icons: write <i data-icon="plus"></i> in HTML, or call ic('plus') in JS. */
(function () {
  /* ---------- Icon set: 24px grid, 1.75 stroke, inherits currentColor (outline style) ---------- */
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    calendarCheck: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="m9 15 2 2 4-4"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/>',
    package: '<path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9Z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
    shirt: '<path d="M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0Z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.4c2 .7 3.5 2.6 3.5 5.6"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    banknote: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
    contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
    rows: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    filePlus: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z"/><path d="M14 3v5h5M12 12v6M9 15h6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bag: '<path d="M5 8h14l-1 12H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    droplet: '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3Z"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    columns: '<rect x="3.5" y="4" width="4.5" height="14" rx="1"/><rect x="9.75" y="4" width="4.5" height="9" rx="1"/><rect x="16" y="4" width="4.5" height="11.5" rx="1"/>',
    chat: '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.6-4.2A8.5 8.5 0 1 1 20.5 11.5Z"/>',
    gem: '<path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M2 9h20M9 3l3 6 3-6M12 21 9 9M12 21l3-12"/>',
    printer: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4"/>',
    heart: '<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"/>',
    sparkles: '<path d="M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    wrench:'<path d="M14.5 6.5a4 4 0 0 0-5 5L3.5 17.5l3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5-2-.5-.5-2Z"/>',
  };
  const ic = (name, cls = '') =>
    `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
  const hydrate = (root) => root.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = ic(el.dataset.icon); });
  window.ic = ic; window.hydrateIcons = hydrate;

  /* ---------- Shell ---------- */
  // perm: the link shows (and the page opens) when the person holds ANY of these permissions. The owner holds all of them.
  const NAV = [
    { id: 'dashboard', icon: 'home',          label: 'Dashboard', href: 'index.html',     perm: ['view_dashboard'] },
    { id: 'bookings',  icon: 'calendarCheck', label: 'Bookings',  href: 'bookings.html',  perm: ['view_bookings'] },
    { id: 'weddings',  icon: 'heart',         label: 'Weddings',  href: 'weddings.html',  perm: ['view_weddings'] },
    { id: 'salon',     icon: 'sparkles',      label: 'Salon',     href: 'salon.html',     perm: ['view_weddings'] },
    { id: 'calendar',  icon: 'calendar',      label: 'Calendar',  href: 'calendar.html',  perm: ['view_calendar'] },
    { id: 'inventory', icon: 'package',       label: 'Inventory', href: 'inventory.html', perm: ['view_inventory'] },
    { id: 'customers', icon: 'users',         label: 'Customers', href: 'customers.html', perm: ['view_customers'] },
    { id: 'payments',  icon: 'wallet',        label: 'Payments',  href: 'payments.html',  perm: ['view_payments'] },
    { id: 'reports',   icon: 'chart',         label: 'Reports',   href: 'reports.html',   perm: ['view_reports'] },
    { id: 'settings',  icon: 'sliders',       label: 'Settings',  href: 'settings.html',  perm: ['manage_settings', 'manage_users', 'view_audit'] },
  ];
  const page = document.getElementById('page');
  const active = document.body.dataset.active;

  const links = NAV.map((n) =>
    `<a class="nav-link" href="${n.href}" data-perm="${n.perm.join(' ')}" ${n.id === active ? 'aria-current="page"' : ''} title="${n.label}">
       <span class="ic">${ic(n.icon)}</span><span class="tx">${n.label}</span></a>`).join('');

  const app = document.createElement('div');
  app.className = 'app';
  app.innerHTML = `
    <header class="topbar">
      <button class="menu-btn" data-toggle-nav aria-label="Menu">${ic('menu')}</button>
      <a class="brand" href="index.html"><span class="brand-mark">${ic('gem')}</span> <span class="brand-name" id="brand-name">Pratishtha Bridal</span></a>
      <label class="search">${ic('search')}
        <input placeholder="Search piece number, name or customer" aria-label="Search"><kbd>Ctrl K</kbd></label>
      <span class="spacer"></span>
      <button class="icon-btn search-mini" data-search-open title="Search" aria-label="Search">${ic('search')}</button>
      <button class="icon-btn" data-scan title="Scan a piece tag" aria-label="Scan a piece tag">${ic('scan')}</button>
      <span class="indicator orange demo-pill" id="demo-pill" hidden title="Sample data kept only in this browser">Demo data</span>
      <a class="btn btn-primary btn-sm" id="top-new" data-perm="create_booking" href="booking-new.html" title="New booking">${ic('plus')}<span class="lbl"> New booking</span></a>
      <button class="icon-btn" data-toggle-density title="Compact / comfortable" aria-label="Toggle density">${ic('rows')}</button>
      <button class="icon-btn" data-toggle-theme title="Dark / light" aria-label="Toggle theme">${ic('contrast')}</button>
      <details class="menu user-menu" id="user-menu"><summary class="user-chip"><span class="avatar md c0" id="u-av">…</span><span class="uname" id="u-name"></span>${ic('chevronDown')}</summary>
        <div class="menu-list" id="u-list"></div></details>
    </header>
    <div class="app-body">
      <nav class="sidenav" aria-label="Main">${links}</nav>
      <main class="content">
        ${page.dataset.banner ? `<div class="banner">${ic('info')}<span class="msg">${page.dataset.banner}</span><button class="x" aria-label="Dismiss" onclick="this.parentElement.remove()">${ic('x')}</button></div>` : ''}
        <div class="content-inner" id="slot"></div>
      </main>
    </div>`;
  const slot = app.querySelector('#slot');
  while (page.firstChild) slot.appendChild(page.firstChild);
  page.replaceWith(app);
  hydrate(document);

  /* ---- after sign-in: make the shell role-aware ----
     RR.ready is replaced by a promise that never resolves on a page the role may not open, so that page's own script simply never runs. */
  const API = window.RR.api, $$ = (id) => document.getElementById(id);
  const ROLE_NAME = Object.fromEntries(Object.entries(window.RR.ROLES).map(([k, v]) => [k, v.label]));
  document.addEventListener('click', (e) => document.querySelectorAll('.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.removeAttribute('open'); }));
  window.RR.ready = API.ready.then(() => {
    if (API.error) { slot.insertAdjacentHTML('afterbegin', `<div class="alert danger"><div><strong>Cannot connect to the server</strong>${API.error.message}</div></div>`); return new Promise(() => {}); }
    if (!API.user) return;                                       // not signed in (login page)
    const S = window.RR.SETTINGS, u = API.user;
    $$('brand-name').textContent = S.shopName || 'Pratishtha Bridal';
    const show = () => app.querySelectorAll('[data-perm]').forEach((el) => { el.hidden = !API.hasAny(...el.dataset.perm.split(' ')); });
    show(); document.addEventListener('rr:data', show);                // permissions can change while the app is open (owner edits a role)
    $$('demo-pill').hidden = API.live;
    $$('u-av').textContent = u.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(); $$('u-av').className = 'avatar md c' + (u.name.length % 6);
    $$('u-name').textContent = u.name.split(' ')[0];
    $$('u-list').innerHTML = `<div class="menu-head"><strong>${u.name}</strong><br><small>${ROLE_NAME[API.role]}${API.live ? ' · ' + u.email : ' · demo mode'}</small></div><button data-myaccess>What can I do here?</button>` +
      (API.live ? '' : `<div class="menu-head"><small>Try the app as:</small></div>${Object.keys(ROLE_NAME).map((r) => `<button data-demo-role="${r}">${API.role === r ? '✓ ' : ''}${ROLE_NAME[r]}</button>`).join('')}<button data-demo-reset>Reset demo data</button>`) +
      '<button class="danger" data-signout>Sign out</button>';
    $$('u-list').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if ('myaccess' in b.dataset) { b.closest('.menu').removeAttribute('open'); window.RR.ui.myAccess(); } else if (b.dataset.demoRole) API.setDemoRole(b.dataset.demoRole); else if ('demoReset' in b.dataset) API.resetDemo(); else if ('signout' in b.dataset) API.signOut();
    });
    const allowed = (document.body.dataset.perm || '').split(/[ ,]+/).filter(Boolean);
    if (allowed.length && !API.hasAny(...allowed)) {
      const need = allowed.map((k) => (window.RR.PERMS.find((p) => p.key === k) || { label: k }).label).join(' or ');
      const home = API.homePage();
      slot.innerHTML = `<div class="alert warning"><div><strong>No access</strong>Your role (${ROLE_NAME[API.role]}) is not allowed to open this page. It needs: <em>${need}</em>. Ask the owner if you should have it. ${home.startsWith('login') ? '' : `<a href="${home}">Go to my home page</a>`}</div></div>`;
      return new Promise(() => {});
    }
  });

  /* ---- Awesomebar: Ctrl+K command palette (pages, create, filters, records) ---- */
  const CMDS = [
    ...NAV.filter((n) => n.href !== '#').map((n) => ({ g: 'Go to', t: n.label, i: n.icon, h: n.href, p: n.perm })),
    { g: 'Create', t: 'New booking', i: 'filePlus', h: 'booking-new.html', p: ['create_booking'] },
    { g: 'Create', t: 'New wedding', i: 'heart', h: 'weddings.html?new=1', p: ['edit_weddings'] },
    { g: 'Create', t: 'Receive return', i: 'undo', h: 'return.html', p: ['receive_return'] },
    { g: 'Create', t: 'Add outfit', i: 'plus', h: 'inventory.html', p: ['manage_outfits'] },
    { g: 'Create', t: 'Print piece tags (QR + barcode)', i: 'qr', h: 'tags.html', p: ['print_tags'] },
    { g: 'Create', t: 'Take payment', i: 'banknote', h: 'payments.html', p: ['view_payments'] },
    { g: 'Report', t: 'Top rented outfits', i: 'chart', h: 'reports.html', p: ['view_reports'] },
    { g: 'Filter', t: 'Refunds paid', i: 'undo', h: 'payments.html?status=refund', p: ['view_payments'] },
    { g: 'Filter', t: 'Deposits held', i: 'wallet', h: 'payments.html?status=deposit', p: ['view_payments'] },
    { g: 'Filter', t: 'Pending balances', i: 'wallet', h: 'payments.html?status=pending', p: ['view_payments'] },
    { g: 'Filter', t: 'Overdue bookings', i: 'clock', h: 'bookings.html?status=overdue', p: ['view_bookings'] },
    { g: 'Filter', t: 'Bookings with customer', i: 'bag', h: 'bookings.html?status=out', p: ['view_bookings'] },
    { g: 'Filter', t: 'Available outfits', i: 'checkCircle', h: 'inventory.html?status=available' },
    { g: 'Filter', t: 'Outfits in cleaning', i: 'droplet', h: 'inventory.html?status=cleaning' },
  ];

  /* Data-driven search (js/data.js): piece number -> outfit + photo + full booking history;
     also name, category, customer, phone, booking id. */
  const R = window.RR;
  const pill = (cls, label) => `<span class="indicator ${cls}">${label}</span>`;
  const outfitRow = (o) => {
    const n = R.bookingsOf(o.id).length, st = R.OUTFIT_STATUS[o.status];
    return { g: 'Outfit', t: `${o.id} · ${o.name}`, thumb: R.outfitPhoto(o), h: 'outfit.html?id=' + o.id,
      sub: `${o.cat} · Size ${o.size} · ${R.inr(o.rent)}/day · ${n} booking${n === 1 ? '' : 's'}`,
      badge: pill(o.overdue ? 'red' : st.cls, o.overdue ? 'Overdue' : st.label) };
  };
  const bookingRow = (b, g, nested) => {
    const o = R.outfitById(b.outfit);
    return { g, t: `${b.id} · ${b.customer}`, i: 'calendarCheck', nested, h: 'booking.html?id=' + b.no,
      sub: `${nested ? '' : o.id + ' ' + o.name + ' · '}${R.range(b)} · ${R.inr(b.rent)}`, badge: pill(R.STATUS[b.status].cls, R.STATUS[b.status].label) };
  };
  const customerRow = (c) => ({ g: 'Customer', t: `${c.name}`, i: 'users', h: 'customer.html?id=' + c.id,
    sub: `${c.phone} · ${c.bookings.length} booking${c.bookings.length === 1 ? '' : 's'} · ${R.inr(c.spent)} spent${c.due ? ' · ' + R.inr(c.due) + ' due' : ''}`,
    badge: c.hasLate ? pill('red', 'Overdue') : c.tags.includes('VIP') ? pill('orange', 'VIP') : c.bookings.length > 1 ? pill('blue', 'Repeat') : '' });
  const weddingRow = (w) => ({ g: 'Wedding', t: `${w.code} · ${w.bride}`, i: 'heart', h: 'wedding.html?id=' + w.id,
    sub: `${R.fmt(w.date)}${w.groom ? ' · with ' + w.groom : ''} · ${w.venue || w.city || 'venue not set'} · balance ${R.inr(w.balance)}`, badge: pill(R.WSTATUS[w.status].cls, R.WSTATUS[w.status].label) });
  const dynamic = (q) => {
    if (!R || !q) return [];
    const raw = q.replace(/^#/, '').trim().toLowerCase(), out = [];
    // each kind of result only appears if the person may open the page it leads to
    const canO = API.has('view_inventory'), canB = API.has('view_bookings'), canC = API.has('view_customers');
    const outfits = canO ? R.OUTFITS : [], bookings = canB ? R.BOOKINGS : [], customers = canC ? R.CUSTOMERS : [], weddings = API.has('view_weddings') ? R.WEDDINGS : [];
    if (/^d+$/.test(raw)) {
      const exact = outfits.filter((o) => String(o.id) === raw);
      (exact.length ? exact : outfits.filter((o) => String(o.id).startsWith(raw))).forEach((o) => out.push(outfitRow(o)));
      if (exact.length && canB) {               // full booking history of that piece
        const hist = R.bookingsOf(exact[0].id), g = `Booking history · piece ${exact[0].id}`;
        hist.slice(0, 6).forEach((b) => out.push(bookingRow(b, g, true)));
        if (hist.length > 6) out.push({ g, t: `View all ${hist.length} bookings`, i: 'list', nested: true, h: 'outfit.html?id=' + exact[0].id });
      }
      weddings.filter((w) => String(w.id) === raw).forEach((w) => out.push(weddingRow(w)));
      if (raw.length >= 5) customers.filter((c) => c.phone.replace(/s/g, '').includes(raw)).slice(0, 4).forEach((c) => out.push(customerRow(c)));
      if (raw.length >= 5) bookings.filter((b) => b.phone.replace(/s/g, '').includes(raw)).slice(0, 5).forEach((b) => out.push(bookingRow(b, 'Bookings by phone')));
      return out;
    }
    outfits.filter((o) => (o.name + ' ' + o.cat).toLowerCase().includes(raw)).slice(0, 5).forEach((o) => out.push(outfitRow(o)));
    weddings.filter((w) => (w.code + ' ' + w.bride + ' ' + w.groom + ' ' + w.venue + ' ' + w.phone).toLowerCase().includes(raw)).slice(0, 4).forEach((w) => out.push(weddingRow(w)));
    customers.filter((c) => (c.name + ' ' + c.phone).toLowerCase().includes(raw)).slice(0, 4).forEach((c) => out.push(customerRow(c)));
    bookings.filter((b) => (b.id + ' ' + (R.customerOf(b) ? '' : b.customer)).toLowerCase().includes(raw))
      .sort((a, b) => (a.from < b.from ? 1 : -1)).slice(0, 5).forEach((b) => out.push(bookingRow(b, 'Bookings')));
    return out;
  };
  const pal = document.createElement('div');
  pal.className = 'palette-backdrop';
  pal.innerHTML = `<div class="palette" role="dialog" aria-label="Search or run a command">
    <input placeholder="Type a piece number (e.g. 1014), name, customer or command…" aria-label="Search"><ul></ul>
    <div class="palette-foot">Piece number shows photo + full booking history · ↑↓ move · Enter open · Esc close</div></div>`;
  document.body.appendChild(pal);
  const pin = pal.querySelector('input'), plist = pal.querySelector('ul');
  let shown = [], sel = 0;
  const render = () => {
    const q = pin.value.trim().toLowerCase();
    shown = [...dynamic(q), ...CMDS.filter((c) => (!c.p || API.hasAny(...c.p)) && (!q || (c.t + ' ' + c.g).toLowerCase().includes(q)))];
    sel = Math.min(sel, Math.max(shown.length - 1, 0));
    let last = '';
    plist.innerHTML = shown.map((c, n) => {
      const head = c.g !== last ? `<li class="grp">${c.g}</li>` : ''; last = c.g;
      const lead = c.nested ? '' : c.thumb ? `<span class="thumb">${c.thumb}</span>` : ic(c.i);
      return `${head}<li class="item${c.nested ? ' sub-item' : ''}" role="option" data-n="${n}" aria-selected="${n === sel}">${lead}<span class="txt"><span>${esc(c.t)}</span>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span>${c.badge ? `<span class="end">${c.badge}</span>` : ''}</li>`;
    }).join('') || '<li class="grp">No results</li>';
    const act = plist.querySelector('[aria-selected="true"]'); if (act) act.scrollIntoView({ block: 'nearest' });
  };
  const open = () => { pal.classList.add('open'); pin.value = ''; sel = 0; render(); pin.focus(); };
  const close = () => pal.classList.remove('open');
  const go = (n) => { if (shown[n]) location.href = shown[n].h; };
  pin.addEventListener('input', () => { sel = 0; render(); });
  pin.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter') go(sel);
    else if (e.key === 'Escape') close();
  });
  plist.addEventListener('click', (e) => { const li = e.target.closest('.item'); if (li) go(+li.dataset.n); });
  pal.addEventListener('mousedown', (e) => { if (e.target === pal) close(); });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); } });
  /* ---- Scanning a piece tag (QR / barcode both hold the piece number) ----
     1) USB / Bluetooth handheld scanners type the digits + Enter like a keyboard: handled by the listener below on ANY page.
     2) Camera: the scan dialog uses the browser BarcodeDetector API where available (Chrome/Edge/Android). */
  const openPiece = (text) => {
    const n = String(text).replace(/\D/g, ''), o = R && R.outfitById(n);
    if (o) { location.href = 'outfit.html?id=' + o.id; return true; }
    if (window.toast) window.toast(n ? `No piece with number ${n}` : 'Nothing scanned'); return false;
  };
  let wbuf = '', wlast = 0;
  document.addEventListener('keydown', (e) => {
    if (/input|textarea|select/i.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const now = Date.now(); if (now - wlast > 80) wbuf = ''; wlast = now;       // scanners type far faster than people
    if (/^\d$/.test(e.key)) wbuf += e.key;
    else if (e.key === 'Enter' && wbuf.length >= 4) { if (R && R.outfitById(wbuf)) openPiece(wbuf); wbuf = ''; }
  });
  const sc = document.createElement('div');
  sc.className = 'modal-backdrop'; sc.id = 'scan'; sc.setAttribute('role', 'dialog'); sc.setAttribute('aria-modal', 'true'); sc.setAttribute('aria-labelledby', 'scan-t');
  sc.innerHTML = `<div class="modal"><div class="card-header"><h2 id="scan-t">Scan piece tag</h2><button class="btn btn-link" data-close-modal aria-label="Close">${ic('x')}</button></div>
    <div class="card-body"><video id="scan-v" playsinline muted style="width:100%;border-radius:8px;background:#000;max-height:260px;display:none"></video>
      <p class="hint-line" id="scan-msg" style="margin:8px 0">Point the camera at the QR or barcode on the tag.</p>
      <div class="field"><label for="scan-in">Or type / scan the piece number</label><input id="scan-in" class="input" inputmode="numeric" placeholder="e.g. 1014"></div></div></div>`;
  document.body.appendChild(sc);
  let stream = null, timer = null;
  const stopCam = () => { clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
  const openScan = async () => {
    sc.classList.add('open'); const inp = sc.querySelector('#scan-in'); inp.value = ''; setTimeout(() => inp.focus(), 50);
    const v = sc.querySelector('#scan-v'), msg = sc.querySelector('#scan-msg');
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) { msg.textContent = 'Camera scanning is not supported in this browser. Use a handheld scanner or type the number.'; return; }
    try {
      const det = new BarcodeDetector({ formats: ['qr_code', 'code_128'] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      v.srcObject = stream; v.style.display = 'block'; await v.play();
      timer = setInterval(async () => { try { const r = await det.detect(v); if (r.length && openPiece(r[0].rawValue)) stopCam(); } catch (e) { /* frame not ready */ } }, 300);
    } catch (e) { msg.textContent = 'Camera is not available (permission denied?). Use a handheld scanner or type the number.'; }
  };
  document.querySelector('[data-scan]').addEventListener('click', openScan);
  sc.querySelector('#scan-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') openPiece(e.target.value); });
  new MutationObserver(() => { if (!sc.classList.contains('open')) { stopCam(); sc.querySelector('#scan-v').style.display = 'none'; } }).observe(sc, { attributes: true, attributeFilter: ['class'] });
  /* ---- shared UI helpers used by several pages (RR.ui) ---- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ui = {
    esc,
    /* popup with a confirm button. onConfirm(el) may throw (message is shown inside the popup) or return false to keep it open */
    modal({ title, body, confirm = 'Save', cancel = 'Cancel', danger = false, onConfirm }) {
      const el = document.createElement('div'); el.className = 'modal-backdrop open'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      el.innerHTML = `<div class="modal"><div class="card-header"><h2>${title}</h2><button class="btn btn-link" data-x aria-label="Close">${ic('x')}</button></div>
        <div class="card-body">${body}</div><div class="card-footer"><span class="hint-line" data-err style="color:var(--c-danger);flex:1"></span>
        <div class="actions">${cancel ? `<button class="btn btn-link" data-x>${cancel}</button>` : ''}<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirm}</button></div></div></div>`;
      document.body.appendChild(el);
      const close = () => el.remove(), ok = el.querySelector('[data-ok]'), err = el.querySelector('[data-err]');
      el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
      el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) close(); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      ok.addEventListener('click', async () => {
        ok.disabled = true; err.textContent = '';
        try { if ((await onConfirm(el)) !== false) close(); } catch (e) { err.textContent = e.message; } finally { ok.disabled = false; }
      });
      const first = el.querySelector('input:not([type=hidden]),select,textarea'); if (first) first.focus();
      return { el, close };
    },
    /* the signed-in person's own access, grouped, so nobody has to guess why a button is missing */
    myAccess() {
      const groups = [...new Set(R.PERMS.map((p) => p.grp))];
      ui.modal({ title: 'What can I do here?', confirm: 'Close', cancel: '',
        body: `<p style="margin:0 0 12px">You are signed in as <strong>${esc(API.user.name)}</strong>, role <strong>${esc(R.ROLES[API.role].label)}</strong>. ${esc(R.ROLES[API.role].blurb)}</p>` +
          groups.map((g) => `<h3 style="font-size:var(--fs-sm);margin:12px 0 4px" class="muted">${esc(g)}</h3>` + R.PERMS.filter((p) => p.grp === g).map((p) =>
            `<div class="list-row" style="padding:6px 0"><span>${esc(p.label)}</span><span class="indicator ${API.has(p.key) ? 'green' : ''}">${API.has(p.key) ? 'Allowed' : 'Not allowed'}</span></div>`).join('')).join('') +
          '<p class="hint-line" style="margin:12px 0 0">The owner can change what a role may do in Settings → Roles &amp; permissions.</p>',
        onConfirm: () => {} });
    },
    /* run an API call, toast the result or the error */
    async act(fn, okMsg) { try { const r = await fn(); if (okMsg) window.toast(okMsg); return r; } catch (e) { window.toast(e.message); throw e; } },
    /* hand an upcoming booking over to the customer (collects any balance first) */
    handOver(b, done) {
      const o = R.outfitById(b.outfit), due = b.due;
      ui.modal({ title: `Hand over ${b.id}`, confirm: 'Hand over outfit',
        body: `<p style="margin:0 0 12px"><strong>${o.id} · ${esc(o.name)}</strong> to <strong>${esc(b.customer)}</strong></p>
          ${due > 0 ? `<div class="alert warning" style="margin-bottom:12px"><div><strong>Balance to collect: ${R.inr(due)}</strong>Includes any deposit not yet paid (deposit ${R.inr(b.deposit)}).</div></div>
            <div class="form-grid"><div class="field"><label for="ho-a">Amount received (₹)</label><input id="ho-a" class="input" type="number" min="0" value="${due}"></div>
            <div class="field"><label for="ho-m">Mode</label><select id="ho-m" class="select"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></div></div>`
            : '<div class="alert success"><div><strong>Paid in full</strong>Rent and deposit are already collected.</div></div>'}`,
        onConfirm: async (el) => {
          const a = el.querySelector('#ho-a'), m = el.querySelector('#ho-m');
          await API.handOver(b.no, { amount: a ? +a.value : 0, mode: m ? m.value : 'cash' });       // errors show inside the popup
          window.toast(`${b.id} handed over`); if (done) done();
        } });
    },
    /* record a payment against a booking. `b` may be omitted: the popup then lets the user pick any booking with money due */
    paymentModal(b, done) {
      const pool = RR.BOOKINGS.filter((x) => R.LIVE(x)), one = b || null;
      const opts = pool.map((x) => `<option value="${x.no}" ${one && one.no === x.no ? 'selected' : ''}>${x.id} · ${esc(x.customer)} · ${R.inr(x.due + x.lateFee)} due</option>`).join('');
      ui.modal({ title: 'Take payment', confirm: 'Save payment',
        body: `<div class="form-grid"><div class="field" style="grid-column:1/-1"><label for="pm-b">Booking</label>${one ? `<input class="input" value="${esc(one.id + ' · ' + one.customer)}" disabled><input id="pm-b" type="hidden" value="${one.no}">` : `<select id="pm-b" class="select">${opts}</select>`}</div>
          <div class="field"><label for="pm-t">Type</label><select id="pm-t" class="select"><option value="balance">Balance</option><option value="advance">Advance</option><option value="deposit">Deposit</option><option value="late_fee">Late fee</option><option value="damage">Damage charge</option><option value="refund">Refund to customer</option></select></div>
          <div class="field"><label for="pm-a">Amount (₹)</label><input id="pm-a" class="input" type="number" min="1" value="${one ? (one.due + one.lateFee) || '' : ''}"></div>
          <div class="field"><label for="pm-m">Mode</label><select id="pm-m" class="select"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></div>
          <div class="field"><label for="pm-r">Reference (optional)</label><input id="pm-r" class="input" placeholder="UPI transaction ID"></div></div>`,
        onConfirm: async (el) => {
          const v = (id) => el.querySelector('#' + id).value, no = +v('pm-b');
          if (!no) throw new Error('Choose a booking.');
          await API.recordPayment({ booking: no, type: v('pm-t'), mode: v('pm-m'), amount: +v('pm-a'), reference: v('pm-r') });
          window.toast('Payment recorded'); if (done) done();
        } });
      const sel = document.querySelector('.modal-backdrop.open #pm-b');       // when the booking changes, suggest its due amount
      if (sel && sel.tagName === 'SELECT') sel.addEventListener('change', () => { const x = R.bookingByNo(sel.value); document.querySelector('.modal-backdrop.open #pm-a').value = x ? (x.due + x.lateFee) || '' : ''; });
      if (sel && sel.tagName === 'SELECT' && !one && pool[0]) document.querySelector('.modal-backdrop.open #pm-a').value = (pool[0].due + pool[0].lateFee) || '';
    },
    /* add (o omitted) or edit an outfit; owner + stock keeper only. The photo is shrunk in the browser before it is stored. */
    outfitModal(o, done) {
      const edit = !!o, next = Math.max(1000, ...R.OUTFITS.map((x) => x.id)) + 1, cats = [...new Set(R.OUTFITS.map((x) => x.cat))];
      o = o || { id: next, name: '', cat: '', size: 'M', rent: '', dep: '', c1: '#c62828', c2: '#ef6c00', note: '' };
      let blob = null;
      const m = ui.modal({ title: edit ? `Edit piece ${o.id}` : 'Add outfit', confirm: edit ? 'Save changes' : 'Add outfit',
        body: `<div class="form-grid">
          <div class="field"><label for="of-id">Piece number (on the tag)</label><input id="of-id" class="input" type="number" min="1" value="${o.id}" ${edit ? 'disabled' : ''}><span class="hint">${edit ? 'The number cannot be changed.' : 'Must be unique. Next free number suggested.'}</span></div>
          <div class="field"><label for="of-n">Outfit name</label><input id="of-n" class="input" value="${esc(o.name)}" placeholder="e.g. Royal Red Bandhani"></div>
          <div class="field"><label for="of-c">Category</label><input id="of-c" class="input" list="of-cats" value="${esc(o.cat)}" placeholder="Navratri / Garba"><datalist id="of-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label for="of-s">Size</label><select id="of-s" class="select">${['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free'].map((s) => `<option ${s === o.size ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label for="of-r">Rent per day (₹)</label><input id="of-r" class="input" type="number" min="0" value="${o.rent}"></div>
          <div class="field"><label for="of-d">Security deposit (₹)</label><input id="of-d" class="input" type="number" min="0" value="${o.dep}"></div>
          <div class="field"><label for="of-c1">Illustration colours</label><div style="display:flex;gap:8px"><input id="of-c1" type="color" value="${o.c1}" style="width:44px;height:36px"><input id="of-c2" type="color" value="${o.c2}" style="width:44px;height:36px"></div><span class="hint">Used when there is no photo.</span></div>
          <div class="field"><label for="of-p">Photo</label><input id="of-p" type="file" accept="image/*"><div id="of-prev" style="margin-top:6px"></div></div>
          <div class="field" style="grid-column:1/-1"><label for="of-note">Note (optional)</label><input id="of-note" class="input" value="${esc(o.status === 'cleaning' || o.status === 'repair' ? o.note : '')}" placeholder="e.g. Hem needs stitching"></div></div>`,
        onConfirm: async (el) => {
          const v = (k) => el.querySelector('#' + k).value, id = +v('of-id');
          if (!(id > 0)) throw new Error('Enter the piece number.');
          if (!edit && R.outfitById(id)) throw new Error(`Piece number ${id} already exists.`);
          if (!v('of-n').trim() || !v('of-c').trim()) throw new Error('Enter the name and category.');
          if (!(+v('of-r') >= 0) || v('of-r') === '' || v('of-d') === '') throw new Error('Enter the rent and the deposit.');
          await API.upsertOutfit({ id, name: v('of-n'), cat: v('of-c').trim(), size: v('of-s'), rent: +v('of-r'), dep: +v('of-d'), c1: v('of-c1'), c2: v('of-c2'), note: v('of-note'), photoBlob: blob });
          window.toast(edit ? 'Piece updated' : `Piece ${id} added`); if (done) done(id);
        } });
      m.el.querySelector('#of-p').addEventListener('change', async (e) => {
        const f = e.target.files[0], prev = m.el.querySelector('#of-prev'); blob = null; prev.innerHTML = '';
        if (!f) return;
        try { blob = await API.prepareImage(f); prev.innerHTML = `<img alt="" src="${URL.createObjectURL(blob)}" style="height:72px;border-radius:6px;border:1px solid var(--c-border)">`; } catch (err) { prev.textContent = err.message; }
      });
      return m;
    },
    setBanner(text) {
      let bn = app.querySelector('.banner');
      if (!text) { if (bn) bn.remove(); return; }
      if (!bn) { bn = document.createElement('div'); bn.className = 'banner'; app.querySelector('.content').prepend(bn); }
      bn.innerHTML = `${ic('info')}<span class="msg">${esc(text)}</span><button class="x" aria-label="Dismiss" onclick="this.parentElement.remove()">${ic('x')}</button>`;
    },
  };
  R.ui = ui;
  R.onData = () => document.dispatchEvent(new CustomEvent('rr:data'));    // fired after every data change; pages re-render on it

  const sbox = app.querySelector('.topbar .search input');
  sbox.addEventListener('focus', () => { sbox.blur(); open(); });
  app.querySelector('[data-search-open]').addEventListener('click', open);   // phones: the search box is hidden, this icon opens the same search
})();
