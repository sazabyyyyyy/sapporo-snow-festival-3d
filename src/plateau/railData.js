import * as THREE from 'three';
import { latLonToGround } from './geo.js';

/**
 * Complete real-world WGS84 railway & subway network definitions for Sapporo City (all 10 wards):
 *  - Sapporo Municipal Subway (ALL 3 lines, 49 station stops):
 *      1. Namboku Line (南北線): N01 Asabu <-> N16 Makomanai (16 stations; elevated snow-shelter south of Hiragishi!)
 *      2. Tozai Line   (東西線): T01 Miyanosawa <-> T19 Shin-Sapporo (19 stations)
 *      3. Toho Line    (東豊線): H01 Sakaemachi <-> H14 Fukuzumi (14 stations)
 *  - JR Hokkaido Sapporo Urban Network (ALL 3 corridors):
 *      4. JR Hakodate Main Line   (JR函館本線): Hoshimi <-> Teine <-> Kotoni <-> Soen <-> Sapporo <-> Naebo <-> Shiroishi <-> Atsubetsu <-> Shinrin-Koen
 *      5. JR Chitose Line         (JR千歳線・快速エアポート): Sapporo <-> Naebo <-> Shiroishi <-> Heiwa <-> Shin-Sapporo <-> Kami-Nopporo
 *      6. JR Gakuen-Toshi Line    (JR学園都市線): Sapporo <-> Soen <-> Hachiken <-> Shinkawa <-> Shin-Kotoni <-> ... <-> Ainosato-Koen
 *
 * Each waypoint carries:
 *   - lat, lon: verified WGS84 coordinates
 *   - initGroundY: initial approximate local Y (meters relative to Odori Park = 22.0m TP); refined dynamically via GSI DEM
 *   - relY: track height relative to local ground (<0 underground tunnel, >0 surface/elevated viaduct)
 *   - elevated: whether to build above-ground viaduct piers / Namboku snow-shelter structure
 *   - code / name / major: station metadata (omitted for intermediate curve shaping points)
 */

