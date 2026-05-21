// home — a launcher for whatever Solid apps are on this pod.
//
// Reads /public/apps/ as an LDP container, lists every app it finds,
// renders them in a macOS-style magnification dock. Visual lifted
// from JSS's Solid OS dashboard so it feels like the same suite.

const app = document.getElementById('app')

// Known apps: stable colors + emoji so familiar ones look the part.
// Anything not listed gets a colour from a hash of its name + the
// first letter as a glyph.
const KNOWN = {
  plaza:      { glyph: '\u{1F4AC}', color: '#7c4dff', color2: '#a78bfa' },
  chat:       { glyph: '✉️', color: '#06b6d4', color2: '#22d3ee' },
  vellum:     { glyph: '✍️', color: '#f59e0b', color2: '#fbbf24' },
  plume:      { glyph: '\u{1FAB6}',  color: '#a855f7', color2: '#c084fc' },
  taskify:    { glyph: '✅',     color: '#22c55e', color2: '#4ade80' },
  explorer:   { glyph: '\u{1F4C1}',  color: '#3b82f6', color2: '#60a5fa' },
  hub:        { glyph: '\u{1F39B}️', color: '#ec4899', color2: '#f472b6' },
  chrome:     { glyph: '\u{1FA9F}',  color: '#10b981', color2: '#059669' },
  timeline:   { glyph: '\u{1F4F0}',  color: '#f97316', color2: '#fb923c' },
  win98:      { glyph: '\u{1F4BB}',  color: '#06b6d4', color2: '#22d3ee' },
  pdf:        { glyph: '\u{1F4C4}',  color: '#ef4444', color2: '#f87171' },
  alarm:      { glyph: '⏰',     color: '#fbbf24', color2: '#f59e0b' },
  playlist:   { glyph: '\u{1F3B5}',  color: '#a855f7', color2: '#c084fc' },
  mindstr:    { glyph: '\u{1F9E0}',  color: '#a855f7', color2: '#c084fc' },
  charlie:    { glyph: '\u{1F916}',  color: '#10b981', color2: '#059669' },
  forum:      { glyph: '\u{1F4AD}',  color: '#ec4899', color2: '#f472b6' },
  transcribe: { glyph: '\u{1F3A4}',  color: '#06b6d4', color2: '#22d3ee' }
}

const FALLBACK_COLORS = [
  ['#7c4dff', '#a78bfa'], ['#06b6d4', '#22d3ee'], ['#f59e0b', '#fbbf24'],
  ['#22c55e', '#4ade80'], ['#3b82f6', '#60a5fa'], ['#ec4899', '#f472b6'],
  ['#10b981', '#059669'], ['#f97316', '#fb923c'], ['#a855f7', '#c084fc'],
  ['#ef4444', '#f87171']
]
function pickColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length]
}

function describe(name, url) {
  const known = KNOWN[name.toLowerCase()]
  if (known) return { name, url, glyph: known.glyph, color: known.color, color2: known.color2 }
  const [color, color2] = pickColor(name)
  return { name, url, glyph: (name[0] || '?').toUpperCase(), color, color2 }
}

