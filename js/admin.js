// Admin panel: events with photos, updates, and site text.

const $ = s => document.querySelector(s);
const A = {
  view: localStorage.getItem('hsuev.view') || 'events',
  events: [],
  updates: [],
  filter: 'all',          // all | upcoming | past | hidden
  editing: null,          // event being edited
  photos: [],             // [{id?, file_path?, file?, url}]
  removed: [],
  cover: undefined,       // undefined = unchanged, null = remove, File = new
  editingUpd: null,
  settingsImage: null,
  pendingImage: undefined,
};

/* ---------------- auth ---------------- */

function showLogin(msg = '', isError = true) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#loginMsg').textContent = msg;
  $('#loginMsg').classList.toggle('error', Boolean(msg) && isError);
}

async function boot() {
  if (!sb) {
    showLogin('Add your Supabase URL and key to js/config.js first.');
    $('#loginForm button').disabled = true;
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) enter(session.user); else showLogin();
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  const { data, error } = await sb.auth.signInWithPassword({ email: f.elements.email.value.trim(), password: f.elements.password.value });
  btn.disabled = false;
  btn.textContent = 'Sign in';
  if (error) { showLogin(error.message === 'Invalid login credentials' ? 'Email or password is wrong.' : error.message); return; }
  enter(data.user);
});

async function enter(user) {
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || !ok) {
    await sb.auth.signOut();
    showLogin('This account is not an admin. Ask the site owner to add your email to the admins table.');
    return;
  }
  $('#who').textContent = user.email;
  $('#login').hidden = true;
  $('#app').hidden = false;
  show(A.view);
}

$('#logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  showLogin('You have signed out.', false);
});

/* ---------------- navigation ---------------- */

function show(v) {
  A.view = v;
  localStorage.setItem('hsuev.view', v);
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'updates') renderUpdates();
  else if (v === 'settings') renderSettings();
  else renderEvents();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

/* ---------------- events list ---------------- */

async function loadEvents() {
  const { data, error } = await sb.from('events').select('*, event_photos(id, file_path, sort_order)').order('start_date', { ascending: false });
  if (error) throw error;
  A.events = data;
  return data;
}