export const RAIL_LINES = [
  // ==================== 1. SAPPORO SUBWAY: NAMBOKU LINE (南北線 — 16 STATIONS) ====================
  {
    id: 'namboku',
    group: 'subway',
    name: '南北線',
    shortName: '南北',
    enName: 'Namboku Line',
    series: '5000形',
    colorHex: 0x00a854,
    glowHex: 0x10e87a,
    bodyHex: 0xe6edf4,
    stripeHex: 0x00a854,
    roofHex: 0xc2cedb,
    carsPerTrain: 6,
    carLength: 17.6,
    carWidth: 3.05,
    carHeight: 3.65,
    carGap: 0.7,
    trackGaugeHalf: 2.25,
    lateralShift: 0,
    trainCountPerDir: 4,
    speedMps: 44, // Visually lively scale speed (~2.2x real cruise)
    dwellSec: 2.2,
    shelterElevated: true, // Iconic aluminum snow-shelter viaduct from Minami-Hiragishi to Makomanai
    points: [
      { code: 'N01', name: '麻生',     major: true,  lat: 43.109106, lon: 141.338255, initGroundY: -10, relY: -11 },
      { code: 'N02', name: '北34条',   major: false, lat: 43.099883, lon: 141.342028, initGroundY: -9,  relY: -11 },
      { code: 'N03', name: '北24条',   major: true,  lat: 43.089811, lon: 141.344604, initGroundY: -7,  relY: -11 },
      { code: 'N04', name: '北18条',   major: false, lat: 43.081568, lon: 141.346686, initGroundY: -6,  relY: -11 },
      { code: 'N05', name: '北12条',   major: false, lat: 43.074829, lon: 141.348403, initGroundY: -4,  relY: -11 },
      { code: 'N06', name: 'さっぽろ', major: true,  lat: 43.066370, lon: 141.350299, initGroundY: -1,  relY: -11 },
      { code: 'N07', name: '大通',     major: true,  lat: 43.060550, lon: 141.351650, initGroundY:  0,  relY: -11 },
      { code: 'N08', name: 'すすきの', major: true,  lat: 43.055574, lon: 141.352749, initGroundY:  1,  relY: -11 },
      { code: 'N09', name: '中島公園', major: false, lat: 43.048892, lon: 141.354913, initGroundY:  3,  relY: -11 },
      { code: 'N10', name: '幌平橋',   major: false, lat: 43.040073, lon: 141.355886, initGroundY:  6,  relY: -13 },
      { code: 'N11', name: '中の島',   major: false, lat: 43.037727, lon: 141.360758, initGroundY:  8,  relY: -11 },
      { code: 'N12', name: '平岸',     major: true,  lat: 43.034569, lon: 141.368027, initGroundY: 11,  relY: -9  },
      // Portal emerging from underground onto the famous Namboku Line elevated shelter viaduct
      { lat: 43.030800, lon: 141.370900, initGroundY: 14, relY: 1.5, elevated: true },
      { code: 'N13', name: '南平岸',   major: true,  lat: 43.026794, lon: 141.371341, initGroundY: 17,  relY:  8.5, elevated: true },
      { code: 'N14', name: '澄川',     major: false, lat: 43.016820, lon: 141.367311, initGroundY: 25,  relY:  8.5, elevated: true },
      { code: 'N15', name: '自衛隊前', major: false, lat: 43.006232, lon: 141.364823, initGroundY: 32,  relY:  8.5, elevated: true },
      { code: 'N16', name: '真駒内',   major: true,  lat: 42.991203, lon: 141.358433, initGroundY: 40,  relY:  8.5, elevated: true },
    ],
  },

  // ==================== 2. SAPPORO SUBWAY: TOZAI LINE (東西線 — 19 STATIONS) ====================
  {
    id: 'tozai',
    group: 'subway',
    name: '東西線',
    shortName: '東西',
    enName: 'Tozai Line',
    series: '8000形',
    colorHex: 0xf39800,
    glowHex: 0xffb732,
    bodyHex: 0xe6edf4,
    stripeHex: 0xf39800,
    roofHex: 0xc2cedb,
    carsPerTrain: 7,
    carLength: 17.6,
    carWidth: 3.05,
    carHeight: 3.65,
    carGap: 0.7,
    trackGaugeHalf: 2.25,
    lateralShift: 0,
    trainCountPerDir: 5,
    speedMps: 46,
    dwellSec: 2.2,
    shelterElevated: false,
    points: [
      { code: 'T01', name: '宮の沢',       major: true,  lat: 43.089962, lon: 141.277170, initGroundY:  4, relY: -16 },
      { code: 'T02', name: '発寒南',       major: false, lat: 43.081732, lon: 141.289312, initGroundY:  4, relY: -16 },
      { code: 'T03', name: '琴似',         major: true,  lat: 43.075769, lon: 141.303853, initGroundY:  5, relY: -16 },
      { code: 'T04', name: '二十四軒',     major: false, lat: 43.070221, lon: 141.314093, initGroundY:  5, relY: -16 },
      { code: 'T05', name: '西28丁目',     major: false, lat: 43.060345, lon: 141.314522, initGroundY: 10, relY: -16 },
      { code: 'T06', name: '円山公園',     major: true,  lat: 43.055582, lon: 141.318863, initGroundY: 12, relY: -16 },
      { code: 'T07', name: '西18丁目',     major: false, lat: 43.057168, lon: 141.330204, initGroundY:  6, relY: -16 },
      { code: 'T08', name: '西11丁目',     major: false, lat: 43.058557, lon: 141.341036, initGroundY:  3, relY: -16 },
      { code: 'T09', name: '大通',         major: false, lat: 43.060550, lon: 141.353200, initGroundY:  0, relY: -16 },
      { code: 'T10', name: 'バスセンター前', major: false, lat: 43.061268, lon: 141.360473, initGroundY: -1, relY: -16 },
      { code: 'T11', name: '菊水',         major: false, lat: 43.057211, lon: 141.372831, initGroundY:  0, relY: -16 },
      { code: 'T12', name: '東札幌',       major: true,  lat: 43.051645, lon: 141.384605, initGroundY: -2, relY: -16 },
      { code: 'T13', name: '白石',         major: true,  lat: 43.046343, lon: 141.395505, initGroundY: -2, relY: -16 },
      { code: 'T14', name: '南郷7丁目',    major: false, lat: 43.040091, lon: 141.411759, initGroundY:  0, relY: -16 },
      { code: 'T15', name: '南郷13丁目',   major: false, lat: 43.035783, lon: 141.422697, initGroundY:  3, relY: -16 },
      { code: 'T16', name: '南郷18丁目',   major: false, lat: 43.030229, lon: 141.435196, initGroundY:  6, relY: -16 },
      { code: 'T17', name: '大谷地',       major: true,  lat: 43.027900, lon: 141.453081, initGroundY: 10, relY: -16 },
      { code: 'T18', name: 'ひばりが丘',   major: false, lat: 43.032175, lon: 141.464638, initGroundY: 14, relY: -16 },
      { code: 'T19', name: '新さっぽろ',   major: true,  lat: 43.038788, lon: 141.472470, initGroundY: 16, relY: -16 },
    ],
  },

  // ==================== 3. SAPPORO SUBWAY: TOHO LINE (東豊線 — 14 STATIONS) ====================
  {
    id: 'toho',
    group: 'subway',
    name: '東豊線',
    shortName: '東豊',
    enName: 'Toho Line',
    series: '9000形',
    colorHex: 0x0088d6,
    glowHex: 0x38c2ff,
    bodyHex: 0xe6edf4,
    stripeHex: 0x0088d6,
    roofHex: 0xc2cedb,
    carsPerTrain: 4,
    carLength: 17.6,
    carWidth: 3.05,
    carHeight: 3.65,
    carGap: 0.7,
    trackGaugeHalf: 2.25,
    lateralShift: 0,
    trainCountPerDir: 4,
    speedMps: 44,
    dwellSec: 2.2,
    shelterElevated: false,
    points: [
      { code: 'H01', name: '栄町',         major: true,  lat: 43.112995, lon: 141.367142, initGroundY: -14, relY: -21 },
      { code: 'H02', name: '新道東',       major: false, lat: 43.104663, lon: 141.369086, initGroundY: -13, relY: -21 },
      { code: 'H03', name: '元町',         major: true,  lat: 43.094387, lon: 141.371587, initGroundY: -12, relY: -21 },
      { code: 'H04', name: '環状通東',     major: true,  lat: 43.082166, lon: 141.374643, initGroundY: -10, relY: -21 },
      { lat: 43.079200, lon: 141.372000, initGroundY: -9, relY: -21 }, // Smooth bend onto Kita 13-jo dori
      { code: 'H05', name: '東区役所前',   major: false, lat: 43.078197, lon: 141.364769, initGroundY:  -8, relY: -21 },
      { code: 'H06', name: '北13条東',     major: false, lat: 43.076890, lon: 141.354851, initGroundY:  -6, relY: -21 },
      { lat: 43.073400, lon: 141.352200, initGroundY: -4, relY: -21 }, // Smooth bend south into Sapporo East
      { code: 'H07', name: 'さっぽろ',     major: false, lat: 43.066900, lon: 141.353200, initGroundY:  -1, relY: -21 },
      { code: 'H08', name: '大通',         major: false, lat: 43.060900, lon: 141.354700, initGroundY:   0, relY: -21 },
      { code: 'H09', name: '豊水すすきの', major: true,  lat: 43.055008, lon: 141.356838, initGroundY:   1, relY: -21 },
      { code: 'H10', name: '学園前',       major: false, lat: 43.047448, lon: 141.369090, initGroundY:   6, relY: -21 },
      { code: 'H11', name: '豊平公園',     major: true,  lat: 43.041929, lon: 141.376573, initGroundY:  10, relY: -21 },
      { code: 'H12', name: '美園',         major: false, lat: 43.036338, lon: 141.385756, initGroundY:  18, relY: -21 },
      { code: 'H13', name: '月寒中央',     major: false, lat: 43.030553, lon: 141.396263, initGroundY:  30, relY: -21 },
      { code: 'H14', name: '福住',         major: true,  lat: 43.021621, lon: 141.403105, initGroundY:  45, relY: -21 },
    ],
  },

  // ==================== 4. JR HOKKAIDO: HAKODATE MAIN LINE (JR函館本線) ====================
  {
    id: 'jr-hakodate',
    group: 'jr',
    name: 'JR函館本線',
    shortName: '函館本線',
    enName: 'JR Hakodate Line',
    series: '733系・特急カムイ',
    colorHex: 0x22b14c,
    glowHex: 0x4ade80,
    bodyHex: 0xd9e2ec,
    stripeHex: 0x22b14c,
    roofHex: 0x8e9bab,
    carsPerTrain: 6,
    carLength: 19.6,
    carWidth: 2.95,
    carHeight: 3.9,
    carGap: 0.65,
    trackGaugeHalf: 2.3,
    lateralShift: 0,
    trainCountPerDir: 4,
    speedMps: 56,
    dwellSec: 2.5,
    shelterElevated: false,
    points: [
      { code: 'S10', name: 'ほしみ',     major: false, lat: 43.133750, lon: 141.191390, initGroundY: -10, relY: 1.0 },
      { code: 'S09', name: '星置',       major: false, lat: 43.132317, lon: 141.210881, initGroundY:  -9, relY: 1.0 },
      { code: 'S08', name: '稲穂',       major: false, lat: 43.128069, lon: 141.222853, initGroundY:  -6, relY: 1.0 },
      { code: 'S07', name: '手稲',       major: true,  lat: 43.120158, lon: 141.243789, initGroundY:  -3, relY: 1.0 },
      { code: 'S06', name: '稲積公園',   major: false, lat: 43.111972, lon: 141.257089, initGroundY:  -4, relY: 1.0 },
      { code: 'S05', name: '発寒',       major: false, lat: 43.099794, lon: 141.277267, initGroundY:  -3, relY: 1.0 },
      { code: 'S04', name: '発寒中央',   major: false, lat: 43.089564, lon: 141.294128, initGroundY:  -2, relY: 1.2 },
      { code: 'S03', name: 'JR琴似',     major: true,  lat: 43.081522, lon: 141.307569, initGroundY:   0, relY: 2.8, elevated: true },
      { lat: 43.074800, lon: 141.318800, initGroundY: -2, relY: 7.5, elevated: true }, // Elevated approach into Soen
      { code: 'S02', name: '桑園',       major: true,  lat: 43.070981, lon: 141.331358, initGroundY:  -3, relY: 8.2, elevated: true },
      { code: '01',  name: 'JR札幌駅',   major: true,  lat: 43.068610, lon: 141.350778, initGroundY:  -2, relY: 8.6, elevated: true },
      { lat: 43.070150, lon: 141.362200, initGroundY: -4, relY: 8.0, elevated: true }, // Elevated east viaduct
      { code: 'H02', name: '苗穂',       major: true,  lat: 43.068580, lon: 141.373313, initGroundY:  -5, relY: 3.4, elevated: true },
      { lat: 43.066350, lon: 141.387500, initGroundY: -5, relY: 5.5, elevated: true }, // Toyohira River Railway Bridge
      { code: 'H03', name: 'JR白石',     major: true,  lat: 43.054917, lon: 141.413750, initGroundY:  -5, relY: 1.2 },
      { lat: 43.050400, lon: 141.428500, initGroundY: -5, relY: 1.2 }, // Shiroishi east junction
      { code: 'A04', name: '厚別',       major: false, lat: 43.045094, lon: 141.463683, initGroundY:  -3, relY: 1.2 },
      { code: 'A05', name: '森林公園',   major: true,  lat: 43.056489, lon: 141.481281, initGroundY:  -1, relY: 2.2, elevated: true },
    ],
  },

  // ==================== 5. JR HOKKAIDO: CHITOSE LINE / RAPID AIRPORT (JR千歳線・快速エアポート) ====================
  {
    id: 'jr-chitose',
    group: 'jr',
    name: 'JR千歳線 (快速エアポート)',
    shortName: '千歳線',
    enName: 'JR Chitose Line',
    series: '733系快速エアポート・特急北斗',
    colorHex: 0x2589e6,
    glowHex: 0x60a5fa,
    bodyHex: 0xe2e8f0,
    stripeHex: 0x1d78d8,
    roofHex: 0x94a3b8,
    carsPerTrain: 6,
    carLength: 19.6,
    carWidth: 2.95,
    carHeight: 3.9,
    carGap: 0.65,
    trackGaugeHalf: 2.3,
    lateralShift: 6.2, // Parallel south-side tracks along the shared Sapporo-Naebo-Shiroishi quad-track corridor
    trainCountPerDir: 3,
    speedMps: 62,
    dwellSec: 2.4,
    shelterElevated: false,
    points: [
      { code: '01',  name: 'JR札幌駅', major: false, lat: 43.068610, lon: 141.350778, initGroundY: -2, relY: 8.6, elevated: true },
      { lat: 43.070150, lon: 141.362200, initGroundY: -4, relY: 8.0, elevated: true },
      { code: 'H02', name: '苗穂',     major: false, lat: 43.068580, lon: 141.373313, initGroundY: -5, relY: 3.4, elevated: true },
      { lat: 43.066350, lon: 141.387500, initGroundY: -5, relY: 5.5, elevated: true },
      { code: 'H03', name: 'JR白石',   major: false, lat: 43.054917, lon: 141.413750, initGroundY: -5, relY: 1.2 },
      { code: 'H04', name: '平和',     major: false, lat: 43.046855, lon: 141.438642, initGroundY: -1, relY: 1.2 },
      { code: 'H05', name: 'JR新札幌', major: true,  lat: 43.038789, lon: 141.472469, initGroundY: 16, relY: 8.8, elevated: true },
      { code: 'H06', name: '上野幌',   major: false, lat: 43.016436, lon: 141.486889, initGroundY: 28, relY: 1.6 },
    ],
  },

  // ==================== 6. JR HOKKAIDO: GAKUEN-TOSHI / SASSHO LINE (JR学園都市線) ====================
  {
    id: 'jr-gakuen',
    group: 'jr',
    name: 'JR学園都市線',
    shortName: '学園都市線',
    enName: 'JR Gakuen-Toshi Line',
    series: '733系・721系',
    colorHex: 0x059669,
    glowHex: 0x34d399,
    bodyHex: 0xdce4ee,
    stripeHex: 0x10b981,
    roofHex: 0x8e9bab,
    carsPerTrain: 4,
    carLength: 19.4,
    carWidth: 2.95,
    carHeight: 3.85,
    carGap: 0.65,
    trackGaugeHalf: 2.25,
    lateralShift: -6.2, // Parallel north-side tracks out of Sapporo & Soen
    trainCountPerDir: 3,
    speedMps: 52,
    dwellSec: 2.3,
    shelterElevated: false,
    points: [
      { code: '01',  name: 'JR札幌駅',       major: false, lat: 43.068610, lon: 141.350778, initGroundY:  -2, relY: 8.6, elevated: true },
      { code: 'S02', name: '桑園',           major: false, lat: 43.070981, lon: 141.331358, initGroundY:  -3, relY: 8.2, elevated: true },
      { lat: 43.075200, lon: 141.321800, initGroundY: -4, relY: 7.8, elevated: true }, // Smooth northward viaduct bend
      { code: 'G03', name: '八軒',           major: false, lat: 43.085956, lon: 141.319084, initGroundY:  -6, relY: 7.8, elevated: true },
      { code: 'G04', name: '新川',           major: false, lat: 43.098193, lon: 141.323452, initGroundY:  -9, relY: 7.6, elevated: true },
      { code: 'G05', name: '新琴似',         major: true,  lat: 43.113092, lon: 141.335253, initGroundY: -11, relY: 7.5, elevated: true },
      { code: 'G06', name: '太平',           major: false, lat: 43.123863, lon: 141.349098, initGroundY: -13, relY: 1.2 },
      { code: 'G07', name: '百合が原',       major: false, lat: 43.131403, lon: 141.360722, initGroundY: -14, relY: 1.2 },
      { code: 'G08', name: '篠路',           major: true,  lat: 43.145144, lon: 141.364382, initGroundY: -15, relY: 1.2 },
      { code: 'G09', name: '拓北',           major: false, lat: 43.155596, lon: 141.381116, initGroundY: -15, relY: 1.2 },
      { code: 'G10', name: 'あいの里教育大', major: false, lat: 43.155283, lon: 141.398320, initGroundY: -15, relY: 1.2 },
      { code: 'G11', name: 'あいの里公園',   major: true,  lat: 43.161220, lon: 141.413273, initGroundY: -16, relY: 1.2 },
    ],
  },

  // ==================== 7. SAPPORO STREETCAR: LOOP LINE (札幌市電 環状線 — ALL 24 STOPS) ====================
  {
    id: 'tram',
    group: 'tram',
    closed: true,
    name: '札幌市電（環状線）',
    shortName: '市電',
    enName: 'Sapporo Streetcar Loop',
    series: 'A1200形ポラリス・3300形',
    colorHex: 0x84cc16,
    glowHex: 0xa3e635,
    bodyHex: 0x1e4d38,
    stripeHex: 0x84cc16,
    roofHex: 0xd8e4dc,
    carsPerTrain: 3,   // 3-section low-floor articulated streetcar (Polaris A1200 ~17m total!)
    carLength: 5.5,
    carWidth: 2.32,
    carHeight: 3.15,
    carGap: 0.32,
    trackGaugeHalf: 1.65,
    lateralShift: 0,
    trainCountPerDir: 5, // 5 inner-loop (内回り) + 5 outer-loop (外回り) = 10 streetcars!
    speedMps: 22,
    dwellSec: 1.6,
    shelterElevated: false,
    points: [
      // Minami 1-jo Street (Westbound: Nishi 4 -> Nishi 15)
      { code: 'SC01', name: '西4丁目',          major: true,  lat: 43.058894, lon: 141.351937, initGroundY:  0, relY: 0.16 },
      { code: 'SC02', name: '西8丁目',          major: false, lat: 43.058134, lon: 141.346208, initGroundY:  2, relY: 0.16 },
      { code: 'SC03', name: '中央区役所前',      major: false, lat: 43.057490, lon: 141.340914, initGroundY:  4, relY: 0.16 },
      { code: 'SC04', name: '西15丁目',         major: true,  lat: 43.056680, lon: 141.334450, initGroundY:  6, relY: 0.16 },
      { lat: 43.056420, lon: 141.334180, initGroundY: 6, relY: 0.16 }, // Corner: Minami 1-jo -> Nishi 15-chome south
      // Nishi 15-chome / Fukuzumi-Soka (Southbound)
      { code: 'SC05', name: '西線6条',          major: false, lat: 43.051280, lon: 141.335031, initGroundY:  9, relY: 0.16 },
      { code: 'SC06', name: '西線9条旭山公園通', major: false, lat: 43.047942, lon: 141.335457, initGroundY: 11, relY: 0.16 },
      { code: 'SC07', name: '西線11条',         major: false, lat: 43.044319, lon: 141.335914, initGroundY: 14, relY: 0.16 },
      { code: 'SC08', name: '西線14条',         major: false, lat: 43.040290, lon: 141.336436, initGroundY: 17, relY: 0.16 },
      { code: 'SC09', name: '西線16条',         major: false, lat: 43.036611, lon: 141.336894, initGroundY: 20, relY: 0.16 },
      { code: 'SC10', name: 'ロープウェイ入口',  major: true,  lat: 43.033581, lon: 141.337293, initGroundY: 22, relY: 0.16 },
      { code: 'SC11', name: '電車事業所前',      major: false, lat: 43.030592, lon: 141.337667, initGroundY: 24, relY: 0.16 },
      { lat: 43.029950, lon: 141.338150, initGroundY: 24, relY: 0.16 }, // Corner: Nishi 14-chome -> Minami 22-jo east
      // Minami 22-jo Street (Eastbound)
      { code: 'SC12', name: '中央図書館前',      major: true,  lat: 43.030533, lon: 141.341412, initGroundY: 22, relY: 0.16 },
      { code: 'SC13', name: '石山通',           major: false, lat: 43.030722, lon: 141.344222, initGroundY: 20, relY: 0.16 },
      { code: 'SC14', name: '東屯田通',         major: false, lat: 43.031000, lon: 141.348610, initGroundY: 17, relY: 0.16 },
      { lat: 43.031420, lon: 141.351980, initGroundY: 15, relY: 0.16 }, // Corner: Minami 22-jo -> Nishi 7-chome north
      // Nishi 7-chome Street (Northbound)
      { code: 'SC15', name: '幌南小学校前',      major: false, lat: 43.032306, lon: 141.351917, initGroundY: 14, relY: 0.16 },
      { code: 'SC16', name: '山鼻19条',         major: false, lat: 43.035083, lon: 141.351556, initGroundY: 12, relY: 0.16 },
      { code: 'SC17', name: '静修学園前',        major: false, lat: 43.038389, lon: 141.351167, initGroundY: 10, relY: 0.16 },
      { code: 'SC18', name: '行啓通',           major: true,  lat: 43.041611, lon: 141.350750, initGroundY:  8, relY: 0.16 },
      { code: 'SC19', name: '中島公園通',        major: false, lat: 43.045750, lon: 141.350194, initGroundY:  5, relY: 0.16 },
      { code: 'SC20', name: '山鼻9条',          major: false, lat: 43.048944, lon: 141.349778, initGroundY:  4, relY: 0.16 },
      { code: 'SC21', name: '東本願寺前',        major: false, lat: 43.051694, lon: 141.349528, initGroundY:  3, relY: 0.16 },
      { code: 'SC22', name: '資生館小学校前',    major: false, lat: 43.055056, lon: 141.349111, initGroundY:  2, relY: 0.16 },
      { lat: 43.055320, lon: 141.349420, initGroundY: 2, relY: 0.16 }, // Corner: Nishi 7-chome -> Minami 4-jo east
      // Minami 4-jo (Susukino) & Ekimae-dori (Northbound back to Nishi 4)
      { code: 'SC23', name: 'すすきの',         major: false, lat: 43.055694, lon: 141.353278, initGroundY:  1, relY: 0.16 },
      { code: 'SC24', name: '狸小路',           major: true,  lat: 43.057278, lon: 141.352917, initGroundY:  1, relY: 0.16 },
      { lat: 43.058940, lon: 141.352540, initGroundY: 0, relY: 0.16 }, // Corner: Ekimae-dori -> Minami 1-jo west (4-chome)
    ],
  },
];