// Try the app's manifest.json. If it has theme_color + a 192px icon we
// prefer those over the hardcoded KNOWN map — each app brands itself.
async function fetchManifest(appUrl) {
  try {
    const r = await fetch(appUrl + 'manifest.json')
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

// Merge manifest data onto the base descriptor. If manifest has an
// icon URL we set `iconUrl` and the renderer uses an <img>; otherwise
// we keep the glyph + gradient fallback.
async function enrichWithManifest(base) {
  const m = await fetchManifest(base.url)
  if (!m) return base
  const icons = m.icons || []
  // Prefer a 192px icon — typical "small enough to be cheap, large
  // enough to look sharp at the dock's 54px tile + retina".
  const pick = icons.find(i => (i.sizes || '').includes('192')) ||
               icons.find(i => (i.sizes || '').includes('512')) ||
               icons[0]
  const out = { ...base }
  if (m.short_name || m.name) out.name = m.short_name || m.name
  if (m.theme_color) { out.color = m.theme_color; out.color2 = m.theme_color }
  if (pick && pick.src) {
    try { out.iconUrl = new URL(pick.src, base.url).toString() } catch {}
  }
  return out
}

async function fetchApps() {
  try {
    const r = await fetch('/public/apps/', { headers: { Accept: 'application/ld+json' } })
    if (!r.ok) return []
    const doc = await r.json()
    const contains = doc['ldp:contains'] || doc['http://www.w3.org/ns/ldp#contains'] || doc['contains'] || []
    const arr = Array.isArray(contains) ? contains : [contains]
    const bases = arr
      .map(x => typeof x === 'string' ? x : x?.['@id'])
      .filter(Boolean)
      .filter(u => u.endsWith('/'))
      .map(url => {
        const segments = url.replace(/\/$/, '').split('/')
        const name = segments[segments.length - 1]
        return describe(name, url)
      })
    // Read each app's manifest.json in parallel for theme + icon.
    const enriched = await Promise.all(bases.map(enrichWithManifest))
    return enriched.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

// Parse `app:spec` strings the way `jspod install` does. Returns
// the renamed pod-path name (what would appear under /public/apps/)
// plus the canonical gh-pages URL of the app for preview links.
function parseSpec(input) {
  let base = input
  let renameName = null
  const eqIx = base.lastIndexOf('=')
  if (eqIx > 0) { renameName = base.slice(eqIx + 1); base = base.slice(0, eqIx) }
  const hashIx = base.lastIndexOf('#')
  if (hashIx > 0) base = base.slice(0, hashIx)
  let name, url
  if (/^https?:\/\//.test(base)) {
    name = base.replace(/\/$/, '').split('/').pop()
    url = base.endsWith('/') ? base : base + '/'
  } else if (base.includes('/')) {
    const [org, ...rest] = base.split('/')
    const repo = rest.join('/')
    name = repo.split('/').pop()
    url = `https://${org}.github.io/${repo}/`
  } else {
    name = base
    url = `https://solid-apps.github.io/${base}/`
  }
  if (renameName) name = renameName
  return { name, url }
}

// Fetch the canonical "jspod" bundle as a preview when the local
// pod has no apps installed (or when home is being viewed from
// gh-pages directly with no pod to read from).
async function fetchFallbackBundle() {
  const FALLBACK_URL = 'https://raw.githubusercontent.com/solid-apps/bundles/HEAD/jspod.jsonld'
  try {
    const r = await fetch(FALLBACK_URL)
    if (!r.ok) return []
    const doc = await r.json()
    const items = doc['schema:itemListElement'] || doc['itemListElement'] || []
    const bases = items
      .map(item => typeof item === 'string' ? item : item?.['app:spec'])
      .filter(Boolean)
      .map(spec => {
        const { name, url } = parseSpec(spec)
        return { ...describe(name, url), preview: true }
      })
    // Pull each gh-pages app's manifest too so preview tiles get the
    // app's own brand instead of our hash-derived fallback.
    return Promise.all(bases.map(enrichWithManifest))
  } catch {
    return []
  }
}

async function render() {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  let apps = await fetchApps()
  let preview = false
  if (apps.length === 0) {
    apps = await fetchFallbackBundle()
    preview = apps.length > 0
  }

  const style = document.createElement('style')
  style.textContent = `
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    .h { position: fixed; inset: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow-y: auto; overflow-x: hidden; -webkit-font-smoothing: antialiased; }

    /* Static gradient background — orbs baked in as radial gradients,
       no transform/blur animation, no backdrop-filter, GPU at idle. */
    .h-bg {
      position: fixed; inset: 0; z-index: 0;
      background:
        radial-gradient(circle at 25% 8%, rgba(99,102,241,0.20) 0%, transparent 38%),
        radial-gradient(circle at 85% 88%, rgba(168,85,247,0.16) 0%, transparent 38%),
        radial-gradient(circle at 55% 50%, rgba(59,130,246,0.10) 0%, transparent 26%),
        linear-gradient(160deg, #0a0618 0%, #1a1145 30%, #2d1b69 50%, #1a1145 70%, #0a0618 100%);
    }

    .h-bar {
      position: sticky; top: 0; z-index: 20; height: 38px;
      background: rgba(10,6,24,0.82);
      display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .h-logo { font-weight: 800; font-size: 13px; color: #fff; letter-spacing: 0.04em; }
    .h-bar-r { display: flex; align-items: center; gap: 14px; color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 500; }
    .h-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; display: inline-block; margin-right: 4px; box-shadow: 0 0 8px #22c55e88; }

    .h-content {
      position: relative; z-index: 5; max-width: 900px; margin: 0 auto; padding: 40px 24px 80px;
      animation: fadeUp 0.6s ease-out;
    }

    .h-clock { text-align: center; margin-bottom: 4px; }
    .h-time {
      font-size: 96px; font-weight: 100; letter-spacing: -0.04em; line-height: 1;
      background: linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.6) 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .h-date { font-size: 16px; color: rgba(255,255,255,0.4); margin-top: 2px; font-weight: 400; letter-spacing: 0.02em; }
    .h-greet { text-align: center; margin: 16px 0 28px; }
    .h-greet h1 { font-size: 20px; font-weight: 300; color: rgba(255,255,255,0.55); }

    .h-search { display: flex; justify-content: center; margin-bottom: 32px; }
    .h-search-w { position: relative; }
    .h-search-w::before { content: '\u{1F50D}'; position: absolute; left: 16px; top: 50%; transform: translateY(-50%); font-size: 13px; opacity: 0.3; }
    .h-sinput {
      width: 420px; max-width: 85vw; padding: 13px 18px 13px 44px;
      background: rgba(255,255,255,0.09);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px; color: #fff; font-size: 14px; font-family: inherit; outline: none;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .h-sinput::placeholder { color: rgba(255,255,255,0.25); }
    .h-sinput:focus {
      background: rgba(255,255,255,0.11);
      border-color: rgba(124,58,237,0.4);
      box-shadow: 0 0 0 4px rgba(124,58,237,0.1), 0 8px 32px rgba(0,0,0,0.2);
      transform: scale(1.01);
    }

    .h-sec { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; padding-left: 4px; }
    .h-dock {
      display: flex; justify-content: center; align-items: flex-end; gap: 4px;
      padding: 16px 24px 14px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 28px;
      position: relative; overflow: visible; flex-wrap: wrap;
    }
    .h-dock::before {
      content: ''; position: absolute; top: 0; left: 20%; right: 20%; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
    }

    .h-app {
      display: flex; flex-direction: column; align-items: center;
      padding: 8px 8px 6px; border-radius: 16px;
      cursor: pointer; text-decoration: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      -webkit-tap-highlight-color: transparent;
    }
    .h-app:hover { transform: translateY(-8px); }
    .h-app:active { transform: scale(0.92); }
    .h-app.hidden { display: none; }

    /* Preview apps (fallback bundle, not yet installed on this pod):
       subtle dim so they read as "not yours yet" without losing the
       dock's liveliness. Hover restores full color. */
    .h-app-preview .h-icon { opacity: 0.7; filter: saturate(0.7); transition: opacity 0.2s, filter 0.2s; }
    .h-app-preview .h-app-name { color: rgba(255,255,255,0.35); }
    .h-app-preview:hover .h-icon { opacity: 1; filter: saturate(1); }
    .h-app-preview:hover .h-app-name { color: rgba(255,255,255,0.9); }
    .h-preview-note {
      text-align: center;
      font-size: 12px;
      color: rgba(255,255,255,0.45);
      margin: -8px 0 20px;
      letter-spacing: 0.02em;
    }
    .h-preview-note strong { color: rgba(255,255,255,0.7); font-weight: 600; }
    .h-preview-note code {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 11.5px;
      background: rgba(255,255,255,0.06);
      padding: 2px 8px;
      border-radius: 6px;
      color: rgba(255,255,255,0.75);
    }

    .h-icon {
      width: 54px; height: 54px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; position: relative;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow:
        0 1px 2px rgba(0,0,0,0.3),
        0 4px 8px rgba(0,0,0,0.2),
        0 10px 20px rgba(0,0,0,0.15),
        inset 0 1px 0 rgba(255,255,255,0.3),
        inset 0 -2px 4px rgba(0,0,0,0.1);
      color: #fff;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .h-icon::before {
      content: '';
      position: absolute; top: 1px; left: 1px; right: 1px; height: 50%;
      border-radius: 13px 13px 40% 40%;
      background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0) 100%);
      pointer-events: none;
    }
    .h-icon img {
      width: 100%; height: 100%;
      object-fit: cover;
      border-radius: 14px;
      display: block;
    }
    .h-icon::after {
      content: ''; position: absolute; inset: 0; border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.2);
      border-bottom-color: rgba(0,0,0,0.1);
      pointer-events: none;
    }
    .h-app:hover .h-icon {
      box-shadow:
        0 2px 4px rgba(0,0,0,0.3),
        0 8px 16px rgba(0,0,0,0.2),
        0 16px 32px rgba(0,0,0,0.15),
        0 0 30px var(--glow),
        inset 0 1px 0 rgba(255,255,255,0.35),
        inset 0 -2px 4px rgba(0,0,0,0.1);
      transform: scale(1.12);
    }

    .h-app-dot {
      width: 4px; height: 4px; border-radius: 50%;
      background: rgba(255,255,255,0.35);
      margin-top: 6px; transition: all 0.2s;
    }
    .h-app:hover .h-app-dot { background: #fff; box-shadow: 0 0 6px rgba(255,255,255,0.5); }

    .h-app-name {
      font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.5);
      text-align: center; margin-top: 4px; transition: all 0.2s;
    }
    .h-app:hover .h-app-name { color: rgba(255,255,255,0.9); }

    .h-tip {
      position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%) translateY(4px);
      background: rgba(10,6,24,0.95);
      border: 1px solid rgba(255,255,255,0.1);
      color: #fff; font-size: 12px; font-weight: 600;
      padding: 6px 14px; border-radius: 10px; white-space: nowrap;
      pointer-events: none; opacity: 0; transition: opacity 0.15s, transform 0.15s;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .h-tip::after {
      content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
      border: 5px solid transparent; border-top-color: rgba(10,6,24,0.9);
    }
    .h-app:hover .h-tip { opacity: 1; transform: translateX(-50%) translateY(0); }

    .h-empty {
      text-align: center; padding: 40px 24px;
      color: rgba(255,255,255,0.4); font-size: 14px;
      max-width: 480px; margin: 0 auto;
    }
    .h-empty strong { color: #fff; font-size: 16px; display: block; margin-bottom: 8px; font-weight: 600; }
    .h-empty code {
      display: inline-block; margin-top: 12px; padding: 6px 12px;
      background: rgba(255,255,255,0.06); border-radius: 8px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12.5px;
      color: rgba(255,255,255,0.8);
    }

    @media (max-width: 600px) {
      .h-content { padding: 24px 16px 60px; }
      .h-time { font-size: 64px; }
      .h-dock { flex-wrap: wrap; justify-content: center; gap: 6px; padding: 16px; border-radius: 24px; }
      .h-icon { width: 48px; height: 48px; font-size: 22px; border-radius: 13px; }
      .h-app-name { opacity: 1; transform: none; font-size: 10.5px; }
      .h-tip { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001s !important;
      }
    }
  `
  app.appendChild(style)

  const root = document.createElement('div')
  root.className = 'h'

  const bg = document.createElement('div')
  bg.className = 'h-bg'
  root.appendChild(bg)

  const bar = document.createElement('div')
  bar.className = 'h-bar'
  bar.innerHTML = '<span class="h-logo">home</span>'
  const barR = document.createElement('div')
  barR.className = 'h-bar-r'
  barR.innerHTML = '<span><span class="h-dot"></span>' + apps.length + (preview ? ' demos' : ' apps') + '</span>'
  const barClock = document.createElement('span')
  barR.appendChild(barClock)
  bar.appendChild(barR)
  root.appendChild(bar)

  const content = document.createElement('div')
  content.className = 'h-content'

  const clock = document.createElement('div')
  clock.className = 'h-clock'
  const timeEl = document.createElement('div'); timeEl.className = 'h-time'; clock.appendChild(timeEl)
  const dateEl = document.createElement('div'); dateEl.className = 'h-date'; clock.appendChild(dateEl)
  content.appendChild(clock)

  const tick = () => {
    const now = new Date()
    timeEl.textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    barClock.textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  tick(); setInterval(tick, 10000)

  const greet = document.createElement('div')
  greet.className = 'h-greet'
  greet.innerHTML = '<h1>' + greeting + '</h1>'
  content.appendChild(greet)

  const search = document.createElement('div')
  search.className = 'h-search'
  const sw = document.createElement('div'); sw.className = 'h-search-w'
  const si = document.createElement('input')
  si.className = 'h-sinput'
  si.placeholder = 'Search apps…'
  si.type = 'text'
  sw.appendChild(si); search.appendChild(sw)
  content.appendChild(search)

  const sec = document.createElement('div')
  sec.className = 'h-sec'
  sec.textContent = preview ? 'Preview' : 'Apps'
  content.appendChild(sec)

  if (preview) {
    const note = document.createElement('div')
    note.className = 'h-preview-note'
    note.innerHTML = '<strong>No apps installed yet.</strong> Try the live demos below, then run <code>jspod install --bundle jspod</code> to make them yours.'
    content.appendChild(note)
  }

  if (apps.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'h-empty'
    empty.innerHTML = '<strong>No apps installed yet.</strong>' +
      'Drop apps into <code>/public/apps/</code> on this pod and they\'ll appear here.' +
      '<br><code>jspod install --bundle teams</code>'
    content.appendChild(empty)
  } else {
    const dock = document.createElement('div')
    dock.className = 'h-dock'
    for (const a of apps) {
      const el = document.createElement('a')
      el.className = 'h-app' + (preview ? ' h-app-preview' : '')
      el.href = a.url
      if (preview) {
        el.target = '_blank'
        el.rel = 'noopener noreferrer'
      }
      el.dataset.name = a.name.toLowerCase()

      const icon = document.createElement('div')
      icon.className = 'h-icon'
      icon.style.setProperty('--glow', a.color + '44')
      if (a.iconUrl) {
        // App declared its own icon via manifest.json — use it directly.
        const img = document.createElement('img')
        img.src = a.iconUrl
        img.alt = ''
        img.loading = 'lazy'
        icon.appendChild(img)
        icon.style.background = a.color
      } else {
        icon.style.background = 'linear-gradient(145deg, ' + a.color2 + ', ' + a.color + ')'
        icon.textContent = a.glyph
      }
      el.appendChild(icon)

      const dot = document.createElement('div'); dot.className = 'h-app-dot'; el.appendChild(dot)
      const name = document.createElement('div'); name.className = 'h-app-name'; name.textContent = a.name; el.appendChild(name)
      const tip = document.createElement('div'); tip.className = 'h-tip'; tip.textContent = a.name + (preview ? ' (demo)' : ''); el.appendChild(tip)

      dock.appendChild(el)
    }
    content.appendChild(dock)

    // macOS-style magnification on hover
    dock.addEventListener('mousemove', (e) => {
      const mouseX = e.clientX
      for (const a of dock.querySelectorAll('.h-app')) {
        const rect = a.getBoundingClientRect()
        const center = rect.left + rect.width / 2
        const dist = Math.abs(mouseX - center)
        const maxDist = 120
        if (dist < maxDist) {
          const scale = 1 + 0.2 * (1 - dist / maxDist)
          const lift = -6 * (1 - dist / maxDist)
          a.style.transform = 'translateY(' + lift + 'px) scale(' + scale + ')'
        } else {
          a.style.transform = ''
        }
      }
    })
    dock.addEventListener('mouseleave', () => {
      for (const a of dock.querySelectorAll('.h-app')) a.style.transform = ''
    })

    si.addEventListener('input', () => {
      const q = si.value.toLowerCase().trim()
      for (const el of dock.querySelectorAll('.h-app')) {
        const match = !q || el.dataset.name.includes(q)
        el.classList.toggle('hidden', !match)
      }
    })
  }

  root.appendChild(content)
  app.appendChild(root)
}

render()
