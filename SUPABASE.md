# Going live with Supabase (login + shared database)

For **Pratishtha Bridal**: bridal rental + bridal salon in one app.

Until you do this the app runs in **demo mode**: sample data, saved only in your own browser. Nothing here needs a server of your own; a free Supabase project is enough to start.

## What you get
- **Login** (email + password), three roles (Owner, Counter staff, Stock keeper) built from 24 fine-grained permissions that **the owner can change**.
- **One shared database**: every counter sees the same bookings, payments and stock.
- **Double-booking is impossible**, even if two people book the same piece at the same second. The database itself refuses overlapping dates (and keeps the day after a return free for cleaning).
- Deposit settlement, hand-over, payments, cancellations and customer changes are saved by database functions that check the role and keep the numbers consistent. There is an audit log.
- Photos: piece photos (public) and return/damage photos (private) in Supabase Storage.

## Setup (about 15 minutes)
1. **Create a project** at supabase.com. Choose the Mumbai region (`ap-south-1`) for speed in India. Save the database password somewhere safe.
2. **Run the SQL.** In the dashboard open *SQL Editor* and run these files, in this order (paste each file's content, press Run):
   1. `supabase/schema.sql`  (tables, rules, functions)
   2. `supabase/storage.sql`  (photo storage)
   3. `supabase/seed.sql`  *(optional demo data; skip it for a real shop)*
3. **Create the owner.** *Authentication → Users → Add user → Create new user*: enter your email + a strong password and tick **Auto Confirm User**. The **first user ever created becomes the Owner** automatically.
4. **Turn off public sign-up.** *Authentication → Providers → Email → untick "Allow new users to sign up"* and save. From now on only you can add people. **Do not skip this**: otherwise anyone who finds the address could create an account.
5. **Connect the app.** *Project Settings → API*: copy the **Project URL** and the **anon public** key into `js/config.js`:
   ```js
   window.RR_CONFIG = { supabaseUrl: 'https://xxxx.supabase.co', supabaseAnonKey: 'eyJ...' };
   ```
   Only the *anon* key goes there (it is designed to be public; the database rules protect the data). **Never** paste the `service_role` key anywhere in this project.
6. **Open `login.html`** and sign in with the owner account.
7. **Add your team.** *Authentication → Users → Add user* (tick Auto Confirm). They appear in **Settings → Users** as *Counter staff*. Change their role there, and adjust what each role may do in **Settings → Roles & permissions**.

## Putting it online
The app is plain files, so any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages). Use **https**: phone/tablet camera scanning and some browser features only work on https. Upload the whole folder (you can leave out `supabase/`, it is only for setup).

## Roles and permissions
Every action in the app is one **permission** (24 of them, grouped as Overview, Bookings, Money, Customers, Weddings, Inventory, Admin). A **role** is just a named bundle of permissions, and **the owner edits the bundles** in *Settings → Roles & permissions*: tick or untick a permission for Counter staff or Stock keeper, review the summary, save. The owner role always has everything and cannot be edited or locked out.

Starting point (what the owner can change):
| Permission | Owner | Counter staff | Stock keeper |
|---|:-:|:-:|:-:|
| See the dashboard | ✓ | ✓ | |
| See the calendar | ✓ | ✓ | ✓ (availability only) |
| See bookings (rent, deposit, customer names) | ✓ | ✓ | |
| Create a booking | ✓ | ✓ | |
| Hand over an outfit | ✓ | ✓ | |
| Receive a return | ✓ | ✓ | |
| Cancel a booking | ✓ | ✓ | |
| See payments | ✓ | ✓ | |
| Take a payment | ✓ | ✓ | |
| Charge more late fee than the daily rate | ✓ | | |
| See customers | ✓ | ✓ | |
| Add and edit customers | ✓ | ✓ | |
| See weddings (bridal salon planning) | ✓ | ✓ | |
| Create and edit weddings | ✓ | ✓ | |
| Take wedding payments | ✓ | ✓ | |
| Manage artists and service prices | ✓ | | |
| See inventory | ✓ | ✓ | ✓ |
| Add and edit outfits (rent, deposit, photo) | ✓ | | ✓ |
| Mark cleaning, repair or ready | ✓ | ✓ | ✓ |
| Print piece tags | ✓ | ✓ | ✓ |
| See reports | ✓ | | |
| Change shop settings | ✓ | | |
| Manage users and permissions | ✓ | | |
| See the activity log | ✓ | | |

