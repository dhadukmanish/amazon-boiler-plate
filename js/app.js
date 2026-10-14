/* Tiny dependency-free behaviours. Replace/extend freely when moving to a framework.
   Load order on every page: config.js, data.js, api.js, shell.js, (page script), app.js */
(function () {
  const root = document.documentElement;
  const app = document.querySelector('.app');
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  // run after sign-in + first data load (page scripts registered their own .then before this one, so their rows exist by then)
  const whenReady = (fn) => (window.RR && RR.ready ? RR.ready.then(fn) : fn());

  // Persisted theme + density
  ['theme', 'density'].forEach((k) => { const v = store.get('erp-' + k); if (v) root.dataset[k] = v; });
  const toggle = (k, a, b) => { const n = root.dataset[k] === a ? b : a; root.dataset[k] = n; store.set('erp-' + k, n); };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-toggle-theme]')) toggle('theme', 'light', 'dark');
    if (e.target.closest('[data-toggle-density]')) toggle('density', 'comfortable', 'compact');
    const m = e.target.closest('[data-open-modal]'); if (m) document.getElementById(m.dataset.openModal)?.classList.add('open');
  });

  // Nav: collapse (desktop) / drawer (mobile)
  document.querySelector('[data-toggle-nav]')?.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 800px)').matches) app.classList.toggle('nav-open');
    else if (window.matchMedia('(max-width: 1199px)').matches) app.classList.toggle('nav-expanded');   // small laptops / tablets start with the icon-only menu
    else app.classList.toggle('nav-collapsed');
  });
  // Phones: tapping outside the open menu closes it
  document.addEventListener('click', (e) => {
    if (app && app.classList.contains('nav-open') && !e.target.closest('.sidenav, [data-toggle-nav]')) app.classList.remove('nav-open');
  });

  // Tabs
  document.querySelectorAll('[data-tabs]').forEach((tabs) => {
    const btns = tabs.querySelectorAll('.tab');
    btns.forEach((btn) => btn.addEventListener('click', () => {
      btns.forEach((x) => x.setAttribute('aria-selected', x === btn));
      tabs.parentElement.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.id !== btn.dataset.panel));
    }));
  });

  // A row is hidden if the chip filter OR the text filter hides it (both can be active together)
  const refreshRow = (r) => { r.hidden = r.dataset.hc === '1' || r.dataset.hq === '1'; };

  // Filter chips: <div class="chips" data-chips data-for="#list"> buttons[data-status] filter children[data-status]
  // Also honours ?status=overdue in the URL (used by the command palette). data-status may hold several space-separated values.
  document.querySelectorAll('[data-chips]').forEach((c) => {
    const target = document.querySelector(c.dataset.for);
    const apply = (b) => {
      c.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      [...target.children].forEach((r) => { r.dataset.hc = b.dataset.status !== 'all' && !(r.dataset.status || '').split(' ').includes(b.dataset.status) ? '1' : ''; refreshRow(r); });
    };
    c.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) apply(b); });
    c._apply = () => apply(c.querySelector('button[aria-pressed="true"]') || c.querySelector('button'));   // pages call this after re-rendering rows
    whenReady(() => {
      const q = new URLSearchParams(location.search).get('status'), pre = q && c.querySelector(`button[data-status="${q}"]`);
      apply(pre || c.querySelector('button[aria-pressed="true"]') || c.querySelector('button'));   // (re)apply once rows exist
    });
  });

  // Toast
  window.toast = (msg) => {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
  };

  // Frappe-style form: "Not Saved" indicator, Ctrl+S. A page does the real saving by listening to the 'rr:save' event on its [data-form]
  // and calling preventDefault(); otherwise a plain "Saved" toast is shown.
  document.querySelectorAll('[data-form]').forEach((f) => {
    const ind = document.querySelector('[data-indicator]');
    const save = () => {
      const ev = new CustomEvent('rr:save', { cancelable: true, bubbles: true });
      if (f.dispatchEvent(ev)) { if (ind) ind.hidden = true; window.toast('Saved'); }
    };
    f.addEventListener('input', () => { if (ind) ind.hidden = false; });
    document.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', save));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
  });

  // Modal close
  document.querySelectorAll('.modal-backdrop').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close-modal]')) m.classList.remove('open'); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach((m) => m.classList.remove('open'));
    if (e.key === '/' && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); document.querySelector('.topbar .search input')?.focus(); }
  });

  // Data table: sort, text filter, select-all  (works on rows rendered later too)
  document.querySelectorAll('[data-table]').forEach((wrap) => {
    const table = wrap.querySelector('table'); if (!table) return;
    const tbody = table.tBodies[0];
    table.querySelectorAll('thead th[data-sort]').forEach((th, _, all) => th.addEventListener('click', () => {
      const idx = th.cellIndex, dir = th.getAttribute('aria-sort') === 'ascending' ? -1 : 1, num = th.classList.contains('num');
      all.forEach((x) => x.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
      const val = (r) => { const t = r.cells[idx].textContent.trim(); return num ? parseFloat(t.replace(/[^0-9.-]/g, '')) || 0 : t.toLowerCase(); };
      [...tbody.rows].sort((a, b) => (val(a) > val(b) ? 1 : -1) * dir).forEach((r) => tbody.appendChild(r));
    }));
    wrap.querySelector('[data-filter]')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      [...tbody.rows].forEach((r) => { r.dataset.hq = r.textContent.toLowerCase().includes(q) ? '' : '1'; refreshRow(r); });
    });
    const all = table.querySelector('[data-select-all]');
    const sync = () => {
      const n = tbody.querySelectorAll('input[type=checkbox]:checked').length;
      wrap.querySelectorAll('[data-needs-selection]').forEach((b) => (b.disabled = !n));
      tbody.querySelectorAll('tr').forEach((r) => r.classList.toggle('selected', r.querySelector('input')?.checked));
    };
    all?.addEventListener('change', () => { tbody.querySelectorAll('input[type=checkbox]').forEach((c) => (c.checked = all.checked)); sync(); });
    tbody.addEventListener('change', sync);
  });
})();