/**
 * Station catalog for the rail panel list UI.
 * - Per-line arrays keep route order
 * - `all` is unique-by-name (first occurrence wins across namboku → tozai → toho → JR)
 * - `jr` is unique-by-name across the three JR corridors
 */
export function buildStationCatalog() {
  const catalog = {
    all: [],
    namboku: [],
    tozai: [],
    toho: [],
    jr: [],
    tram: [],
  };
  const seenAll = new Set();
  const seenJr = new Set();

  for (const line of RAIL_LINES) {
    const filterKey = line.group === 'jr' ? 'jr' : line.id;
    for (const pt of line.points) {
      if (!pt.name) continue;
      const item = {
        name: pt.name,
        code: pt.code || '',
        lineId: line.id,
        lineName: line.name,
        shortName: line.shortName,
        filterKey,
        colorHex: line.colorHex,
        lat: pt.lat,
        lon: pt.lon,
        relY: pt.relY,
        initGroundY: pt.initGroundY ?? 0,
        major: Boolean(pt.major),
        isSubway: line.group === 'subway',
        isTram: line.group === 'tram',
      };

      if (filterKey === 'jr') {
        if (!seenJr.has(pt.name)) {
          seenJr.add(pt.name);
          catalog.jr.push(item);
        }
      } else {
        catalog[filterKey].push(item);
      }

      if (!seenAll.has(pt.name)) {
        seenAll.add(pt.name);
        catalog.all.push(item);
      }
    }
  }
  return catalog;
}

