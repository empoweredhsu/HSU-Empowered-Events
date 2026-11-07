// Public site: anyone can browse events, updates and photos without logging in.

const view = document.getElementById('view');
const S = { settings: { ...DEFAULT_SETTINGS }, events: null, updates: null };
let gallery = [];

async function load() {
  if (!sb) { view.innerHTML = setupNotice(); return; }
  view.innerHTML = '<p class="wrap block muted">Loading…</p>';
  S.settings = await loadSettings();
  applyShellSettings();
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('[data-nav]').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === page || (page === 'e' && a.dataset.nav === 'events')));
  if (page === 'events') renderEvents();
  else if (page === 'e' && id) renderEvent(id);
  else if (page === 'updates') renderUpdates();
  else if (page === 'about') renderAbout();
  else renderHome();
  window.scrollTo(0, 0);
}

/* ---------- data ---------- */

async function getEvents() {
  if (S.events) return S.events;
  const { data, error } = await sb.from('events').select('*, event_photos(id, file_path, sort_order)')
    .eq('is_published', true).order('start_date', { ascending: false });
  if (error) throw error;
  return (S.events = data);
}

async function getUpdates() {
  if (S.updates) return S.updates;
  const { data, error } = await sb.from('event_updates').select('*, events(id, title)')
    .eq('is_published', true).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (S.updates = data);
}

/* ---------- pieces ---------- */

function applyShellSettings() {
  document.querySelectorAll('[data-set]').forEach(el => { const v = S.settings[el.dataset.set]; if (v) el.textContent = v; });
  const links = [['Facebook', S.settings.facebook_url], ['Instagram', S.settings.instagram_url]]
    .map(([n, u]) => safeUrl(u) ? `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${n}</a>` : '').filter(Boolean);
  document.getElementById('social').innerHTML = links.join('');
}

function siteName() { return S.settings.brand_name || 'HSU Events'; }

function errorBlock(err) {
  return `<div class="wrap block"><p class="error-text">Couldn't load events: ${esc(err.message || err)}. Refresh the page to try again.</p></div>`;
}

function dateBlock(e, cls = 'date-block') {
  const p = dateParts(e.start_date);
  if (!p) return '';
  const multi = e.end_date && e.end_date !== e.start_date;
  return `<span class="${cls}" aria-hidden="true"><span class="d">${p.d}${multi ? '<span class="plus">+</span>' : ''}</span><span class="m">${p.m}</span><span class="y">${p.y}</span></span>`;
}

function cover(e) {
  const first = e.cover_path || (e.event_photos || []).slice().sort((a, b) => a.sort_order - b.sort_order)[0]?.file_path;
  return first ? fileUrl(first) : null;
}

function eventRow(e) {
  const c = cover(e);
  const facts = [e.time_text, e.venue].filter(Boolean).map(esc).join('<span class="dot-sep" aria-hidden="true"></span>');
  const n = (e.event_photos || []).length;
  return `<li><a class="ev-row" href="#/e/${e.id}">
    ${dateBlock(e)}
    <span class="ev-text">
      <span class="ev-title">${esc(e.title)}</span>
      <span class="sr-only">${dateRange(e)}. </span>
      <span class="ev-meta"><span class="tag">${esc(e.category)}</span>${isToday(e) ? '<span class="tag today">Today</span>' : ''}${facts ? `<span class="ev-facts">${facts}</span>` : ''}</span>
      ${e.summary ? `<span class="ev-sum">${esc(e.summary)}</span>` : ''}
      ${n ? `<span class="ev-photos">${plural(n, 'photo')}</span>` : ''}
    </span>
    ${c ? `<img class="ev-cover" src="${esc(c)}" alt="" loading="lazy">` : ''}
  </a></li>`;
}

function updateItem(u, showEvent = true) {
  return `<li class="upd${u.is_pinned ? ' pinned' : ''}">
    <div class="upd-head">
      <h3>${esc(u.title)}</h3>
      <span class="upd-time">${u.is_pinned ? '<span class="tag pin">Pinned</span>' : ''}${timeAgo(u.created_at)}</span>
    </div>
    ${u.body ? `<div class="upd-body">${richText(u.body)}</div>` : ''}
    ${showEvent && u.events ? `<a class="upd-ev" href="#/e/${u.events.id}">About: ${esc(u.events.title)}</a>` : ''}
  </li>`;
}