async function renderEvents() {
  const panel = $('#panel');
  panel.innerHTML = '<p class="muted">Loading…</p>';
  try { await loadEvents(); }
  catch (err) {
    panel.innerHTML = `<h1>Events</h1><p class="error-text">Couldn't load events: ${esc(err.message)}</p>
      <p>If this is a new setup, run <code>supabase/schema.sql</code> once in the Supabase SQL Editor, then reload this page.</p>`;
    return;
  }
  if (A.view !== 'events') return;
  const ev = A.events;
  const groups = {
    all: ev,
    upcoming: ev.filter(e => e.is_published && isUpcoming(e)),
    past: ev.filter(e => e.is_published && !isUpcoming(e)),
    hidden: ev.filter(e => !e.is_published),
  };
  const labels = { all: 'All', upcoming: 'Upcoming', past: 'Past', hidden: 'Hidden' };
  const list = groups[A.filter] || ev;
  const photos = ev.reduce((n, e) => n + (e.event_photos || []).length, 0);

  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h1>Events</h1>
        <p class="muted">${plural(ev.length, 'event')}, ${plural(photos, 'photo')}. An event moves to “Past” by itself the day after its last day.</p>
      </div>
      <button class="btn primary" type="button" data-act="add-ev">New event</button>
    </div>
    <div class="chips filter-row" role="group" aria-label="Show">
      ${Object.keys(groups).map(k => `<button class="chip" type="button" data-filter="${k}" aria-pressed="${A.filter === k}">${labels[k]} (${groups[k].length})</button>`).join('')}
    </div>
    <section class="sec">
      ${list.length ? `<ul class="items">${list.map(e => {
        const p = dateParts(e.start_date);
        const n = (e.event_photos || []).length;
        return `<li class="item">
          <span class="item-icon ev-mini">${p ? `<b>${p.d}</b><small>${p.m}</small>` : ''}</span>
          <div class="item-main">
            <a class="item-title" href="index.html#/e/${e.id}" target="_blank" rel="noopener">${esc(e.title)}</a>
            <span class="res-meta">
              <span class="tag">${esc(dateRange(e))}</span>
              <span class="tag">${esc(e.category)}</span>
              <span class="tag">${isUpcoming(e) ? 'Upcoming' : 'Past'}</span>
              <span class="tag">${plural(n, 'photo')}</span>
              ${e.is_published ? '' : '<span class="tag hidden-tag">Hidden</span>'}
            </span>
          </div>
          <div class="row tight">
            <button class="btn small" type="button" data-act="upd-for" data-id="${e.id}">Post update</button>
            <button class="btn small" type="button" data-act="edit-ev" data-id="${e.id}">Edit</button>
            <button class="btn small danger" type="button" data-act="del-ev" data-id="${e.id}">Delete</button>
          </div>
        </li>`;
      }).join('')}</ul>` : `<p class="empty">${ev.length ? 'No events in this group.' : 'No events yet. Add your first event with its date; after the event, open it again to add photos.'}</p>`}
    </section>`;
}

/* ---------------- actions ---------------- */

document.addEventListener('click', e => {
  const f = e.target.closest('#panel [data-filter]');
  if (f) { A.filter = f.dataset.filter; renderEvents(); return; }
  const b = e.target.closest('#panel [data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'add-ev': openEventDialog(null); break;
    case 'edit-ev': openEventDialog(A.events.find(x => x.id === id)); break;
    case 'del-ev': deleteEvent(A.events.find(x => x.id === id)); break;
    case 'upd-for': openUpdateDialog(null, id); break;
    case 'add-up': openUpdateDialog(null); break;
    case 'edit-up': openUpdateDialog(A.updates.find(x => x.id === id)); break;
    case 'del-up': deleteUpdate(A.updates.find(x => x.id === id)); break;
  }
});

async function uploadFile(file, folder) {
  const clean = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${clean}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);
  return path;
}

/* ---------------- event dialog ---------------- */

const evForm = $('#evForm');
const evEl = evForm.elements;
evEl.category.innerHTML = CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');

function evMsg(text, isError = false) {
  $('#evMsg').textContent = text;
  $('#evMsg').classList.toggle('error', isError);
}

function drawThumbs() {
  $('#evThumbs').innerHTML = A.photos.map((p, i) => `
    <div class="thumb">
      <img src="${esc(p.url)}" alt="Photo ${i + 1}">
      <button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">×</button>
    </div>`).join('');
}

function drawCover() {
  let src = null;
  if (A.cover instanceof File) src = URL.createObjectURL(A.cover);
  else if (A.cover === undefined && A.editing?.cover_path) src = fileUrl(A.editing.cover_path);
  $('#coverPrev').innerHTML = src ? `<img src="${esc(src)}" alt="Cover preview">` : '<span class="muted small">No cover</span>';
  $('#coverRemove').hidden = !src;
}

$('#evThumbs').addEventListener('click', e => {
  const b = e.target.closest('[data-rm]');
  if (!b) return;
  const [p] = A.photos.splice(+b.dataset.rm, 1);
  if (p.id) A.removed.push(p);
  drawThumbs();
});

evEl.photos.addEventListener('change', e => {
  const files = [...e.target.files].filter(f => f.type.startsWith('image/'));
  files.forEach(file => A.photos.push({ file, url: URL.createObjectURL(file) }));
  e.target.value = '';
  drawThumbs();
  if (files.length) evMsg(`${plural(files.length, 'photo')} ready. Save the event to upload.`);
});
evEl.cover.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) { A.cover = f; drawCover(); }
  e.target.value = '';
});
$('#coverRemove').addEventListener('click', () => { A.cover = null; drawCover(); });

function openEventDialog(ev) {
  A.editing = ev || null;
  evForm.reset();
  evMsg('');
  A.removed = [];
  A.cover = undefined;
  A.photos = ev ? (ev.event_photos || []).slice().sort((a, b) => a.sort_order - b.sort_order)
    .map(p => ({ id: p.id, file_path: p.file_path, url: fileUrl(p.file_path) })) : [];
  $('#evDlgTitle').textContent = ev ? `Edit “${ev.title}”` : 'New event';
  if (ev) {
    if (!CATEGORIES.includes(ev.category)) evEl.category.insertAdjacentHTML('beforeend', `<option>${esc(ev.category)}</option>`);
    ['title', 'category', 'start_date', 'end_date', 'time_text', 'venue', 'summary', 'description', 'register_url', 'video_url']
      .forEach(k => { evEl[k].value = ev[k] || ''; });
    evEl.is_published.checked = ev.is_published;
  }
  drawThumbs();
  drawCover();
  $('#evDlg').showModal();
  evEl.title.focus();
}

evForm.addEventListener('submit', async e => {
  e.preventDefault();
  const v = k => evEl[k].value.trim();
  const row = {
    title: v('title'), category: v('category') || 'Other', start_date: v('start_date'), end_date: v('end_date') || null,
    time_text: v('time_text') || null, venue: v('venue') || null, summary: v('summary') || null, description: v('description') || null,
    register_url: v('register_url') || null, video_url: v('video_url') || null, is_published: evEl.is_published.checked,
  };
  if (!row.title) { evMsg('Enter the event name.', true); evEl.title.focus(); return; }
  if (!row.start_date) { evMsg('Choose the event date.', true); evEl.start_date.focus(); return; }
  if (row.end_date && row.end_date < row.start_date) { evMsg('The last day can’t be before the first day.', true); return; }
  if (row.end_date === row.start_date) row.end_date = null;
  if (row.register_url && !safeUrl(row.register_url)) { evMsg('Enter the registration link in full, starting with https://', true); return; }
  if (row.video_url && !youtubeId(row.video_url)) { evMsg('That isn’t a YouTube video link. Copy it from the video’s Share button.', true); return; }

  const btn = $('#evSave');
  btn.disabled = true;
  try {
    let id = A.editing?.id;
    if (id) {
      const { error } = await sb.from('events').update(row).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('events').insert(row).select().single();
      if (error) throw error;
      id = data.id;
      A.editing = data;   // a retry after a failed upload updates instead of duplicating
    }

    // cover
    const oldCover = A.editing.cover_path || null;
    if (A.cover instanceof File) {
      evMsg('Uploading cover…');
      const path = await uploadFile(await shrinkImage(A.cover, 2200), `${id}/cover`);
      const { error } = await sb.from('events').update({ cover_path: path }).eq('id', id);
      if (error) { await sb.storage.from(BUCKET).remove([path]); throw error; }
      if (oldCover) await sb.storage.from(BUCKET).remove([oldCover]);
      A.editing.cover_path = path;
      A.cover = undefined;
    } else if (A.cover === null && oldCover) {
      const { error } = await sb.from('events').update({ cover_path: null }).eq('id', id);
      if (error) throw error;
      await sb.storage.from(BUCKET).remove([oldCover]);
      A.editing.cover_path = null;
      A.cover = undefined;
    }

    // removed photos
    if (A.removed.length) {
      await sb.storage.from(BUCKET).remove(A.removed.map(p => p.file_path));
      const { error } = await sb.from('event_photos').delete().in('id', A.removed.map(p => p.id));
      if (error) throw error;
      A.removed = [];
    }

    // new photos, then the order of all photos
    const fresh = A.photos.filter(p => p.file);
    let done = 0;
    for (const [i, p] of A.photos.entries()) {
      if (!p.file) continue;
      evMsg(`Uploading photo ${++done} of ${fresh.length}…`);
      const small = await shrinkImage(p.file);
      if (small.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`${p.file.name} is too large.`);
      const path = await uploadFile(small, id);
      const { data, error } = await sb.from('event_photos').insert({ event_id: id, file_path: path, sort_order: i }).select().single();
      if (error) { await sb.storage.from(BUCKET).remove([path]); throw error; }
      Object.assign(p, { id: data.id, file_path: path, file: null });
    }
    await Promise.all(A.photos.map((p, i) => sb.from('event_photos').update({ sort_order: i }).eq('id', p.id)));

    $('#evDlg').close();
    toast(fresh.length ? `Event saved with ${plural(fresh.length, 'new photo')}` : 'Event saved');
    renderEvents();
  } catch (err) {
    evMsg(err.message || String(err), true);
  } finally {
    btn.disabled = false;
  }
});

async function deleteEvent(ev) {
  if (!ev) return;
  const n = (ev.event_photos || []).length;
  if (!confirm(`Delete “${ev.title}”${n ? ` and its ${plural(n, 'photo')}` : ''}? Updates about it stay, without the link. This can't be undone.`)) return;
  const paths = (ev.event_photos || []).map(p => p.file_path).concat(ev.cover_path ? [ev.cover_path] : []);
  if (paths.length) {
    const { error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) { toast(`Couldn't delete the photos: ${error.message}`, 'error'); return; }
  }
  const { error } = await sb.from('events').delete().eq('id', ev.id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Event deleted');
  renderEvents();
}

/* ---------------- updates ---------------- */

async function renderUpdates() {
  const panel = $('#panel');
  panel.innerHTML = '<p class="muted">Loading…</p>';
  const [u] = await Promise.all([
    sb.from('event_updates').select('*, events(id, title)').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
    A.events.length ? null : loadEvents().catch(() => null),
  ]);
  if (A.view !== 'updates') return;
  if (u.error) { panel.innerHTML = `<h1>Updates</h1><p class="error-text">${esc(u.error.message)}</p>`; return; }
  A.updates = u.data;
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h1>Updates</h1>
        <p class="muted">Short news for students: a new date, a changed venue, registration closing. Pinned updates stay at the top of the home page.</p>
      </div>
      <button class="btn primary" type="button" data-act="add-up">New update</button>
    </div>
    <section class="sec">
      ${A.updates.length ? `<ul class="items">${A.updates.map(x => `
        <li class="item">
          <span class="item-icon">${x.is_pinned ? '★' : '•'}</span>
          <div class="item-main">
            <span class="item-title">${esc(x.title)}</span>
            <span class="res-meta">
              <span class="tag">${timeAgo(x.created_at)}</span>
              ${x.events ? `<span class="tag">${esc(x.events.title)}</span>` : ''}
              ${x.is_pinned ? '<span class="tag">Pinned</span>' : ''}
              ${x.is_published ? '' : '<span class="tag hidden-tag">Hidden</span>'}
            </span>
          </div>
          <div class="row tight">
            <button class="btn small" type="button" data-act="edit-up" data-id="${x.id}">Edit</button>
            <button class="btn small danger" type="button" data-act="del-up" data-id="${x.id}">Delete</button>
          </div>
        </li>`).join('')}</ul>` : '<p class="empty">No updates yet. Post one when something changes or to remind students about an event.</p>'}
    </section>`;
}

const upForm = $('#upForm');
const upEl = upForm.elements;

function openUpdateDialog(u, eventId = null) {
  A.editingUpd = u || null;
  upForm.reset();
  $('#upMsg').textContent = '';
  $('#upDlgTitle').textContent = u ? 'Edit update' : 'New update';
  $('#upSave').textContent = u ? 'Save update' : 'Post update';
  const sel = u ? u.event_id : eventId;
  upEl.event_id.innerHTML = '<option value="">Not about one event</option>' +
    A.events.map(e => `<option value="${e.id}"${e.id === sel ? ' selected' : ''}>${esc(e.title)} (${esc(dateRange(e))})</option>`).join('');
  if (u) {
    upEl.title.value = u.title;
    upEl.body.value = u.body || '';
    upEl.is_pinned.checked = u.is_pinned;
    upEl.is_published.checked = u.is_published;
  }
  $('#upDlg').showModal();
  upEl.title.focus();
}

upForm.addEventListener('submit', async e => {
  e.preventDefault();
  const row = {
    title: upEl.title.value.trim(), body: upEl.body.value.trim() || null, event_id: upEl.event_id.value || null,
    is_pinned: upEl.is_pinned.checked, is_published: upEl.is_published.checked,
  };
  if (!row.title) { $('#upMsg').textContent = 'Enter a headline.'; $('#upMsg').classList.add('error'); return; }
  const btn = $('#upSave');
  btn.disabled = true;
  const res = A.editingUpd
    ? await sb.from('event_updates').update(row).eq('id', A.editingUpd.id)
    : await sb.from('event_updates').insert(row);
  btn.disabled = false;
  if (res.error) { $('#upMsg').textContent = res.error.message; $('#upMsg').classList.add('error'); return; }
  $('#upDlg').close();
  toast(A.editingUpd ? 'Update saved' : 'Update posted');
  show('updates');
});

async function deleteUpdate(u) {
  if (!u || !confirm(`Delete the update “${u.title}”? This can't be undone.`)) return;
  const { error } = await sb.from('event_updates').delete().eq('id', u.id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Update deleted');
  renderUpdates();
}

/* ---------------- site text and picture ---------------- */

const SETTING_FIELDS = ['brand_name', 'brand_sub', 'hero_title', 'hero_text', 'quote', 'about_title', 'about_body', 'contact_email', 'facebook_url', 'instagram_url', 'footer_note'];
const MAX_IMAGE_MB = 5;

async function renderSettings() {
  const panel = $('#panel');
  panel.innerHTML = '<p class="muted">Loading…</p>';
  const { data, error } = await sb.from('events_settings').select('data').eq('id', 1).maybeSingle();
  if (A.view !== 'settings') return;
  if (error) { panel.innerHTML = `<h1>Site text and picture</h1><p class="error-text">${esc(error.message)}</p>`; return; }
  const st = { ...DEFAULT_SETTINGS, ...(data?.data || {}) };
  A.settingsImage = st.hero_image_path || null;
  A.pendingImage = undefined;

  panel.innerHTML = `
    <div class="panel-head"><div>
      <h1>Site text and picture</h1>
      <p class="muted">Change the words students see. Changes appear on the site as soon as you save.</p>
    </div></div>
    <form id="setForm" class="stack settings-form">
      <section class="sec">
        <h2>Home page</h2>
        <label>Main title <input name="hero_title" maxlength="80" required></label>
        <label>Text under the title <span class="muted">(optional)</span> <textarea name="hero_text" rows="3" maxlength="600"></textarea></label>
        <label>Verse at the bottom of the home page <span class="muted">(optional, one line per row)</span> <textarea name="quote" rows="4" maxlength="600"></textarea></label>
        <div class="hero-pic">
          <div class="hero-pic-preview" id="heroPreview"></div>
          <div>
            <p class="field-label">Picture beside the title</p>
            <p class="hint flat">Shown only when no event is coming up; otherwise the next event is shown there. A PNG with a transparent background looks best on the maroon. Max ${MAX_IMAGE_MB} MB.</p>
            <div class="row">
              <label class="btn small file-btn">Choose picture<input type="file" name="hero_image" accept="image/png,image/jpeg,image/webp" hidden></label>
              <button class="btn small" type="button" id="heroRemove">Remove picture</button>
            </div>
          </div>
        </div>
      </section>
      <section class="sec">
        <h2>About page</h2>
        <label>Title <input name="about_title" maxlength="120"></label>
        <label>Text <textarea name="about_body" rows="8"></textarea></label>
        <p class="hint">Leave a blank line to start a new paragraph. Start a line with ## and a space to make a heading.</p>
        <label>Contact email <span class="muted">(optional)</span> <input name="contact_email" type="email"></label>
      </section>
      <section class="sec">
        <h2>Top bar, footer and social links</h2>
        <div class="two">
          <label>Name <input name="brand_name" maxlength="80" required></label>
          <label>Second line <input name="brand_sub" maxlength="120"></label>
        </div>
        <label>Footer note <input name="footer_note" maxlength="200"></label>
        <div class="two">
          <label>Facebook page <span class="muted">(optional)</span> <input name="facebook_url" type="url" placeholder="https://facebook.com/…"></label>
          <label>Instagram <span class="muted">(optional)</span> <input name="instagram_url" type="url" placeholder="https://instagram.com/…"></label>
        </div>
      </section>
      <div class="save-bar">
        <p class="form-msg" id="setMsg" role="status"></p>
        <button class="btn primary" type="submit" id="setSave">Save changes</button>
      </div>
    </form>`;

  const f = $('#setForm');
  SETTING_FIELDS.forEach(k => { f.elements[k].value = st[k] ?? ''; });
  drawHeroPreview();
  f.elements.hero_image.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) { setMsg(`That picture is larger than ${MAX_IMAGE_MB} MB. Choose a smaller one.`, true); e.target.value = ''; return; }
    A.pendingImage = file;
    setMsg('New picture chosen. Save changes to put it on the site.');
    drawHeroPreview();
  });
  $('#heroRemove').addEventListener('click', () => {
    A.pendingImage = null;
    f.elements.hero_image.value = '';
    setMsg('Picture removed. Save changes to update the site.');
    drawHeroPreview();
  });
  f.addEventListener('submit', saveSettings);
}

