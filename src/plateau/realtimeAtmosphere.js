/**
 * Asia/Tokyo local time → scene atmosphere (clock + sun/night).
 * Interpolates between the existing TIME_PRESETS anchors so lighting
 * stays consistent with the hand-tuned look while tracking real minutes.
 */

const TOKYO_TZ = 'Asia/Tokyo';

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TOKYO_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TOKYO_TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: false,
});

/** @returns {{ year:number, month:number, day:number, hour:number, minute:number, second:number, clock:string, minuteOfDay:number }} */
export function getTokyoLocalParts(date = new Date()) {
  const bag = Object.create(null);
  for (const { type, value } of PARTS_FMT.formatToParts(date)) {
    if (type !== 'literal') bag[type] = Number(value);
  }
  const hour = bag.hour === 24 ? 0 : bag.hour;
  const minute = bag.minute;
  const clock = TIME_FMT.format(date);
  return {
    year: bag.year,
    month: bag.month,
    day: bag.day,
    hour,
    minute,
    second: bag.second,
    clock,
    minuteOfDay: hour * 60 + minute,
  };
}

/** Calendar season for Sapporo / Hokkaido (rough meteorological months). */
export function seasonFromTokyoMonth(month) {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

function parseClockToMinutes(clock) {
  const [h, m] = String(clock).split(':').map(Number);
  return (h % 24) * 60 + (m || 0);
}

function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

function lerpHex(a, b, t) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerpNum(ar, br, t));
  const g = Math.round(lerpNum(ag, bg, t));
  const bl = Math.round(lerpNum(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

function lerpDir(a, b, t) {
  const x = lerpNum(a[0], b[0], t);
  const y = lerpNum(a[1], b[1], t);
  const z = lerpNum(a[2], b[2], t);
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function mixEnv(a, b, t, clock) {
  return {
    label: 'いま',
    clock,
    zenith: lerpHex(a.zenith, b.zenith, t),
    horizon: lerpHex(a.horizon, b.horizon, t),
    sunCol: lerpHex(a.sunCol, b.sunCol, t),
    sunDir: lerpDir(a.sunDir, b.sunDir, t),
    sunInt: lerpNum(a.sunInt, b.sunInt, t),
    hemiTop: lerpHex(a.hemiTop, b.hemiTop, t),
    hemiBot: lerpHex(a.hemiBot, b.hemiBot, t),
    hemiInt: lerpNum(a.hemiInt, b.hemiInt, t),
    fogCol: lerpHex(a.fogCol, b.fogCol, t),
    fogDen: lerpNum(a.fogDen, b.fogDen, t),
    night: lerpNum(a.night, b.night, t),
    stars: lerpNum(a.stars, b.stars, t),
    bloom: lerpNum(a.bloom, b.bloom, t),
    exposure: lerpNum(a.exposure, b.exposure, t),
    envInt: lerpNum(a.envInt, b.envInt, t),
    tint: lerpHex(a.tint, b.tint, t),
    snowCol: lerpHex(a.snowCol, b.snowCol, t),
  };
}

/**
 * Build a live atmosphere env from TIME_PRESETS by minute-of-day.
 * Expected preset clocks: morning ~08:30, noon ~13:15, twilight ~17:48, night ~20:15.
 */
export function buildLiveAtmosphere(presets, date = new Date()) {
  const parts = getTokyoLocalParts(date);
  const byLabel = Object.create(null);
  for (const p of presets) byLabel[p.label] = p;

  const morning = byLabel['冬の朝'] || presets[3];
  const noon = byLabel['冬の快晴（昼）'] || presets[2];
  const twilight = byLabel['トワイライト'] || presets[0];
  const night = byLabel['雪まつり夜景'] || presets[1];

  // Wrap-around night segment uses the night preset on both ends.
  const anchors = [
    { m: 0, env: night },
    { m: parseClockToMinutes(morning.clock), env: morning },
    { m: parseClockToMinutes(noon.clock), env: noon },
    { m: parseClockToMinutes(twilight.clock), env: twilight },
    { m: parseClockToMinutes(night.clock), env: night },
    { m: 24 * 60, env: night },
  ];

  const mod = parts.minuteOfDay;
  let i = 0;
  while (i < anchors.length - 1 && anchors[i + 1].m < mod) i++;
  const a = anchors[i];
  const b = anchors[i + 1];
  const span = Math.max(1, b.m - a.m);
  const t = (mod - a.m) / span;

  return {
    env: mixEnv(a.env, b.env, t, parts.clock),
    parts,
    season: seasonFromTokyoMonth(parts.month),
  };
}
