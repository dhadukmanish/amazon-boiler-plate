# Pratishtha Bridal: bridal rental + bridal salon

Plain HTML / CSS / JS (no build step). Works in two modes:

| Mode | When | Data |
|---|---|---|
| **Demo** | `js/config.js` is empty (default) | Sample data, kept only in your browser. Switch role from the user menu to try Owner / Counter staff / Stock keeper. |
| **Live** | `js/config.js` has your Supabase URL + anon key | Login, shared database, double-booking blocked by the database. Setup: **[SUPABASE.md](SUPABASE.md)** |

## Run
```bash
npx serve . -l 5173      # then open http://localhost:5173/login.html
```

## Pages
| Page | Purpose |
|---|---|
| `login.html` | Sign in (live) / choose a role (demo) |
| `index.html` | Today's pickups and returns, overdue, pending money |
| `calendar.html` | Timeline (piece × day): drag free days to start a booking. Month view with a day panel |
| `weddings.html`, `wedding.html?id=` | **Bridal salon planning.** One wedding = functions with artists, salon services and package, linked rented outfits, payments, checklist, quotation / invoice |
| `salon.html` | Salon schedule: functions day by day, artist workload, one-click artist assignment (busy artists greyed out) |
| `bookings.html` | All bookings: list + Kanban, hand over, return, WhatsApp |
| `booking-new.html` | New booking: finds the customer by mobile, blocks clashes, suggests the advance |
| `booking.html?id=` | One booking: payments, settlement, comments and activity |
| `return.html` | Receive a return: condition checklist, photos, late fee, deposit settlement |
| `inventory.html`, `outfit.html?id=` | Pieces with photos, status, 14-day availability, full booking history |
| `customers.html`, `customer.html?id=` | Customers, balance, deposit held, history, notes |
| `payments.html` | Receipts, pending balances, deposits held, refunds |
| `reports.html` | Revenue, utilisation, late returns, payment modes, top pieces, CSV export |
| `tags.html` | Print piece tags (QR + barcode). `slip.html` prints booking slips and return receipts |
| `settings.html` | Shop details, rental rules, slip terms, WhatsApp messages, **users, roles & permissions matrix, activity log** |

## How it is organised
```
js/config.js   the two connection values
js/data.js     data model: RR.setData(raw) builds every list the pages use (bookings, customers, dues, history)
js/api.js      the ONLY file that talks to a server: demo back end + Supabase back end, same methods
js/shell.js    top bar, role-aware menu, Ctrl+K search, scan dialog, shared popups (RR.ui)
js/app.js      small behaviours: tabs, filters, sorting, toasts, Ctrl+S
js/codes.js    Code 128 barcode + QR helper
css/           tokens (colours, sizes), layout, components, rental-specific styles
supabase/      schema.sql, storage.sql, seed.sql (+ make-seed.js) and tests/
```
Every page waits for `RR.ready` (signed in + data loaded) and re-renders on the `rr:data` event, so a change made on one screen shows everywhere.

## Piece numbers, search and scanning
- Every outfit has a **unique number** (the number on its tag). **Ctrl+K**, then type `1014`: photo, status and the full booking history. Also searches names, customers, phones and booking ids.
- **Handheld scanner:** works on any page (it types digits + Enter). **Camera:** scan icon in the top bar (Chrome / Edge / Android, needs https).
- **Photos:** pieces without a photo show a generated design drawing. Upload real photos in *Inventory → Add / Edit* (shrunk in the browser first).

## Roles and permissions
Three roles, 24 permissions, all editable by the owner (Settings → Roles & permissions). Every page, menu item and button checks `RR.api.has('permission')`; the database enforces the same rules. Full table and safety rules: **SUPABASE.md**.

## Safety notes
- All names and notes are escaped before display; CSV export neutralises formula characters.
- Only the Supabase **anon** key belongs in `js/config.js`. The database rules (RLS + role checks in the SQL functions) are what protect data, not the hidden buttons.
- Test the database rules any time: see the end of SUPABASE.md.

## Rebranding
Colours, fonts and spacing are CSS variables at the top of `css/tokens.css`. Dark mode and compact density are built in (top bar buttons).
