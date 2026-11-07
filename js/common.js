// Shared helpers for the public site and the admin panel.

const HSU = window.HSU_CONFIG || {};
const IS_CONFIGURED = Boolean(HSU.SUPABASE_URL && HSU.SUPABASE_ANON_KEY && !HSU.SUPABASE_URL.includes('YOUR-PROJECT'));
const sb = IS_CONFIGURED ? window.supabase.createClient(HSU.SUPABASE_URL, HSU.SUPABASE_ANON_KEY) : null;

const BUCKET = 'events';
const MAX_UPLOAD_MB = 50;
const CATEGORIES = ['Seminar', 'Workshop', 'Career guidance', 'Leadership and skills', 'Awareness programme', 'Community service', 'Other'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch { return null; }
}

function youtubeId(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return /^[\w-]{11}$/.test(x.pathname.slice(1, 12)) ? x.pathname.slice(1, 12) : null;
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = x.searchParams.get('v');
      if (v && /^[\w-]{11}/.test(v)) return v.slice(0, 11);
      const m = x.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      return m ? m[1] : null;
    }
  } catch { /* not a URL */ }
  return null;
}

function fileUrl(path) {
  return path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

function plural(n, word, many = word + 's') { return `${n} ${n === 1 ? word : many}`; }

/* ---------- dates ---------- */

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], m: MONTHS[+m[2] - 1], long: `${+m[3]} ${MONTHS_LONG[+m[2] - 1]} ${m[1]}` };
}

// "10 November 2026" or "10–12 November 2026" or "30 November – 2 December 2026"
function dateRange(e) {
  const a = dateParts(e.start_date);
  const b = e.end_date && e.end_date !== e.start_date ? dateParts(e.end_date) : null;
  if (!a) return '';
  if (!b) return a.long;
  if (a.y === b.y && a.mo === b.mo) return `${a.d}–${b.d} ${MONTHS_LONG[a.mo - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS_LONG[a.mo - 1]} – ${b.d} ${MONTHS_LONG[b.mo - 1]} ${a.y}`;
  return `${a.long} – ${b.long}`;
}

// An event stays "upcoming" until its last day has passed.
function isUpcoming(e) { return (e.end_date || e.start_date || '') >= todayISO(); }
function isToday(e) { const t = todayISO(); return e.start_date <= t && (e.end_date || e.start_date) >= t; }

function timeAgo(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 3600) return 'just now';
  if (s < 86400) return plural(Math.floor(s / 3600), 'hour') + ' ago';
  if (s < 86400 * 7) return plural(Math.floor(s / 86400), 'day') + ' ago';
  const p = dateParts(new Date(ts).toISOString());
  return `${p.d} ${p.m} ${p.y}`;
}

/* ---------- text ---------- */

function linkify(html) {
  return html
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(>])([\w.+-]+@[\w-]+\.[\w.-]*\w)/g, '$1<a href="mailto:$2">$2</a>');
}

// Plain text → safe HTML. Blank line = new paragraph, "## " = heading.
function richText(text) {
  return String(text || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b =>
    b.startsWith('## ') ? `<h2>${esc(b.slice(3))}</h2>` : `<p>${linkify(esc(b)).replace(/\n/g, '<br>')}</p>`
  ).join('');
}

/* ---------- images ---------- */

// Shrink a photo before upload so the free 1 GB storage lasts.
function shrinkImage(file, max = 1800, quality = 0.85) {
  return new Promise(resolve => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return resolve(file);
    createImageBitmap(file).then(bmp => {
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) return resolve(file);
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      c.toBlob(b => resolve(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', quality);
    }, () => resolve(file));
  });
}

/* ---------- toasts ---------- */

function toast(message, type = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3200);
}

function setupNotice() {
  return `<div class="wrap block notice">
    <h2>Connect the site to Supabase</h2>
    <p>Open <code>js/config.js</code> and paste your Supabase project URL and anon key. The README explains where to find them.</p>
  </div>`;
}

/* ---------- editable site settings ---------- */

const DEFAULT_SETTINGS = {
  brand_name: 'HSU Events',
  brand_sub: 'Hindu Student Union, University of Peradeniya',
  hero_title: 'நிகழ்வுகள்',
  hero_text: 'Seminars, workshops, career guidance and community programmes from the Hindu Student Union that help students learn, lead and grow. Dates, details, updates and photos, all in one place.',
  hero_image_path: null,
  about_title: 'About the Hindu Student Union',
  about_body: 'The Hindu Student Union of the University of Peradeniya runs programmes that empower students: A/L seminars, skills workshops, career guidance, leadership training, awareness programmes and community service.\n\nThis site lists every programme with its date, venue and details. After each one, the committee adds photos so you can look back on it.',
  contact_email: '',
  facebook_url: '',
  instagram_url: '',
  footer_note: '69வது செயற்குழு, இந்து மாணவர் சங்கம், பேராதனைப் பல்கலைக்கழகம்',
  quote: 'களர்நிலத்துப் பிறந்த உப்பினைச் சான்றோர்\nவிளைநிலத்து நெல்லின் விழுமிதாக் கொள்வர்\nகடைநிலத்தோர் ஆயினும் கற்றறிந் தோரைத்\nதலைநிலத்து வைக்கப் படும்',
};
const REQUIRED_SETTINGS = ['brand_name', 'hero_title'];

async function loadSettings() {
  if (!sb) return { ...DEFAULT_SETTINGS };
  const { data, error } = await sb.from('events_settings').select('data').eq('id', 1).maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS };
  const out = { ...DEFAULT_SETTINGS, ...(data.data || {}) };
  for (const k of REQUIRED_SETTINGS) if (!String(out[k] || '').trim()) out[k] = DEFAULT_SETTINGS[k];
  return out;
}

/* ---------- decoration ---------- */

// Line mandala in the style of the union's printed covers. Colour comes from CSS.
const MANDALA = (() => {
  const c = 200, out = [];
  const ring = (r1, r2, n, w, rot = 0) => {
    for (let i = 0; i < n; i++) {
      const a = (360 / n) * i + rot;
      const mid = (r1 + r2) / 2;
      out.push(`<path transform="rotate(${a} ${c} ${c})" d="M${c} ${c - r1} C${c + w} ${c - mid} ${c + w * .6} ${c - r2 + 6} ${c} ${c - r2} C${c - w * .6} ${c - r2 + 6} ${c - w} ${c - mid} ${c} ${c - r1}Z"/>`);
    }
  };
  [22, 46, 92, 140, 186, 196].forEach(r => out.push(`<circle cx="${c}" cy="${c}" r="${r}"/>`));
  ring(22, 46, 8, 12);
  ring(46, 92, 12, 18, 15);
  ring(52, 84, 12, 8, 15);
  ring(92, 140, 16, 20);
  ring(100, 132, 16, 9);
  ring(140, 186, 24, 16, 7.5);
  for (let i = 0; i < 48; i++) {
    const a = (Math.PI * 2 * i) / 48;
    out.push(`<circle cx="${(c + 191 * Math.cos(a)).toFixed(1)}" cy="${(c + 191 * Math.sin(a)).toFixed(1)}" r="2.2"/>`);
  }
  return `<svg class="mandala" viewBox="0 0 400 400" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3">${out.join('')}</svg>`;
})();
function mandalaSVG(cls = '') { return MANDALA.replace('class="mandala"', `class="mandala ${cls}"`); }