function setMsg(text, isError = false) {
  const m = $('#setMsg');
  if (!m) return;
  m.textContent = text;
  m.classList.toggle('error', isError);
}

function drawHeroPreview() {
  const box = $('#heroPreview');
  if (!box) return;
  let src = null;
  if (A.pendingImage instanceof File) src = URL.createObjectURL(A.pendingImage);
  else if (A.pendingImage === undefined && A.settingsImage) src = fileUrl(A.settingsImage);
  box.innerHTML = src ? `<img src="${esc(src)}" alt="Home page picture preview">` : '<span class="muted small">No picture</span>';
  $('#heroRemove').hidden = !src;
}

async function saveSettings(e) {
  e.preventDefault();
  const f = e.target;
  const data = {};
  SETTING_FIELDS.forEach(k => { data[k] = f.elements[k].value.trim(); });
  for (const k of REQUIRED_SETTINGS) if (!data[k]) { setMsg('Fill in the name and the main title.', true); return; }
  for (const k of ['facebook_url', 'instagram_url']) if (data[k] && !safeUrl(data[k])) { setMsg('Enter social links in full, starting with https://', true); return; }
  const btn = $('#setSave');
  btn.disabled = true;
  let newPath = null;
  try {
    let path = A.settingsImage;
    if (A.pendingImage instanceof File) { setMsg('Uploading picture…'); newPath = await uploadFile(A.pendingImage, 'site'); path = newPath; }
    else if (A.pendingImage === null) path = null;
    data.hero_image_path = path;
    const { error } = await sb.from('events_settings').upsert({ id: 1, data, updated_at: new Date().toISOString() });
    if (error) throw error;
    if (A.settingsImage && A.settingsImage !== path) await sb.storage.from(BUCKET).remove([A.settingsImage]);
    A.settingsImage = path;
    A.pendingImage = undefined;
    drawHeroPreview();
    setMsg('');
    toast('Changes saved');
  } catch (err) {
    if (newPath) await sb.storage.from(BUCKET).remove([newPath]);
    setMsg(err.message || String(err), true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- dialogs ---------------- */

document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

boot();