export const STATION_CATALOG = buildStationCatalog();

// ==================== QUICK-JUMP RAILWAY CAMERA VIEWPOINTS ====================
function makeRailView(id, label, title, sub, lat, lon, tgtY, eyeDx, eyeDy, eyeDz, suggestXray = false) {
  const tgt = latLonToGround(lat, lon, tgtY);
  const eye = new THREE.Vector3(tgt.x + eyeDx, tgtY + eyeDy, tgt.z + eyeDz);
  return { id, label, title, sub, eye, tgt, suggestXray };
}

export const RAIL_VIEWPOINTS = [
  makeRailView(
    'jr-sapporo',
    'JR札幌駅高架',
    'JR SAPPORO STATION · ELEVATED RAIL HUB',
    'JR函館本線・千歳線・学園都市線の高架発着と地下の南北線・東豊線',
    43.06861, 141.35078, 12,
    -250, 118, 225,
    false
  ),
  makeRailView(
    'odori-hub',
    '大通3線交差',
    'ODORI SUBWAY INTERCHANGE · 3 LINES',
    '札幌市営地下鉄 全3路線（南北・東西・東豊）が立体交差する大通駅直下',
    43.06065, 141.35320, -4,
    235, 145, 250,
    true
  ),
  makeRailView(
    'namboku-viaduct',
    '南北線高架(南平岸〜真駒内)',
    'NAMBOKU LINE · ELEVATED SNOW-SHELTER',
    '平岸から地上へ出た南北線シェルター高架区間（南平岸・澄川・自衛隊前・真駒内）',
    43.01850, 141.36750, 32,
    310, 120, 210,
    false
  ),
  makeRailView(
    'shin-sapporo',
    '新さっぽろ(JR×東西線)',
    'SHIN-SAPPORO · JR CHITOSE × TOZAI SUBWAY',
    '厚別区・新札幌の高架JR千歳線（快速エアポート）と地下の東西線終点',
    43.03879, 141.47247, 22,
    -260, 130, 230,
    false
  ),
  makeRailView(
    'tram-odori',
    '市電・西4〜すすきの',
    'SAPPORO STREETCAR · NISHI 4 — TANUKIKOJI — SUSUKINO',
    '札幌市電 環状線（西4丁目・狸小路・すすきの）サイドリザベーション区間',
    43.05730, 141.35210, 8,
    185, 88, 175,
    false
  ),
  makeRailView(
    'tram-moiwa',
    '市電・ロープウェイ入口',
    'SAPPORO STREETCAR · MT. MOIWA ROPEWAY LOOP',
    '藻岩山麓を巡る札幌市電 環状線（ロープウェイ入口・電車事業所前・中央図書館前）',
    43.03220, 141.33950, 26,
    275, 115, 220,
    false
  ),
  makeRailView(
    'moiwa-ropeway',
    '藻岩山ロープウェー',
    'MT. MOIWA ROPEWAY · AERIAL TRAM',
    '山麓駅から中腹駅へ向かうロープウェーと、山頂駅へ続くミニケーブルカー',
    // Mid span: stand east of the cable so the NE→SW ascent (山麓→中腹) reads in profile
    43.0268, 141.3292, 300,
    180, 70, -40,
    false
  ),
];
