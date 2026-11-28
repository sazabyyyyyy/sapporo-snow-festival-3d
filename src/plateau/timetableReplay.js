/**
 * Schedule-driven rail replay from current official timetables (CKAN st_time).
 * Source of truth: weekday departures embedded in timetableSchedule.js
 * (札幌市交通局 HTML + 札幌市交通事業振興公社 streetcar PDF, retrieved 2026-11-28).
 * Archive subways/streetcars run-history CSVs are NOT used.
 */

import SCHEDULE from './timetableSchedule.js';

const DAY = 24 * 3600;

/** @param {string} clockStr HH:MM or H:MM */
export function clockStringToSec(clockStr) {
  if (!clockStr || typeof clockStr !== 'string') return 0;
  const m = clockStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return h * 3600 + min * 60;
}

/** Asia/Tokyo local clock as seconds since midnight. */
export function getTokyoClockSec(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (t) => parseInt(parts.find((p) => p.type === t)?.value || '0', 10);
  return pick('hour') * 3600 + pick('minute') * 60 + pick('second');
}

export function formatClockSec(sec) {
  const s = ((Math.floor(sec) % DAY) + DAY) % DAY;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getTimetableCredit() {
  return {
    source: SCHEDULE.source,
    sourceUrl: SCHEDULE.sourceUrl,
    retrieved: SCHEDULE.retrieved,
    dayType: SCHEDULE.dayType,
    lines: ['namboku', 'tram'],
  };
}

function unwrapNear(t, pivot) {
  let x = t;
  while (x < pivot - DAY * 0.5) x += DAY;
  while (x > pivot + DAY * 0.5) x -= DAY;
  return x;
}

/**
 * Interpolate arc-length along stations for a trip stop-time array.
 * @param {number[]} stopTimes length N station depart/arrive times (sec of day)
 * @param {number[]} stationArcLengths same length, meters along path in trip direction
 * @param {number} clockSec
 * @returns {number|null} arc length meters, or null if trip inactive
 */
function sampleTripArc(stopTimes, stationArcLengths, clockSec) {
  const n = stopTimes.length;
  if (n < 2 || stationArcLengths.length !== n) return null;

  const t0 = stopTimes[0];
  const tLast = stopTimes[n - 1];
  // Support trips that cross midnight (rare for weekday daytime MVP).
  let tEnd = tLast;
  if (tEnd < t0) tEnd += DAY;

  let t = clockSec;
  if (t0 > 20 * 3600 && t < 4 * 3600) t += DAY;
  if (t < t0 || t > tEnd) return null;

  // Build unwrapped stop timeline
  const times = [t0];
  for (let i = 1; i < n; i++) {
    times.push(unwrapNear(stopTimes[i], times[i - 1]));
  }

  if (t <= times[0]) return stationArcLengths[0];
  if (t >= times[n - 1]) return stationArcLengths[n - 1];

  for (let i = 0; i < n - 1; i++) {
    const a = times[i];
    const b = times[i + 1];
    if (t <= b || i === n - 2) {
      const span = Math.max(1, b - a);
      const u = Math.max(0, Math.min(1, (t - a) / span));
      // Ease between stations (brief accel/brake feel)
      const ease = u * u * (3 - 2 * u);
      const blend = u * 0.35 + ease * 0.65;
      return stationArcLengths[i] + (stationArcLengths[i + 1] - stationArcLengths[i]) * blend;
    }
  }
  return stationArcLengths[n - 1];
}

function expandTramTrips(deps, order, hops) {
  const trips = [];
  const dur = hops.reduce((s, x) => s + x, 0);
  for (const t0 of deps) {
    const stopTimes = new Array(24).fill(-1);
    let t = t0;
    for (let k = 0; k < order.length; k++) {
      stopTimes[order[k]] = ((t % DAY) + DAY) % DAY;
      t += hops[k];
    }
    trips.push({ stopTimes, duration: dur, originSec: t0 });
  }
  return trips;
}

function buildEngine(schedule) {
  const nambokuSouth = (schedule.namboku?.south || []).map((stopTimes) => ({ stopTimes }));
  const nambokuNorth = (schedule.namboku?.north || []).map((stopTimes) => ({ stopTimes }));

  const tram = schedule.tram || {};
  const outerOrder = Array.from({ length: 24 }, (_, i) => i);
  const innerOrder = tram.innerOrder || [0, ...Array.from({ length: 23 }, (_, i) => 23 - i)];
  const outerHops = tram.outerHopsSec || Array(24).fill(120);
  const innerHops = tram.innerHopsSec || Array(24).fill(120);
  const tramOuter = expandTramTrips(tram.outerDepsSec || [], outerOrder, outerHops);
  const tramInner = expandTramTrips(tram.innerDepsSec || [], innerOrder, innerHops);

  return {
    nambokuSouth,
    nambokuNorth,
    tramOuter,
    tramInner,
    nambokuStations: schedule.namboku?.stations || [],
    tramStations: tram.stations || [],
  };
}

const ENGINE = buildEngine(SCHEDULE);

/**
 * Finalize station arc lengths after samples exist (call from railNetwork after buildLineInfra).
 */
export function fillStationArcs(entry, rawPts) {
  const map = {
    codes: [],
    names: [],
    arcs: [],
    byCode: new Map(),
    byName: new Map(),
  };
  const isClosed = Boolean(entry.spec.closed);
  const searchMax = isClosed ? entry.samples.length - 1 : entry.samples.length;

  for (let i = 0; i < entry.spec.points.length; i++) {
    const pt = entry.spec.points[i];
    if (!pt.name) continue;
    let bestIdx = 0;
    let bestD2 = Infinity;
    for (let j = 0; j < searchMax; j++) {
      const d2 = entry.samples[j].pos.distanceToSquared(rawPts[i]);
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = j;
      }
    }
    const arc = entry.sampleArcLens[bestIdx];
    map.codes.push(pt.code || '');
    map.names.push(pt.name);
    map.arcs.push(arc);
    if (pt.code) map.byCode.set(pt.code, arc);
    map.byName.set(pt.name, arc);
  }
  entry.stationArcs = map;
  return map;
}