function countdown(e) {
  if (isToday(e)) return 'Happening today';
  const days = Math.round((new Date(e.start_date + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000);
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

/* ---------- pages ---------- */

async function renderHome() {
  document.title = `${siteName()} | ${S.settings.brand_sub || ''}`;
  let events, updates;
  try { [events, updates] = await Promise.all([getEvents(), getUpdates()]); }
  catch (err) { view.innerHTML = errorBlock(err); return; }
  if (location.hash.replace(/^#\/?/, '')) return;

  const up = events.filter(isUpcoming).reverse();
  const past = events.filter(e => !isUpcoming(e));
  const next = up[0];
  const st = S.settings;
  const side = next
    ? `<a class="next-card" href="#/e/${next.id}">
        <span class="next-label">${countdown(next)}</span>
        ${dateBlock(next, 'date-block big')}
        <span class="next-title">${esc(next.title)}</span>
        <span class="next-facts">${esc([next.time_text, next.venue].filter(Boolean).join(', ')) || esc(next.category)}</span>
        <span class="next-go">See details</span>
      </a>`
    : `<img class="hero-img" src="${esc(st.hero_image_path ? fileUrl(st.hero_image_path) : 'assets/quill.webp')}" alt="">`;

  view.innerHTML = `
    <section class="hero">
      ${mandalaSVG('m-tl')}${mandalaSVG('m-br')}
      <div class="wrap hero-in">
        <div class="hero-marks">
          <img src="assets/hsu-logo.png" alt="Hindu Student Union logo" width="200" height="275">
          <img src="assets/uop-logo.png" alt="University of Peradeniya logo" width="150" height="150">
        </div>
        <img class="hero-title-img" src="assets/title-ta.webp" alt="இந்து மாணவர் சங்கம், பேராதனைப் பல்கலைக்கழகம்" width="1400" height="275">
        <div class="hero-grid">
          <div>
            <h1>${esc(st.hero_title)}</h1>
            ${st.hero_text ? `<p class="lede">${esc(st.hero_text)}</p>` : ''}
            <p class="row"><a class="btn primary" href="#/events">All events</a>${updates.length ? '<a class="btn ghost" href="#/updates">Latest updates</a>' : ''}</p>
          </div>
          ${side}
        </div>
      </div>
    </section>
    ${updates.length ? `<section class="wrap block">
      <div class="sec-row"><h2>Latest updates</h2><a class="btn small" href="#/updates">All updates</a></div>
      <ul class="upd-list">${updates.slice(0, 3).map(u => updateItem(u)).join('')}</ul>
    </section>` : ''}
    <section class="wrap block">
      <div class="sec-row"><h2>Coming up</h2>${events.length ? '<a class="btn small" href="#/events">All events</a>' : ''}</div>
      ${up.length ? `<ul class="ev-list">${up.slice(0, 6).map(eventRow).join('')}</ul>` : '<p class="empty">No events announced right now. New events appear here as soon as the committee adds them.</p>'}
    </section>
    ${past.length ? `<section class="wrap block">
      <div class="sec-row"><h2>Recent events</h2><a class="btn small" href="#/events">See all past events</a></div>
      <ul class="ev-grid">${past.slice(0, 6).map(evTile).join('')}</ul>
    </section>` : ''}
    ${st.quote ? `<section class="verse">${mandalaSVG('m-verse')}<img class="verse-quill" src="assets/quill.webp" alt="" width="900" height="832" loading="lazy"><div class="wrap"><blockquote lang="ta">${st.quote.split('\n').map(l => `<span>${esc(l)}</span>`).join('')}</blockquote></div></section>` : ''}`;
}

function evTile(e) {
  const c = cover(e);
  const n = (e.event_photos || []).length;
  return `<li><a class="ev-tile" href="#/e/${e.id}">
    <span class="tile-img">${c ? `<img src="${esc(c)}" alt="" loading="lazy">` : mandalaSVG()}</span>
    <span class="tile-text">
      <span class="tile-date">${dateRange(e)}</span>
      <span class="ev-title">${esc(e.title)}</span>
      <span class="ev-photos">${esc(e.category)}${n ? `, ${plural(n, 'photo')}` : ''}</span>
    </span>
  </a></li>`;
}

async function renderEvents() {
  document.title = `Events | ${siteName()}`;
  view.innerHTML = `
    <section class="cat-head"><div class="wrap">
      <h1>Events</h1>
      <p class="lede">Every event the union runs. Open one for details, updates and photos.</p>
      <div class="filters" id="filters"></div>
    </div></section>
    <div class="wrap" id="evBody"><p class="muted pad">Loading…</p></div>`;
  let events;
  try { events = await getEvents(); } catch (err) { view.innerHTML = errorBlock(err); return; }
  if (location.hash !== '#/events') return;

  const state = { cat: 'all', year: '' };
  const cats = CATEGORIES.filter(c => events.some(e => e.category === c)).concat([...new Set(events.map(e => e.category))].filter(c => !CATEGORIES.includes(c)));
  const years = [...new Set(events.map(e => e.start_date.slice(0, 4)))].sort().reverse();
  const filters = document.getElementById('filters');
  if (cats.length > 1 || years.length > 1) {
    filters.innerHTML = `
      ${cats.length > 1 ? `<div class="chips" role="group" aria-label="Type of event">
        <button class="chip" type="button" data-cat="all" aria-pressed="true">All</button>
        ${cats.map(c => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}
      </div>` : ''}
      ${years.length > 1 ? `<label class="medium-select">Year <select id="yearSel"><option value="">All years</option>${years.map(y => `<option>${y}</option>`).join('')}</select></label>` : ''}`;
    filters.addEventListener('click', ev => {
      const b = ev.target.closest('[data-cat]');
      if (!b) return;
      state.cat = b.dataset.cat;
      filters.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    });
    const ys = document.getElementById('yearSel');
    if (ys) ys.addEventListener('change', () => { state.year = ys.value; draw(); });
  }

  function draw() {
    const shown = events.filter(e => (state.cat === 'all' || e.category === state.cat) && (!state.year || e.start_date.startsWith(state.year)));
    const up = shown.filter(isUpcoming).reverse();
    const past = shown.filter(e => !isUpcoming(e));
    document.getElementById('evBody').innerHTML = `
      <section class="block"><h2>Upcoming</h2>
        ${up.length ? `<ul class="ev-list">${up.map(eventRow).join('')}</ul>` : '<p class="empty">No upcoming events here yet.</p>'}
      </section>
      <section class="block"><h2>Past events</h2>
        ${past.length ? `<ul class="ev-grid">${past.map(evTile).join('')}</ul>` : '<p class="empty">Past events and their photos appear here.</p>'}
      </section>`;
  }
  draw();
}

async function renderEvent(id) {
  view.innerHTML = '<p class="wrap block muted">Loading…</p>';
  const [{ data: e, error }, upd] = await Promise.all([
    sb.from('events').select('*, event_photos(id, file_path, sort_order)').eq('id', id).eq('is_published', true).maybeSingle(),
    sb.from('event_updates').select('*').eq('event_id', id).eq('is_published', true).order('created_at', { ascending: false }),
  ]);
  if (location.hash !== `#/e/${id}`) return;
  if (error || !e) {
    view.innerHTML = `<div class="wrap block"><h1>This event isn't available</h1><p>It may have been removed. <a href="#/events">See all events</a>.</p></div>`;
    return;
  }
  document.title = `${e.title} | ${siteName()}`;
  gallery = (e.event_photos || []).slice().sort((a, b) => a.sort_order - b.sort_order).map(p => fileUrl(p.file_path));
  const c = e.cover_path ? fileUrl(e.cover_path) : null;
  const upcoming = isUpcoming(e);
  const reg = safeUrl(e.register_url);
  const yt = e.video_url ? youtubeId(e.video_url) : null;
  const facts = [['Date', dateRange(e)], e.time_text && ['Time', e.time_text], e.venue && ['Venue', e.venue], ['Type', e.category]].filter(Boolean);
  const updates = upd.data || [];

  view.innerHTML = `
    <section class="ev-head${c ? ' has-cover' : ''}">
      ${c ? `<img class="ev-banner" src="${esc(c)}" alt="">` : ''}
      <div class="wrap ev-head-in">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#/events">Events</a><span aria-current="page">${esc(e.title)}</span></nav>
        ${upcoming ? `<p class="status-tag">${countdown(e)}</p>` : ''}
        <h1>${esc(e.title)}</h1>
        ${e.summary ? `<p class="lede">${esc(e.summary)}</p>` : ''}
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <p class="row">
          ${upcoming && reg ? `<a class="btn primary" href="${esc(reg)}" target="_blank" rel="noopener">Register</a>` : ''}
          ${upcoming ? '<button class="btn" type="button" id="icsBtn">Add to calendar</button>' : ''}
          <button class="btn" type="button" id="shareBtn">Share</button>
        </p>
      </div>
    </section>
    <div class="wrap">
      ${updates.length ? `<section class="block"><h2>Updates</h2><ul class="upd-list">${updates.map(u => updateItem(u, false)).join('')}</ul></section>` : ''}
      ${e.description ? `<section class="block prose">${richText(e.description)}</section>` : ''}
      ${yt ? `<section class="block"><h2>Video</h2><div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0" title="${esc(e.title)} video" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div></section>` : ''}
      <section class="block">
        <h2>Photos</h2>
        ${gallery.length ? `<ul class="gallery">${gallery.map((u, i) => `<li><button type="button" data-photo="${i}" aria-label="Open photo ${i + 1} of ${gallery.length}"><img src="${esc(u)}" alt="" loading="lazy"></button></li>`).join('')}</ul>`
          : `<p class="empty">${upcoming ? 'Photos will be added after the event.' : 'No photos from this event yet.'}</p>`}
      </section>
    </div>`;

  const ics = document.getElementById('icsBtn');
  if (ics) ics.addEventListener('click', () => downloadICS(e));
  document.getElementById('shareBtn').addEventListener('click', async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: e.title, text: `${e.title}, ${dateRange(e)}`, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied'); }
    } catch { /* closed the share sheet */ }
  });
}

function downloadICS(e) {
  const d = s => s.replace(/-/g, '');
  const end = new Date((e.end_date || e.start_date) + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 1);
  const icsEsc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HSU Peradeniya//Events//EN', 'BEGIN:VEVENT',
    `UID:${e.id}@hsu-events`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d(e.start_date)}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`,
    `SUMMARY:${icsEsc(e.title)}`, e.venue ? `LOCATION:${icsEsc(e.venue)}` : '',
    `DESCRIPTION:${icsEsc([e.time_text, e.summary, location.href].filter(Boolean).join('\n'))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  a.download = e.title.replace(/[^\w]+/g, '-').slice(0, 60) + '.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function renderUpdates() {
  document.title = `Updates | ${siteName()}`;
  view.innerHTML = `
    <section class="cat-head"><div class="wrap"><h1>Updates</h1><p class="lede">News and changes from the committee, newest first.</p></div></section>
    <div class="wrap block" id="updBody"><p class="muted">Loading…</p></div>`;
  let updates;
  try { updates = await getUpdates(); } catch (err) { view.innerHTML = errorBlock(err); return; }
  const box = document.getElementById('updBody');
  if (!box) return;
  box.innerHTML = updates.length ? `<ul class="upd-list">${updates.map(u => updateItem(u)).join('')}</ul>` : '<p class="empty">No updates yet.</p>';
}

function renderAbout() {
  const st = S.settings;
  document.title = `About | ${siteName()}`;
  view.innerHTML = `
    <section class="cat-head"><div class="wrap"><h1>${esc(st.about_title)}</h1></div></section>
    <div class="wrap block prose">
      ${richText(st.about_body)}
      ${st.contact_email ? `<h2>Contact us</h2><p>Questions about an event? Email <a href="mailto:${esc(st.contact_email)}">${esc(st.contact_email)}</a>.</p>` : ''}
    </div>`;
}

/* ---------- photo viewer ---------- */

const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lbImg');
let lbIndex = 0;
function showPhoto(i) {
  if (!gallery.length) return;
  lbIndex = (i + gallery.length) % gallery.length;
  lbImg.src = gallery[lbIndex];
  lbImg.alt = `Photo ${lbIndex + 1} of ${gallery.length}`;
  document.getElementById('lbCount').textContent = `${lbIndex + 1} / ${gallery.length}`;
  document.getElementById('lbPrev').disabled = document.getElementById('lbNext').disabled = gallery.length < 2;
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-photo]');
  if (!b) return;
  showPhoto(+b.dataset.photo);
  lb.showModal();
});
document.getElementById('lbPrev').addEventListener('click', () => showPhoto(lbIndex - 1));
document.getElementById('lbNext').addEventListener('click', () => showPhoto(lbIndex + 1));
document.getElementById('lbClose').addEventListener('click', () => lb.close());
lb.addEventListener('click', ev => { if (ev.target === lb) lb.close(); });
lb.addEventListener('keydown', ev => {
  if (ev.key === 'ArrowLeft') showPhoto(lbIndex - 1);
  if (ev.key === 'ArrowRight') showPhoto(lbIndex + 1);
});

load();
