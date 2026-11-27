import { SAPPORO_POINTS, gridOffset } from './geo.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);

const TV = SAPPORO_POINTS.tvTower;

/**
 * Helper to place a camera coordinate relative to Sapporo's rotated street grid
 * anchored at Odori Nishi 1-chome (Sapporo TV Tower).
 */
function gPt(east, south, y) {
  const v = gridOffset(TV, east, south, y);
  return [v.x, v.y, v.z];
}

/**
 * 6-Shot Cinematic Camera Director calibrated in real 1:1 meters against
 * Project PLATEAU Sapporo (Chuo-ku & Kita-ku) so cameras glide cleanly along
 * open avenues and over rooftops without intersecting real buildings.
 */
export const PLATEAU_SHOTS = [
  {
    dur: 9.0,
    title: 'PLATEAU SAPPORO · GRAND SNOW CASTLE',
    sub: '実寸PLATEAU大通4丁目 大雪像「白雪の大城郭」プロジェクションマッピング',
    eval(u) {
      const t = smoother(u);
      const ang = lerp(-0.46, 0.44, t);
      const rad = lerp(64, 46, t);
      return {
        eye: gPt(-393 + Math.cos(ang) * rad, Math.sin(ang) * rad * 0.72, lerp(11, 22, t)),
        tgt: gPt(-393, 0, lerp(10.5, 13.5, t)),
        fov: lerp(46, 42, t),
      };
    },
  },
  {
    dur: 10.0,
    title: 'ODORI PARK CORRIDOR · REAL PLATEAU SKYLINE',
    sub: '実在の大通ビル群を貫く大雪像パレード（西7→西4丁目）→ さっぽろテレビ塔',
    eval(u) {
      const t = smoother(u);
      return {
        eye: gPt(lerp(-835, -180, t), lerp(18, -14, t), lerp(44, 34, t) + Math.sin(u * Math.PI) * 14),
        tgt: gPt(lerp(-540, 0, t), 0, lerp(16, 62, t)),
        fov: 46,
      };
    },
  },
  {
    dur: 8.0,
    title: 'SAPPORO TV TOWER · SOSEI RIVER',
    sub: 'さっぽろテレビ塔（実寸147m）・電光時計 & 創成川リフレクション',
    eval(u) {
      const t = smoother(u);
      const ang = lerp(-2.25, -0.55, t);
      const rad = lerp(170, 215, u);
      return {
        eye: gPt(Math.cos(ang) * rad, Math.sin(ang) * rad, lerp(64, 108, t)),
        tgt: gPt(0, 0, lerp(72, 58, u)),
        fov: 44,
      };
    },
  },
  {
    dur: 8.5,
    title: 'SUSUKINO ICE WORLD · EKIMAE-DORI',
    sub: 'PLATEAU すすきの交差点・駅前通 氷の彫刻 & 札幌市電',
    eval(u) {
      const t = smoother(u);
      return {
        eye: gPt(lerp(-328, -326, t), lerp(285, 515, t), lerp(16, 36, t)),
        tgt: gPt(-328, lerp(440, 585, t), lerp(11, 18, t)),
        fov: 48,
      };
    },
  },
  {
    dur: 8.0,
    title: 'AKARENGA · CLOCK TOWER · JR TOWER (173m)',
    sub: 'PLATEAU 札幌都心北側 — 赤れんが庁舎・時計台・札幌駅JRタワー',
    eval(u) {
      const t = smoother(u);
      const jr = SAPPORO_POINTS.jrTower;
      const aka = SAPPORO_POINTS.akarenga;
      return {
        eye: gPt(lerp(-520, -140, t), lerp(-190, -290, t), lerp(78, 128, t)),
        tgt: [lerp(aka.x, jr.x, t), lerp(24, 96, t), lerp(aka.z, jr.z, t)],
        fov: 46,
      };
    },
  },
  {
    dur: 9.0,
    title: 'MT. MOIWA & PLATEAU SAPPORO PANORAMA',
    sub: '実寸PLATEAU札幌市街と大通雪まつり会場 — 藻岩山ワイドパノラマ',
    eval(u) {
      const t = smoother(u);
      return {
        eye: gPt(lerp(360, 520, t), lerp(-220, 240, t), lerp(195, 255, t)),
        tgt: gPt(lerp(-380, -680, t), lerp(30, 180, t), lerp(28, 42, t)),
        fov: lerp(46, 50, t),
      };
    },
  },
  {
    dur: 10.5,
    title: 'SAPPORO RAIL & SUBWAY NETWORK · JR × 全3路線',
    sub: 'JR札幌駅高架（函館・千歳・学園都市線）から大通直下の地下鉄3路線交差（南北・東西・東豊）へ',
    eval(u) {
      const t = smoother(u);
      const jr = SAPPORO_POINTS.sapporoStation;
      const odori = SAPPORO_POINTS.odoriNishi3;
      return {
        eye: [
          lerp(jr.x - 240, odori.x + 260, t),
          lerp(115, 165, t),
          lerp(jr.z + 210, odori.z + 290, t),
        ],
        tgt: [
          lerp(jr.x + 20, odori.x + 10, t),
          lerp(12, -2, t),
          lerp(jr.z, odori.z + 15, t),
        ],
        fov: lerp(46, 48, t),
      };
    },
  },
];