**In the app**
- Menus, buttons and pages appear only when the person holds the permission. A page they cannot open says which permission it needs.
- *User menu → What can I do here?* shows anyone their own access, so nobody has to guess why a button is missing.
- *Settings → Users* lists everyone with their role and an on/off switch. Changing a role or switching someone off first shows what they will gain and lose. *View* shows one person's full access.
- *Settings → Activity log* shows who did what and when.

**Safety rules (enforced by the database)**
- Nothing is ever protected only by hiding a button. The database decides who can read each table and run each action.
- People without "See bookings" never receive rents, deposits or customer names. The calendar and inventory use a dates-and-status-only view for them.
- People with "See bookings" but not "See payments" still see correct paid totals and balances, just not the individual receipts.
- Only an owner can create or change an owner. The last active owner can never be removed. Nobody can change their own role or switch themselves off.
- A delegated manager (someone given "Manage users") can only hand out permissions they hold themselves, and can never give "Manage users" to others.
- Switching a person off locks them out everywhere at once.

## Weddings: bridal salon + rented outfits together
One **wedding** is one bride's booking. It holds:
- her **functions** (trial, engagement, haldi, mehendi, sangeet, wedding day, reception...) each with date, time, venue, number of people and the **artist** who will do it;
- the **salon services** sold to her (picked from your price list or typed in), with a discount;
- her **rented outfits**: book them from the wedding page and they stay linked to her;
- **payments** (advance and instalments) and a **checklist** (trial done, outfit finalised, advance received...);
- a printable **quotation** (while it is an enquiry) or **invoice** (once confirmed).

**An artist can never be double-booked.** The database refuses two functions for the same artist whose times overlap (a function that starts exactly when the previous one ends is fine). Functions without a time or without an artist are never blocked, but the Salon schedule highlights the ones with no artist.

The **Salon schedule** page shows the next days function by function with each artist's workload, and lets you assign an artist in one click (busy artists are greyed out). Artists and the price list are managed in *Settings → Salon: artists & prices* (needs "Manage artists and service prices"). Terms for quotations are in *Settings → Payments & slips*.

## Good to know
- **Timezone** is Asia/Kolkata (`shop_today()` in `schema.sql`). Change it there if the shop is elsewhere.
- **Cleaning buffer** is one day after every return (the `block_range` column in `bookings`).
- **Amounts of data:** the screens load all records (in pages of 1000). That is comfortable up to a few thousand bookings. For a much bigger shop the next step is server-side search and paging.
- **Live updates:** a second counter sees your change after refreshing or opening the next page (no live push yet).
- **Backups:** the free Supabase plan has no automatic backups. Export from time to time (*Database → Backups* on paid plans, or `pg_dump`). Photos live in Storage.
- **Forgot password:** the owner resets it in *Authentication → Users*.
- **Audit log:** every booking, hand-over, return, payment and customer change is written to `audit_log` (owner only). View it with the SQL editor: `select * from audit_log order by at desc;`
- Return/damage photos are saved after the return is recorded; if an upload fails the return itself is still saved.

## Changing the database later
Edit `schema.sql`, then re-run the checks (they use an in-memory Postgres, nothing to set up on Supabase):
```bash
cd supabase/tests
npm install
npm test
```
The tests cover double booking, the cleaning buffer, hand-over, deposit settlement (refund and customer-pays cases), late-fee limits, every role's permissions and the demo seed. To regenerate `seed.sql` from the sample data in `js/data.js`: `node supabase/make-seed.js`.
