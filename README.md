# HSU Events – Hindu Student Union, University of Peradeniya

A website for the union's empowerment programmes: A/L seminars, skills workshops, career guidance, leadership training, awareness programmes and community service. Each event has its date, time, venue, details, a registration link, a YouTube video, updates and a photo gallery.

Students open the site and browse without logging in. Committee admins sign in at `/admin.html` to manage everything.

**Frontend:** plain HTML, CSS and JavaScript (no build step), hosted free on GitHub Pages.
**Backend:** Supabase (database, admin login, photo storage) on the free plan. It can share the resource centre's Supabase project.

## What it does

Public site (`index.html`):
- Home page: the next event in a big card with a countdown ("In 3 days", "Tomorrow", "Happening today"), latest updates, coming-up events and recent past events with photos.
- Events page: upcoming and past events, filter by type and year.
- Event page: date (one day or several), time, venue, type, details, Register button, Add to calendar, Share, video, updates about the event and a photo gallery with a full-screen viewer.
- Updates page: short news from the committee, pinned ones first.
- About page, contact email, Facebook and Instagram links.
- An event moves from "Upcoming" to "Past" by itself the day after its last day.

Admin panel (`admin.html`):
- Events: add, edit, hide or delete; cover photo; add many photos at once (resized in the browser before upload); filter by upcoming, past and hidden.
- Updates: post, pin, hide, edit or delete; link an update to an event.
- Site text and picture: site name, home page title and text, home picture, About page, contact email, social links, footer note.

## Folder layout

```
index.html          public website
admin.html          admin panel
css/style.css       all styles (colours at the top)
js/config.js        Supabase URL and key
js/common.js        shared helpers
js/app.js           public site logic
js/admin.js         admin logic
supabase/schema.sql database tables, security rules and photo bucket
assets/             HSU and university logos, favicon
```

## Setup

### 1. Database
Open your Supabase project (the resource centre's project is fine) → **SQL Editor → New query**, paste the whole of `supabase/schema.sql` and click **Run**.

- **Same project as the resource centre:** that's all. Your existing admin accounts work here too, and `js/config.js` already has this project's URL and key.
- **New Supabase project:** paste its Project URL and anon / publishable key into `js/config.js`, then create your admin account: **Authentication → Users → Add user** (tick **Auto confirm user**), then in the SQL Editor run
  ```sql
  insert into public.admins (user_id)
  select id from auth.users where email = 'you@example.com';
  ```
  and turn **off** "Allow new users to sign up" in the Authentication settings.

### 2. GitHub Pages
1. On GitHub create a new **public** repository, for example `hsu-events`.
2. Click **Add file → Upload files**, drag in everything inside this folder (index.html, admin.html, css, js, assets, supabase, README.md) and click **Commit changes**.
3. **Settings → Pages → Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/hsu-events/`; the admin panel is at `.../hsu-events/admin.html`.

### 3. First content
Sign in at `admin.html`, open **Site text and picture** and check the names, then click **Events → New event**.

## Good to know

- **Free plan limits:** 1 GB of storage. Photos are resized to about 300–500 KB each before upload, so that's roughly 2,000 photos (shared with the resource centre's files if you use one project).
- **Pausing:** Supabase may pause free projects after a long time with no activity. If that happens, open the dashboard and click **Restore**.
- **Hidden events:** untick "Show on the public site" to prepare an event before announcing it.
- **Event types:** the list is at the top of `js/common.js` (`CATEGORIES`) if you want to add or rename types.