function arcsForTripDirection(entry, codesInTripOrder) {
  const map = entry.stationArcs;
  if (!map) return null;
  const arcs = [];
  for (const code of codesInTripOrder) {
    const a = map.byCode.get(code);
    if (a == null) return null;
    arcs.push(a);
  }
  return arcs;
}

/**
 * Active timetable vehicles for a rail line at clockSec.
 * @returns {{ dir: 1|-1, leadS: number }[]}
 */
export function getTimetableVehicles(entry, clockSec) {
  const id = entry.spec.id;
  const out = [];

  if (id === 'namboku') {
    const codesS = ENGINE.nambokuStations.map((s) => s.code);
    const arcsS = arcsForTripDirection(entry, codesS);
    const codesN = [...codesS].reverse();
    const arcsN = arcsForTripDirection(entry, codesN);
    if (arcsS) {
      for (const trip of ENGINE.nambokuSouth) {
        const leadS = sampleTripArc(trip.stopTimes, arcsS, clockSec);
        if (leadS != null) out.push({ dir: 1, leadS });
      }
    }
    if (arcsN) {
      for (const trip of ENGINE.nambokuNorth) {
        const leadS = sampleTripArc(trip.stopTimes, arcsN, clockSec);
        if (leadS != null) out.push({ dir: -1, leadS });
      }
    }
    return out;
  }

  if (id === 'tram') {
    const codes = ENGINE.tramStations.map((s) => s.code);
    const arcsForward = arcsForTripDirection(entry, codes);
    if (!arcsForward) return out;

    // Outer: SC01→SC24 along curve (dir +1)
    for (const trip of ENGINE.tramOuter) {
      const leadS = sampleTripArc(trip.stopTimes, arcsForward, clockSec);
      if (leadS != null) out.push({ dir: 1, leadS });
    }

    // Inner: reverse station order along the same polyline (dir -1)
    const codesRev = [...codes].reverse();
    const arcsRev = arcsForTripDirection(entry, codesRev);
    // For inner trips, stopTimes are indexed SC01..SC24; rebuild times in reverse travel order
    if (arcsRev) {
      for (const trip of ENGINE.tramInner) {
        const orderedTimes = codesRev.map((code) => {
          const idx = parseInt(code.slice(2), 10) - 1;
          return trip.stopTimes[idx];
        });
        // Filter gaps — expandTram fills all 24
        if (orderedTimes.some((t) => t < 0)) continue;
        const leadS = sampleTripArc(orderedTimes, arcsRev, clockSec);
        if (leadS != null) out.push({ dir: -1, leadS });
      }
    }
    return out;
  }

  return out;
}

export function lineHasTimetable(lineId) {
  return lineId === 'namboku' || lineId === 'tram';
}

export { SCHEDULE as TIMETABLE_SCHEDULE };
