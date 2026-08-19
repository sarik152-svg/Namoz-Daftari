import React, { useState, useEffect, useMemo } from "react";
import {
  Sunrise, Sun, CloudSun, Sunset, Moon, Star, Check, RefreshCw, BookOpen, BarChart3,
  Flame, ClipboardList, Pencil, ChevronLeft, ChevronRight, MapPin, Award, Quote,
  RotateCcw, Gift, Info, Clock, UserPlus, Trash2, Lock, ArrowLeft, Users
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

/* ────────────────────────── PALITRA ────────────────────────── */
const C = {
  night: "#0D1220", panel: "#151D2E", panel2: "#1B2436", line: "#26314A",
  brass: "#C9A227", jade: "#4CAF8B", clay: "#C9584B", text: "#E7EBF3", mut: "#8895AE",
};
const PALETTE = ["#C9A227", "#4CAF8B", "#6C8CD5", "#C97BC0", "#E0885A", "#58BFC9", "#9BC95E", "#D96C8B"];
const serif = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
const sans = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";

/* ────────────────────────── SHAHARLAR ────────────────────────── */
const CITIES = [
  { n: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Samarqand", lat: 39.627, lng: 66.975, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Buxoro", lat: 39.767, lng: 64.423, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Andijon", lat: 40.783, lng: 72.333, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Farg'ona", lat: 40.386, lng: 71.787, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Namangan", lat: 40.998, lng: 71.673, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Qarshi", lat: 38.86, lng: 65.79, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Nukus", lat: 42.46, lng: 59.61, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Urganch", lat: 41.55, lng: 60.63, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Termiz", lat: 37.22, lng: 67.28, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Navoiy", lat: 40.104, lng: 65.373, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Jizzax", lat: 40.116, lng: 67.842, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Guliston", lat: 40.489, lng: 68.783, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Dubay", lat: 25.2048, lng: 55.2708, tz: 4, asr: 1, fa: 18.2, ia: 18.2 },
  { n: "Abu-Dabi", lat: 24.453, lng: 54.377, tz: 4, asr: 1, fa: 18.2, ia: 18.2 },
  { n: "Sharja", lat: 25.346, lng: 55.42, tz: 4, asr: 1, fa: 18.2, ia: 18.2 },
  { n: "Makka", lat: 21.3891, lng: 39.8579, tz: 3, asr: 1, fa: 18.5, ia: 18.5 },
  { n: "Madina", lat: 24.47, lng: 39.61, tz: 3, asr: 1, fa: 18.5, ia: 18.5 },
  { n: "Jidda", lat: 21.543, lng: 39.173, tz: 3, asr: 1, fa: 18.5, ia: 18.5 },
  { n: "Riyod", lat: 24.713, lng: 46.675, tz: 3, asr: 1, fa: 18.5, ia: 18.5 },
  { n: "Doha", lat: 25.286, lng: 51.531, tz: 3, asr: 1, fa: 18, ia: 18 },
  { n: "Istanbul", lat: 41.008, lng: 28.978, tz: 3, asr: 2, fa: 18, ia: 17 },
  { n: "Moskva", lat: 55.756, lng: 37.617, tz: 3, asr: 2, fa: 18, ia: 17 },
  { n: "Almati", lat: 43.238, lng: 76.889, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Bishkek", lat: 42.874, lng: 74.612, tz: 6, asr: 2, fa: 18, ia: 18 },
  { n: "Dushanbe", lat: 38.56, lng: 68.787, tz: 5, asr: 2, fa: 18, ia: 18 },
  { n: "Kuala-Lumpur", lat: 3.139, lng: 101.687, tz: 8, asr: 1, fa: 20, ia: 18 },
  { n: "Seul", lat: 37.567, lng: 126.978, tz: 9, asr: 2, fa: 18, ia: 17 },
  { n: "London", lat: 51.507, lng: -0.128, tz: 1, asr: 2, fa: 18, ia: 17 },
  { n: "Berlin", lat: 52.52, lng: 13.405, tz: 2, asr: 2, fa: 18, ia: 17 },
  { n: "Nyu-York", lat: 40.713, lng: -74.006, tz: -4, asr: 2, fa: 18, ia: 17 },
];

/* ────────────────────────── BALL QOIDALARI ────────────────────────── */
const P_QAZO = 0.25, P_MISS = 1, TASK_AT = 4, STREAK_STEP = 10, BONUS_MIN = 2, BONUS_MAX = 5;

/* ────────────────────────── VAQT HISOBI ────────────────────────── */
const D2R = Math.PI / 180;
const sinD = (d) => Math.sin(d * D2R), cosD = (d) => Math.cos(d * D2R), tanD = (d) => Math.tan(d * D2R);
const asinD = (x) => Math.asin(x) / D2R, acosD = (x) => Math.acos(x) / D2R;
const atan2D = (y, x) => Math.atan2(y, x) / D2R, acotD = (x) => Math.atan(1 / x) / D2R;
const fix = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };
const fixAng = (a) => fix(a, 360), fixHr = (a) => fix(a, 24);

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function sunPos(jd) {
  const D = jd - 2451545.0;
  const g = fixAng(357.529 + 0.98560028 * D), q = fixAng(280.459 + 0.98564736 * D);
  const L = fixAng(q + 1.915 * sinD(g) + 0.02 * sinD(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = fixHr(atan2D(cosD(e) * sinD(L), cosD(L)) / 15);
  return { decl: asinD(sinD(e) * sinD(L)), eqt: q / 15 - RA };
}
function calcTimes(date, cfg) {
  const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - cfg.lng / (15 * 24);
  const midDay = (t) => fixHr(12 - sunPos(jd + t).eqt);
  const angleTime = (angle, t, ccw) => {
    const decl = sunPos(jd + t).decl;
    let x = (-sinD(angle) - sinD(decl) * sinD(cfg.lat)) / (cosD(decl) * cosD(cfg.lat));
    x = Math.max(-1, Math.min(1, x));
    return midDay(t) + (ccw ? -1 : 1) * (acosD(x) / 15);
  };
  const asrTime = (f, t) => {
    const decl = sunPos(jd + t).decl;
    return angleTime(-acotD(f + tanD(Math.abs(cfg.lat - decl))), t, false);
  };
  let t = { fajr: 5 / 24, sunrise: 6 / 24, dhuhr: 12 / 24, asr: 13 / 24, maghrib: 18 / 24, isha: 19 / 24 };
  for (let i = 0; i < 3; i++) {
    t = {
      fajr: angleTime(cfg.fa, t.fajr, true) / 24,
      sunrise: angleTime(0.833, t.sunrise, true) / 24,
      dhuhr: (midDay(t.dhuhr) + 1 / 60) / 24,
      asr: asrTime(cfg.asr, t.asr) / 24,
      maghrib: angleTime(0.833, t.maghrib, false) / 24,
      isha: angleTime(cfg.ia, t.isha, false) / 24,
    };
  }
  const off = cfg.tz - cfg.lng / 15;
  const o = {}; for (const k in t) o[k] = fixHr(t[k] * 24 + off);
  return o;
}
function daySchedule(date, cfg) {
  const T = calcTimes(date, cfg);
  const prev = new Date(date); prev.setDate(prev.getDate() - 1);
  const P = calcTimes(prev, cfg);
  const nightLen = 24 - P.maghrib + T.fajr;
  return {
    tahajjud: fixHr(P.maghrib + (2 / 3) * nightLen), bomdod: T.fajr, peshin: T.dhuhr,
    asr: T.asr, shom: T.maghrib, xufton: T.isha,
    endTahajjud: T.fajr, endBomdod: T.sunrise, endPeshin: T.asr,
    endAsr: T.maghrib, endShom: T.isha, endXufton: T.fajr,
  };
}
const hm = (dec) => {
  if (dec == null || isNaN(dec)) return "--:--";
  const m = fix(Math.round(dec * 60), 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const toMin = (s) => { const [a, b] = String(s).split(":").map(Number); return a * 60 + b; };
const diffMin = (a, b) => { let d = toMin(b) - toMin(a); if (d < -720) d += 1440; if (d > 720) d -= 1440; return d; };
const winLen = (s, e) => { let d = toMin(e) - toMin(s); if (d <= 0) d += 1440; return d; };
const inWin = (n, s, e) => (e > s ? n >= s && n < e : n >= s || n < e);

/* ────────────────────────── NAMOZLAR ────────────────────────── */
const PRAYERS = [
  { k: "tahajjud", n: "Tahajjud", Icon: Star, fard: false },
  { k: "bomdod", n: "Bomdod", Icon: Sunrise, fard: true },
  { k: "peshin", n: "Peshin", Icon: Sun, fard: true },
  { k: "asr", n: "Asr", Icon: CloudSun, fard: true },
  { k: "shom", n: "Shom", Icon: Sunset, fard: true },
  { k: "xufton", n: "Xufton", Icon: Moon, fard: true },
];
const SK = { tahajjud: "tahajjud", bomdod: "bomdod", peshin: "peshin", asr: "asr", shom: "shom", xufton: "xufton" };
const EK = { tahajjud: "endTahajjud", bomdod: "endBomdod", peshin: "endPeshin", asr: "endAsr", shom: "endShom", xufton: "endXufton" };
const STATUS = {
  ontime: { label: "Vaqtida", ball: 0, color: C.jade },
  qazo: { label: "Qazo (kun ichida)", ball: -P_QAZO, color: C.brass },
  late: { label: "Keyingi kunda qazo", ball: -P_MISS, color: C.clay },
  missed: { label: "O'qilmagan", ball: -P_MISS, color: C.clay },
};

/* ────────────────────────── SUNNATLAR ────────────────────────── */
const SUNNATS = [
  { t: "Salomni birinchi berish", d: "Kichik kattaga, yurgan o'tirganga, ozchilik ko'pchilikka salom beradi. Salom — muhabbatning kaliti.", a: "Bugun kamida 5 kishiga birinchi bo'lib salom bering." },
  { t: "Har ishni o'ngdan boshlash", d: "Payg'ambarimiz (s.a.v.) poyabzal kiyish, taharat olish, taomlanish va tarashda o'ng tomonni ma'qul ko'rardilar.", a: "Bugun har bir ishni ongli ravishda o'ngdan boshlang." },
  { t: "Bismillah bilan boshlash", d: "Taomdan avval «Bismillah», unutilsa «Bismillahi avvalahu va oxirahu» aytiladi. So'ngida «Alhamdulillah».", a: "Har ovqatda ovoz chiqarib ayting — bola-chaqa ham eshitsin." },
  { t: "Qorinning uchdan biri", d: "Odam farzandi qorindan yomonroq idishni to'ldirmagan: uchdan biri taom, uchdan biri suv, uchdan biri nafas uchun.", a: "Bugun to'yishga bir qoshiq qolganda dasturxondan turing." },
  { t: "Suvni uch nafasda ichish", d: "Suv o'tirib, uch marta nafas olib, shukr bilan ichiladi.", a: "Bugun har ichganda uch nafasga bo'ling." },
  { t: "Misvok (tish tozaligi)", d: "«Ummatimga og'ir bo'lmaganda edi, har namoz oldidan misvokni buyurar edim.»", a: "Kamida ikki vaqt namozdan oldin tish tozalang." },
  { t: "Uyqu odobi", d: "O'ng yonboshga yotib, qo'lni yuz ostiga qo'yib, taharat bilan uxlash sunnat.", a: "Bugun taharat bilan, o'ng yonboshda yoting." },
  { t: "Yotishdan oldin himoya", d: "Oyatul Kursi, Ixlos, Falaq, Nos — o'qib, kaftga puflab, badanga surtiladi.", a: "Bugun kechqurun uch marta takrorlang." },
  { t: "Juma odobi", d: "G'usl, toza kiyim, xushbo'ylik, erta borish va Kahf surasini o'qish.", a: "Yaqin jumaga rejani bugundan yozib qo'ying." },
  { t: "Dushanba-payshanba ro'zasi", d: "Amallar shu ikki kunda ko'tariladi, Payg'ambarimiz ro'za tutishni yaxshi ko'rar edilar.", a: "Kelasi payshanbani belgilab qo'ying." },
  { t: "Ayyomul biyz ro'zasi", d: "Har oyning 13, 14, 15-kunlari ro'za tutish — butun umr ro'za tutgandek.", a: "Kalendarga uch kunni belgilang." },
  { t: "Ishroq namozi", d: "Bomdodni jamoat bilan o'qib, quyosh chiqquncha zikrda o'tirib, so'ng ikki rakat o'qigan kishiga to'liq haj va umra savobi bor.", a: "Bugun bomdoddan keyin 20 daqiqa o'tiring." },
  { t: "Duho namozi", d: "Har bir bo'g'in uchun sadaqa lozim — ikki rakat duho shuning o'rnini bosadi.", a: "Peshingacha 2-4 rakat duho o'qing." },
  { t: "Namozdan keyingi tasbeh", d: "33 Subhanalloh, 33 Alhamdulillah, 34 Allohu akbar.", a: "Bugun besh vaqtda ham to'liq bajaring." },
  { t: "Oyatul Kursi", d: "Har farz namozdan keyin o'qigan kishini jannatdan faqat o'lim to'sadi.", a: "Har namozdan keyin qoldirmang." },
  { t: "Tahajjud", d: "Farzdan keyingi eng afzal namoz — tun namozi. Kechaning oxirgi uchdan biri duo qabul bo'ladigan payt.", a: "Bugun kechada budilnik qo'ying." },
  { t: "Vitrni oxirga qoldirish", d: "Tunda uyg'onishga ishonchi bor kishi vitrni oxiriga qoldirsin.", a: "Bugun vitrni tahajjuddan keyin o'qing." },
  { t: "Aksirish odobi", d: "Aksirgan «Alhamdulillah», eshitgan «Yarhamukalloh», u esa «Yahdikumulloh va yuslih balakum» deydi.", a: "Bugun bu duolarni yodlab oling." },
  { t: "Bemorni yo'qlash", d: "Bemorni yo'qlagan kishi qaytguncha jannat mevalari ichida bo'ladi.", a: "Bir kasal tanishingizga qo'ng'iroq qiling yoki boring." },
  { t: "Qo'l berib ko'rishish", d: "Ikki musulmon ko'rishsa, ajralmasdan avval gunohlari kechiriladi.", a: "Bugun samimiy, ikki qo'llab ko'rishing." },
  { t: "Tabassum — sadaqa", d: "«Birodaringga tabassum qilishing ham sadaqadir.»", a: "Bugun uydagilarga birinchi bo'lib tabassum qiling." },
  { t: "Qo'shni haqqi", d: "Sho'rva pishirsang suvini ko'paytir va qo'shningga ulash.", a: "Bugun qo'shningizga hol so'rab kiring." },
  { t: "Ota-ona haqqi", d: "Alloh roziligi ota-ona roziligida. Duolari qaytarilmaydi.", a: "Bugun ota-onangizga qo'ng'iroq qiling va duo so'rang." },
  { t: "G'azabni bosish", d: "G'azablansang: a'uzu ayt, tik tursang o'tir, o'tirgan bo'lsang yonboshla, taharat ol.", a: "Bugun bir marta jim qolib, g'azabni yutib yuboring." },
  { t: "Istixora", d: "Har muhim ishda ikki rakat o'qib, Allohdan yaxshisini so'rash.", a: "Hozirgi bir qaroringiz uchun istixora qiling." },
  { t: "Uydan chiqish duosi", d: "«Bismillahi tavakkaltu alalloh, va la havla va la quvvata illa billah.»", a: "Bugun har chiqishda ayting." },
  { t: "Masjid odobi", d: "O'ng oyoq bilan kirib duo aytiladi, chap oyoq bilan chiqiladi.", a: "Bugun masjidga kirish-chiqish duosini yodlang." },
  { t: "Tahiyyatul masjid", d: "Masjidga kirgan kishi o'tirmasdan avval ikki rakat o'qisin.", a: "Bugun har masjidga kirganda bajaring." },
  { t: "Istig'for", d: "«Men bir kunda yuz martadan ko'p istig'for aytaman» — Payg'ambarimiz (s.a.v.).", a: "Bugun 100 marta «Astag'firullah» ayting." },
  { t: "Salavot", d: "Kim menga bir marta salavot aytsa, Alloh unga o'n marta rahmat qiladi. Juma kuni ko'paytiring.", a: "Bugun 100 marta salavot ayting." },
  { t: "Fitrat amallari", d: "Tozalik, tirnoq olish, soch-soqolni tartibga solish — fitratdan.", a: "Bugun tozalik ishlarini yakunlang." },
  { t: "Xushbo'ylik", d: "Payg'ambarimiz xushbo'y hidni sevar va hech qachon rad etmas edilar.", a: "Bugun atir sepib chiqing, ayniqsa namozga." },
  { t: "Mehmon izzati", d: "Allohga va oxirat kuniga imon keltirgan kishi mehmonini izzat qilsin.", a: "Bu hafta bir oilani mehmonga chaqiring." },
  { t: "Sadaqa", d: "Yarim xurmo bo'lsa ham do'zaxdan to'siq bo'ling. Yashirin sadaqa g'azabni o'chiradi.", a: "Bugun hech kim bilmaydigan bir sadaqa bering." },
  { t: "Kunlik Qur'on", d: "Amallarning Allohga suyukligi — oz bo'lsa ham davomiysi.", a: "Bugun kamida bir sahifa o'qing va ma'nosiga qarang." },
  { t: "Yaxshi so'z yoki sukut", d: "Kim Allohga va oxirat kuniga imon keltirsa, yaxshi gapirsin yoki jim tursin.", a: "Bugun keraksiz bir gapni aytmay qoldiring." },
  { t: "Va'daga vafo", d: "Munofiqning belgisi: gapirsa yolg'on, va'da bersa buzadi, omonatga xiyonat qiladi.", a: "Bugun bergan har va'dani yozib qo'ying va bajaring." },
  { t: "Kechki vaqt odobi", d: "Kun botganda bolalarni uyga kiriting, idish-eshiklarni yopib, Bismillah ayting.", a: "Bugun shom paytida oilani uyga yig'ing." },
  { t: "Xurmo bilan iftor", d: "Payg'ambarimiz ro'zani xurmo, bo'lmasa suv bilan ochardilar.", a: "Kelasi nafl ro'zangizni shunday oching." },
  { t: "Shubhalidan qochish", d: "Halol ham, harom ham ayon. Ikkisi orasidagi shubhalidan saqlangan dinini asragan bo'ladi.", a: "Bugun daromadingizdagi bir shubhali nuqtani tekshiring." },
  { t: "Erta turish barakasi", d: "«Allohim, ummatimning erta turishiga baraka ber.»", a: "Bugun bomdoddan keyin uxlamang, ishni boshlang." },
  { t: "Kamtarlik", d: "Kim Alloh uchun tavozu qilsa, Alloh uni ko'taradi.", a: "Bugun eng oddiy ishni o'zingiz qiling." },
  { t: "Hojat chiqarish", d: "Alloh bandaga, banda birodariga yordam berib turgan ekan, yordam beradi.", a: "Bugun bir kishining ishini yo'lga qo'ying." },
  { t: "G'iybatdan tiyilish", d: "G'iybat — birodaringni u yoqtirmaydigan narsa bilan tilga olishing.", a: "Bugun bir suhbatni chiroyli tarzda burib yuboring." },
  { t: "Kunlik zikr", d: "«La ilaha illalloh vahdahu la sharika lah, lahul mulku va lahul hamd, va huva ala kulli shay'in qadiyr» — 100 marta.", a: "Bugun 100 martaga yeting." },
];
const sunnatOfDay = (ds) => {
  const d = new Date(ds + "T12:00:00");
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return SUNNATS[doy % SUNNATS.length];
};
const AYAT = [
  "«Albatta, namoz mo'minlarga belgilangan vaqtlarda farz qilingandir.» — Niso, 103",
  "«Namozlarni va o'rta namozni muhofaza qilinglar.» — Baqara, 238",
  "«Kechaning bir qismida tahajjud namozini o'qi — bu senga qo'shimchadir.» — Isro, 79",
  "«Amallarning Allohga suyukligi — oz bo'lsa-da, doimiysidir.» — Hadis",
  "«Qiyomatda bandadan birinchi so'raladigan amal — namoz.» — Hadis",
];

/* ────────────────────────── SAQLASH ────────────────────────── */
const MKEY = "namoz_daftar_members_v1";
const DKEY = (id) => `namoz_daftar_v2:${id}`;
const blank = () => ({ days: {}, tasks: [], bonuses: [] });
const DEFAULT_MEMBERS = [
  { id: "sardor", name: "Sardor Valixanov", city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18, pin: "" },
  { id: "behruz", name: "Behruz Qurbonov", city: "Dubay", lat: 25.2048, lng: 55.2708, tz: 4, asr: 1, fa: 18.2, ia: 18.2, pin: "" },
];
const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftDate = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return todayStr(d); };
const prettyDate = (s) => {
  const d = new Date(s + "T12:00:00");
  const oy = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  const kun = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
  return `${d.getDate()} ${oy[d.getMonth()]}, ${kun[d.getDay()]}`;
};
const fmt = (n) => {
  const r = Math.round(n * 100) / 100;
  return (Number.isInteger(r) ? String(r) : String(r)).replace(".", ",");
};
const shortName = (n) => n.split(" ")[0];

/* ────────────────────────── HISOB ────────────────────────── */
function scoreUser(u) {
  const days = u?.days || {};
  const dates = Object.keys(days).sort();
  const out = { penalty: 0, ontime: 0, qazo: 0, bad: 0, tahajjud: 0, quran: 0, per: {}, bonusSum: 0, debt: 0, tasks: (u?.tasks || []).length };
  PRAYERS.forEach((p) => (out.per[p.k] = { ontime: 0, qazo: 0, bad: 0 }));
  (u?.bonuses || []).forEach((b) => (out.bonusSum += b.amt));
  if (dates.length) {
    const today = todayStr();
    let d = dates[0];
    for (let i = 0; i < 800 && d <= today; i++, d = shiftDate(d, 1)) {
      const day = days[d] || {}, closed = d < today;
      PRAYERS.forEach((p) => {
        const rec = day[p.k];
        if (!p.fard) { if (rec?.s === "ontime") { out.tahajjud++; out.per[p.k].ontime++; } return; }
        if (!rec) { if (closed) { out.penalty += P_MISS; out.bad++; out.per[p.k].bad++; } return; }
        if (rec.s === "ontime") { out.ontime++; out.per[p.k].ontime++; }
        else if (rec.s === "qazo") { out.penalty += P_QAZO; out.qazo++; out.per[p.k].qazo++; }
        else { out.penalty += P_MISS; out.bad++; out.per[p.k].bad++; }
      });
      if (day.quran) out.quran++;
    }
  }
  out.debt = out.penalty - out.bonusSum - out.tasks * TASK_AT;
  return out;
}
function delayStats(u, cfg) {
  const days = u?.days || {}, per = {};
  PRAYERS.forEach((p) => (per[p.k] = { sum: 0, n: 0 }));
  Object.keys(days).forEach((ds) => {
    const sc = daySchedule(new Date(ds + "T12:00:00"), cfg);
    PRAYERS.forEach((p) => {
      const r = days[ds][p.k];
      if (r && (r.s === "ontime" || r.s === "qazo") && r.t) {
        const d = diffMin(hm(sc[SK[p.k]]), r.t);
        if (d >= 0 && d < 900) { per[p.k].sum += d; per[p.k].n++; }
      }
    });
  });
  return per;
}
function prayerStreak(days, pk) {
  let cur = todayStr(), n = 0;
  if (days[cur]?.[pk]?.s !== "ontime") cur = shiftDate(cur, -1);
  for (let i = 0; i < 400; i++) { if (days[cur]?.[pk]?.s === "ontime") { n++; cur = shiftDate(cur, -1); } else break; }
  return n;
}
const claimedLevel = (u, pk) => (u?.bonuses || []).filter((b) => b.p === pk).reduce((m, b) => Math.max(m, b.lvl), 0);

/* ────────────────────────── UI ────────────────────────── */
const Eyebrow = ({ children }) => (
  <div style={{ color: C.brass, fontFamily: sans, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase" }}>{children}</div>
);
const Panel = ({ children, style }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, ...style }}>{children}</div>
);
const btnGhost = {
  background: C.panel, border: `1px solid ${C.line}`, color: C.text,
  borderRadius: 9, padding: "7px 9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};
const inputS = {
  width: "100%", background: C.panel2, border: `1px solid ${C.line}`, color: C.text,
  borderRadius: 9, padding: "9px 11px", fontFamily: sans, fontSize: 13, outline: "none",
};
const Row = ({ l, v, c }) => (
  <div className="flex justify-between" style={{ fontFamily: sans, fontSize: 12, padding: "3px 0" }}>
    <span style={{ color: C.mut }}>{l}</span><span style={{ color: c }}>{v}</span>
  </div>
);
const Stat = ({ big, label, c }) => (
  <Panel style={{ padding: 12, textAlign: "center" }}>
    <div style={{ fontFamily: serif, fontSize: 25, color: c, lineHeight: 1 }}>{big}</div>
    <div style={{ fontFamily: sans, fontSize: 10, color: C.mut, marginTop: 5 }}>{label}</div>
  </Panel>
);
const mBtn = (active, color) => ({
  width: 42, height: 42, borderRadius: 11, cursor: "pointer",
  background: active ? color : C.panel2, border: `1px solid ${active ? color : C.line}`,
  color: active ? "#0D1220" : C.mut, display: "flex", alignItems: "center", justifyContent: "center",
});
function Shell({ children }) {
  return (
    <div style={{ background: C.night, minHeight: "100vh", color: C.text }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "22px 16px 0" }}>{children}</div>
    </div>
  );
}
function WindowArc({ start, end, mark }) {
  const total = winLen(start, end);
  const raw = mark ? diffMin(start, mark) / total : null;
  const pos = raw == null ? null : Math.max(0, Math.min(1, raw));
  const over = raw != null && raw > 1;
  return (
    <div style={{ position: "relative", height: 6, borderRadius: 3, background: C.panel2 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 3, background: `linear-gradient(90deg, ${C.jade}55, ${C.jade}33 55%, ${C.brass}44)` }} />
      {pos !== null && (
        <div style={{ position: "absolute", left: `calc(${pos * 100}% - 3px)`, top: -3, width: 6, height: 12, borderRadius: 2, background: over ? C.clay : C.text }} />
      )}
    </div>
  );
}

/* ══════════════════════════ APP ══════════════════════════ */
export default function App() {
  const [members, setMembers] = useState([]);
  const [data, setData] = useState({});
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("app");      // app | pick | add
  const [pinFor, setPinFor] = useState(null);
  const [pinVal, setPinVal] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [tab, setTab] = useState("today");
  const [date, setDate] = useState(todayStr());
  const [now, setNow] = useState(new Date());
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const loadAll = async (mem) => {
    const out = {};
    for (const m of mem) {
      try { const r = await window.storage.get(DKEY(m.id), true); out[m.id] = r?.value ? { ...blank(), ...JSON.parse(r.value) } : blank(); }
      catch (e) { out[m.id] = blank(); }
    }
    setData(out);
  };

  useEffect(() => {
    (async () => {
      let mem = DEFAULT_MEMBERS;
      try { const r = await window.storage.get(MKEY, true); if (r?.value) mem = JSON.parse(r.value); }
      catch (e) { try { await window.storage.set(MKEY, JSON.stringify(DEFAULT_MEMBERS), true); } catch (e2) {} }
      setMembers(mem);
      try { const r = await window.storage.get("namoz_daftar_me"); if (r?.value && mem.some((m) => m.id === r.value)) setMe(r.value); } catch (e) {}
      await loadAll(mem);
      setLoading(false);
    })();
  }, []);

  const saveMembers = async (mem) => {
    setMembers(mem);
    try { await window.storage.set(MKEY, JSON.stringify(mem), true); } catch (e) {}
  };
  const pickMe = async (id) => {
    setMe(id); setScreen("app"); setPinFor(null); setPinVal(""); setPinErr("");
    try { await window.storage.set("namoz_daftar_me", id || ""); } catch (e) {}
  };
  const save = async (next) => {
    setData((d) => ({ ...d, [me]: next }));
    setSaving(true);
    try { await window.storage.set(DKEY(me), JSON.stringify(next), true); } catch (e) {}
    setSaving(false);
  };

  const cfg = members.find((m) => m.id === me) || members[0] || DEFAULT_MEMBERS[0];
  const colorOf = (id) => PALETTE[Math.max(0, members.findIndex((m) => m.id === id)) % PALETTE.length];
  const sched = useMemo(() => daySchedule(new Date(date + "T12:00:00"), cfg), [date, cfg]);
  const isToday = date === todayStr();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nowDec = now.getHours() + now.getMinutes() / 60;
  const myData = data[me] || blank();
  const myDay = (myData.days || {})[date] || {};
  const S = useMemo(() => {
    const o = {}; members.forEach((m) => (o[m.id] = scoreUser(data[m.id]))); return o;
  }, [data, members]);
  const myS = S[me] || scoreUser(blank());
  const others = members.filter((m) => m.id !== me);

  const setRec = (pk, s, t) => {
    const day = { ...((myData.days || {})[date] || {}) };
    if (s === null) delete day[pk]; else day[pk] = { s, t: t || null };
    save({ ...myData, days: { ...myData.days, [date]: day } });
  };
  const setDayField = (f, v) => {
    const day = { ...((myData.days || {})[date] || {}) };
    day[f] = v;
    save({ ...myData, days: { ...myData.days, [date]: day } });
  };

  if (loading) return <Shell><div style={{ padding: 60, textAlign: "center", color: C.mut, fontFamily: sans }}>Daftar ochilmoqda…</div></Shell>;

  /* ────────── ODAM QO'SHISH ────────── */
  if (screen === "add") {
    return <AddMember members={members} onCancel={() => setScreen("pick")}
      onSave={async (m) => { const mem = [...members, m]; await saveMembers(mem); await loadAll(mem); pickMe(m.id); }} />;
  }

  /* ────────── KIM EKANLIGINI TANLASH ────────── */
  if (!me || screen === "pick") {
    return (
      <Shell>
        <div style={{ maxWidth: 460, margin: "0 auto", paddingTop: 10 }}>
          {me && <button onClick={() => setScreen("app")} style={{ ...btnGhost, marginBottom: 16, gap: 6, fontFamily: sans, fontSize: 12 }}><ArrowLeft size={14} /> Orqaga</button>}
          <Eyebrow>Jamoa daftari</Eyebrow>
          <h1 style={{ fontFamily: serif, fontSize: 33, lineHeight: 1.15, margin: "10px 0 6px" }}>
            Namoz <span style={{ color: C.brass }}>Daftari</span>
          </h1>
          <p style={{ color: C.mut, fontFamily: sans, fontSize: 14, marginBottom: 22 }}>
            Kim ekanligingizni tanlang. Har kim faqat o'z belgisini qo'yadi, statistika hammaga ochiq.
          </p>

          {members.map((m) => (
            <div key={m.id} style={{ background: C.panel, border: `1px solid ${pinFor === m.id ? C.brass : C.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 8, height: 34, borderRadius: 4, background: colorOf(m.id), flexShrink: 0 }} />
                <button onClick={() => { if (m.pin) { setPinFor(pinFor === m.id ? null : m.id); setPinVal(""); setPinErr(""); } else pickMe(m.id); }}
                  style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <div style={{ fontFamily: serif, fontSize: 19, color: C.text }}>{m.name}</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: C.mut, marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={12} /> {m.city} · UTC{m.tz >= 0 ? "+" : ""}{m.tz}
                    {m.pin ? <><Lock size={11} style={{ marginLeft: 4 }} /> PIN</> : null}
                  </div>
                </button>
                {members.length > 1 && (
                  <button title="O'chirish"
                    onClick={async () => {
                      if (!window.confirm(`${m.name} va uning barcha yozuvlari o'chirilsinmi?`)) return;
                      const mem = members.filter((x) => x.id !== m.id);
                      await saveMembers(mem);
                      try { await window.storage.delete(DKEY(m.id), true); } catch (e) {}
                      if (me === m.id) pickMe(null);
                      await loadAll(mem);
                    }}
                    style={{ ...btnGhost, color: C.mut, padding: 7 }}><Trash2 size={14} /></button>
                )}
              </div>
              {pinFor === m.id && (
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <input type="password" inputMode="numeric" value={pinVal} autoFocus placeholder="PIN kod"
                    onChange={(e) => { setPinVal(e.target.value); setPinErr(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { if (pinVal === m.pin) pickMe(m.id); else setPinErr("PIN noto'g'ri"); } }}
                    style={{ ...inputS, flex: 1 }} />
                  <button onClick={() => { if (pinVal === m.pin) pickMe(m.id); else setPinErr("PIN noto'g'ri"); }}
                    style={{ background: C.brass, color: "#0D1220", border: "none", borderRadius: 9, padding: "0 16px", fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Kirish</button>
                </div>
              )}
              {pinFor === m.id && pinErr && <div style={{ color: C.clay, fontFamily: sans, fontSize: 12, marginTop: 7 }}>{pinErr}</div>}
            </div>
          ))}

          <button onClick={() => setScreen("add")}
            style={{ width: "100%", marginTop: 6, padding: 15, borderRadius: 14, background: "none", border: `1px dashed ${C.line}`, color: C.brass, fontFamily: sans, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <UserPlus size={15} /> Yangi odam qo'shish
          </button>
          <p style={{ fontFamily: sans, fontSize: 11, color: C.mut, marginTop: 14, lineHeight: 1.6 }}>
            PIN kod — bir-biringizning belgingizni tasodifan o'zgartirib qo'ymaslik uchun. Bu jiddiy himoya emas, havolaga ega har kim daftarni ko'ra oladi.
          </p>
        </div>
      </Shell>
    );
  }

  /* ══════════ BUGUN ══════════ */
  const TodayTab = () => {
    let dayBall = 0;
    PRAYERS.forEach((p) => { const r = myDay[p.k]; if (r && STATUS[r.s]) dayBall += STATUS[r.s].ball; });
    let nextP = null;
    if (isToday) {
      const list = PRAYERS.map((p) => ({ p, t: sched[SK[p.k]] })).sort((a, b) => a.t - b.t);
      nextP = list.find((x) => x.t > nowDec) || null;
    }
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setDate(shiftDate(date, -1))} style={btnGhost}><ChevronLeft size={18} /></button>
          <div className="text-center">
            <div style={{ fontFamily: serif, fontSize: 19 }}>{prettyDate(date)}</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.mut, letterSpacing: "0.08em" }}>
              {cfg.city.toUpperCase()} · {isToday ? "KUN OCHIQ" : "KUN YOPILGAN"}
            </div>
          </div>
          <button onClick={() => setDate(shiftDate(date, 1))} disabled={date >= todayStr()}
            style={{ ...btnGhost, opacity: date >= todayStr() ? 0.3 : 1 }}><ChevronRight size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat big={dayBall === 0 ? "0" : fmt(dayBall)} label="Shu kun bali" c={dayBall === 0 ? C.jade : C.clay} />
          <Stat big={myS.debt > 0 ? `−${fmt(myS.debt)}` : `+${fmt(-myS.debt)}`} label={myS.debt > 0 ? "Umumiy qarz" : "Zaxira ball"} c={myS.debt > 0 ? C.clay : C.jade} />
        </div>

        {isToday && nextP && (
          <Panel style={{ padding: "14px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><Eyebrow>Keyingi vaqt</Eyebrow><div style={{ fontFamily: serif, fontSize: 20, marginTop: 2 }}>{nextP.p.n}</div></div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: serif, fontSize: 26, color: C.brass }}>{hm(nextP.t)}</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.mut }}>
                {(() => { const m = Math.round((nextP.t - nowDec) * 60); return `${Math.floor(m / 60)} soat ${m % 60} daqiqa qoldi`; })()}
              </div>
            </div>
          </Panel>
        )}

        <div className="space-y-2">
          {PRAYERS.map((p) => {
            const start = hm(sched[SK[p.k]]), end = hm(sched[EK[p.k]]);
            const rec = myDay[p.k], st = rec ? STATUS[rec.s] : null;
            const delay = rec?.t && (rec.s === "ontime" || rec.s === "qazo") ? diffMin(start, rec.t) : null;
            const open = isToday && inWin(nowDec, sched[SK[p.k]], sched[EK[p.k]]);
            const notYet = isToday && !open && nowDec < sched[SK[p.k]];
            const Icon = p.Icon;
            const markPrayed = () => { if (!isToday) setRec(p.k, "late", null); else setRec(p.k, open ? "ontime" : "qazo", nowHM); };
            return (
              <Panel key={p.k} style={{ padding: 14, borderColor: st ? `${st.color}55` : open ? `${C.brass}55` : C.line }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: C.panel2, display: "flex", alignItems: "center", justifyContent: "center", color: open ? C.brass : C.mut, flexShrink: 0 }}><Icon size={17} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-baseline gap-2">
                      <span style={{ fontFamily: serif, fontSize: 17 }}>{p.n}</span>
                      {!p.fard && <span style={{ fontFamily: sans, fontSize: 9, color: C.brass, border: `1px solid ${C.brass}55`, borderRadius: 4, padding: "1px 5px" }}>NAFL</span>}
                      {open && <span style={{ fontFamily: sans, fontSize: 9, color: C.jade }}>● VAQTI KIRDI</span>}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: C.mut }}>{start} — {end}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={markPrayed} style={mBtn(["ontime", "qazo", "late"].includes(rec?.s), rec?.s === "ontime" ? C.jade : C.brass)}><Check size={17} /></button>
                    <button onClick={() => setRec(p.k, "missed")} style={mBtn(rec?.s === "missed", C.clay)}>
                      <span style={{ fontFamily: serif, fontSize: 22, lineHeight: 1 }}>−</span>
                    </button>
                  </div>
                </div>
                {rec ? (
                  <div style={{ marginTop: 12 }}>
                    {(rec.s === "ontime" || rec.s === "qazo") && rec.t && <WindowArc start={start} end={end} mark={rec.t} />}
                    <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                      <div style={{ fontFamily: sans, fontSize: 12, color: st.color }}>
                        {st.label} · <span style={{ color: st.ball === 0 ? C.jade : C.clay }}>{st.ball === 0 ? "0 ball" : `${fmt(st.ball)} ball`}</span>
                        {delay != null && delay >= 0 && rec.s === "ontime" ? ` · +${delay} daq` : ""}
                      </div>
                      <div className="flex gap-2 items-center">
                        {(rec.s === "ontime" || rec.s === "qazo") && (editing === p.k ? (
                          <input type="time" defaultValue={rec.t || start} autoFocus
                            onBlur={(e) => { const v = e.target.value; setRec(p.k, inWin(toMin(v) / 60, sched[SK[p.k]], sched[EK[p.k]]) ? "ontime" : "qazo", v); setEditing(null); }}
                            style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 7, padding: "3px 7px", fontFamily: sans, fontSize: 12 }} />
                        ) : (
                          <button onClick={() => setEditing(p.k)} style={{ ...btnGhost, fontSize: 12, fontFamily: sans, padding: "3px 8px", gap: 5 }}>
                            <Pencil size={11} /> {rec.t || "vaqt"}
                          </button>
                        ))}
                        <button onClick={() => setRec(p.k, null)} style={{ ...btnGhost, fontFamily: sans, fontSize: 11, padding: "3px 8px" }}>tozalash</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontFamily: sans, fontSize: 11.5, color: C.mut, display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={11} />
                    {!p.fard ? "Nafl — ball ketmaydi, faqat strike yig'iladi"
                      : notYet ? "Vaqti kirmagan"
                      : open ? "Vaqti ichida — hozir belgilasangiz 0 ball"
                      : isToday ? "Vaqti o'tdi — bugun qazo qilsangiz −0,25, ertaga qolsa −1"
                      : "Belgilanmagan — o'tkazib yuborilgan hisoblanadi (−1)"}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>

        <Panel style={{ padding: 14, marginTop: 14 }}>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontFamily: serif, fontSize: 16 }}>Bugun Qur'on o'qidim</div>
              <div style={{ fontFamily: sans, fontSize: 11, color: C.mut }}>Oz bo'lsa ham — davomiysi afzal</div>
            </div>
            <button onClick={() => setDayField("quran", !myDay.quran)} style={mBtn(!!myDay.quran, C.jade)}><Check size={16} /></button>
          </div>
        </Panel>
        {saving && <div style={{ textAlign: "center", marginTop: 12, fontFamily: sans, fontSize: 11, color: C.mut }}>saqlanmoqda…</div>}
      </div>
    );
  };

  /* ══════════ STATISTIKA ══════════ */
  const StatsTab = () => {
    const chart = useMemo(() => {
      const rows = [];
      for (let i = 13; i >= 0; i--) {
        const ds = shiftDate(todayStr(), -i);
        const row = { kun: ds.slice(8) };
        members.forEach((m) => {
          const day = (data[m.id]?.days || {})[ds] || {};
          row[shortName(m.name)] = PRAYERS.filter((p) => p.fard && day[p.k]?.s === "ontime").length;
        });
        rows.push(row);
      }
      return rows;
    }, [data, members]);
    const dl = useMemo(() => { const o = {}; members.forEach((m) => (o[m.id] = delayStats(data[m.id], m))); return o; }, [data, members]);
    const claimBonus = (pk, lvl) => {
      const amt = Math.min(BONUS_MAX, Math.max(BONUS_MIN, Math.round((myS.debt / 2) * 100) / 100));
      save({ ...myData, bonuses: [...(myData.bonuses || []), { p: pk, lvl, amt, d: todayStr() }] });
    };
    const ranked = [...members].sort((a, b) => {
      const sa = S[a.id], sb = S[b.id];
      const pa = sa.ontime + sa.qazo + sa.bad, pb = sb.ontime + sb.qazo + sb.bad;
      return (pb ? sb.ontime / pb : 0) - (pa ? sa.ontime / pa : 0);
    });

    return (
      <div>
        <Eyebrow>Jamoa</Eyebrow>
        <h2 style={{ fontFamily: serif, fontSize: 24, margin: "6px 0 14px" }}>Taqqoslash</h2>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {ranked.map((m, idx) => {
            const s = S[m.id], tot = s.ontime + s.qazo + s.bad;
            const pct = tot ? Math.round((s.ontime / tot) * 100) : 0;
            return (
              <Panel key={m.id} style={{ padding: 13, borderColor: m.id === me ? `${C.brass}66` : C.line }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <div style={{ width: 6, height: 26, borderRadius: 3, background: colorOf(m.id) }} />
                  <div>
                    <div style={{ fontFamily: serif, fontSize: 16 }}>{shortName(m.name)}</div>
                    <div style={{ fontFamily: sans, fontSize: 10, color: C.mut }}>{m.city} · {idx + 1}-o'rin</div>
                  </div>
                </div>
                <div style={{ fontFamily: serif, fontSize: 31, lineHeight: 1, color: pct >= 80 ? C.jade : pct >= 50 ? C.brass : C.clay }}>
                  {pct}<span style={{ fontSize: 14, color: C.mut }}>%</span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 10, color: C.mut, marginBottom: 9 }}>vaqtida o'qilgan</div>
                <Row l="Vaqtida" v={s.ontime} c={C.jade} />
                <Row l="Qazo" v={s.qazo} c={C.brass} />
                <Row l="O'tkazilgan" v={s.bad} c={C.clay} />
                <Row l="Tahajjud" v={s.tahajjud} c={C.brass} />
                <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 6 }}>
                  <Row l={s.debt > 0 ? "Qarz" : "Zaxira"} v={s.debt > 0 ? `−${fmt(s.debt)}` : `+${fmt(-s.debt)}`} c={s.debt > 0 ? C.clay : C.jade} />
                </div>
              </Panel>
            );
          })}
        </div>

        <Panel style={{ padding: 14, marginBottom: 14, borderColor: `${C.brass}44` }}>
          <Eyebrow>Strike — har {STREAK_STEP} kun mukofot</Eyebrow>
          <p style={{ fontFamily: sans, fontSize: 11.5, color: C.mut, margin: "6px 0 12px" }}>
            Bir namozni {STREAK_STEP} kun ketma-ket vaqtida o'qisangiz, qarzingizning yarmi o'chadi ({BONUS_MIN}–{BONUS_MAX} ball).
          </p>
          {PRAYERS.map((p) => {
            const streak = prayerStreak(myData.days || {}, p.k);
            const lvl = Math.floor(streak / STREAK_STEP), claimed = claimedLevel(myData, p.k);
            const ready = lvl > claimed, prog = (streak % STREAK_STEP) / STREAK_STEP;
            return (
              <div key={p.k} style={{ marginBottom: 11 }}>
                <div className="flex justify-between items-center" style={{ fontFamily: sans, fontSize: 12, marginBottom: 5 }}>
                  <span>{p.n} <span style={{ color: C.mut }}>· {streak} kun</span></span>
                  {ready ? (
                    <button onClick={() => claimBonus(p.k, lvl)}
                      style={{ background: C.brass, color: "#0D1220", border: "none", borderRadius: 8, padding: "4px 10px", fontFamily: sans, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                      <Gift size={12} /> Mukofotni olish
                    </button>
                  ) : (
                    <span style={{ color: C.mut, fontSize: 11 }}>{claimed > 0 ? `${claimed} mukofot · ` : ""}{STREAK_STEP - (streak % STREAK_STEP)} kun qoldi</span>
                  )}
                </div>
                <div style={{ height: 5, background: C.panel2, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${(ready ? 1 : prog) * 100}%`, height: "100%", background: ready ? C.brass : C.jade, transition: "width .3s" }} />
                </div>
              </div>
            );
          })}
        </Panel>

        <Panel style={{ padding: 14, marginBottom: 14 }}>
          <Eyebrow>So'nggi 14 kun · vaqtida o'qilgan farzlar</Eyebrow>
          <div style={{ height: 200, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} barGap={1}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
                <XAxis dataKey="kun" tick={{ fill: C.mut, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 5]} ticks={[0, 5]} tick={{ fill: C.mut, fontSize: 10 }} axisLine={false} tickLine={false} width={18} />
                <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.mut }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {members.map((m) => (
                  <Bar key={m.id} dataKey={shortName(m.name)} fill={colorOf(m.id)} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel style={{ padding: 14 }}>
          <Eyebrow>Qaysi namoz og'ir kelmoqda</Eyebrow>
          <div style={{ marginTop: 12 }}>
            {PRAYERS.map((p) => (
              <div key={p.k} style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: sans, fontSize: 12.5, marginBottom: 6 }}>{p.n}</div>
                {members.map((m) => {
                  const pp = S[m.id].per[p.k], tot = pp.ontime + pp.qazo + pp.bad;
                  const d = dl[m.id][p.k], avg = d.n ? Math.round(d.sum / d.n) : null;
                  return (
                    <div key={m.id} style={{ marginBottom: 5 }}>
                      <div className="flex justify-between" style={{ fontFamily: sans, fontSize: 10.5, color: C.mut, marginBottom: 3 }}>
                        <span style={{ color: colorOf(m.id) }}>{shortName(m.name)}</span>
                        <span>{pp.ontime}/{pp.qazo}/{pp.bad}{avg != null ? ` · ${avg} daq` : ""}</span>
                      </div>
                      <div style={{ height: 5, background: C.panel2, borderRadius: 3, display: "flex", overflow: "hidden" }}>
                        <div style={{ width: `${tot ? (pp.ontime / tot) * 100 : 0}%`, background: C.jade }} />
                        <div style={{ width: `${tot ? (pp.qazo / tot) * 100 : 0}%`, background: C.brass }} />
                        <div style={{ width: `${tot ? (pp.bad / tot) * 100 : 0}%`, background: C.clay }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{ fontFamily: sans, fontSize: 10.5, color: C.mut, lineHeight: 1.6 }}>
              Raqamlar: vaqtida / qazo / o'tkazib yuborilgan. «daq» — o'rtacha necha daqiqadan keyin o'qilgani.
            </div>
          </div>
        </Panel>
      </div>
    );
  };

  /* ══════════ SUNNAT ══════════ */
  const SunnatTab = () => {
    const s = sunnatOfDay(date);
    const [txt, setTxt] = useState(myDay.sunnat || "");
    useEffect(() => { setTxt(myDay.sunnat || ""); }, [date]);
    return (
      <div>
        <Eyebrow>Kunning sunnati · {prettyDate(date)}</Eyebrow>
        <Panel style={{ padding: 18, margin: "10px 0 14px", borderColor: `${C.brass}44` }}>
          <div style={{ fontFamily: serif, fontSize: 23, color: C.brass, lineHeight: 1.25 }}>{s.t}</div>
          <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.65, marginTop: 10 }}>{s.d}</p>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <Eyebrow>Bugungi mashq</Eyebrow>
            <p style={{ fontFamily: sans, fontSize: 13, color: C.mut, marginTop: 5 }}>{s.a}</p>
          </div>
        </Panel>
        <Panel style={{ padding: 14, marginBottom: 14 }}>
          <Eyebrow>Daftaringiz</Eyebrow>
          <p style={{ fontFamily: sans, fontSize: 12, color: C.mut, margin: "6px 0 8px" }}>
            Bugun bu sunnatdan nimani o'rgandingiz va qanday amal qildingiz?
          </p>
          <textarea value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => setDayField("sunnat", txt)} rows={5}
            placeholder="Masalan: bugun 5 kishiga birinchi salom berdim…"
            style={{ ...inputS, lineHeight: 1.6, resize: "vertical", padding: 12 }} />
        </Panel>
        {others.map((m) => {
          const note = ((data[m.id]?.days || {})[date] || {}).sunnat;
          return (
            <Panel key={m.id} style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: colorOf(m.id) }}>
                {shortName(m.name)} yozgani
              </div>
              <p style={{ fontFamily: sans, fontSize: 13, color: note ? C.text : C.mut, lineHeight: 1.65, marginTop: 8, whiteSpace: "pre-wrap" }}>
                {note || "Hali yozilmagan."}
              </p>
            </Panel>
          );
        })}
      </div>
    );
  };

  /* ══════════ VAZIFA ══════════ */
  const TaskTab = () => {
    const s = myS;
    const pending = Math.max(0, Math.floor(s.debt / TASK_AT));
    const [rak, setRak] = useState(0);
    const [tas, setTas] = useState(0);
    const finish = () => { save({ ...myData, tasks: [...(myData.tasks || []), { d: todayStr(), rak: 25, tas: 500 }] }); setRak(0); setTas(0); };
    return (
      <div>
        <Eyebrow>Ahd shartlari</Eyebrow>
        <h2 style={{ fontFamily: serif, fontSize: 24, margin: "6px 0 12px" }}>Ball va vazifa</h2>
        <Panel style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <Info size={13} color={C.brass} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontFamily: sans, fontSize: 12, color: C.mut, lineHeight: 1.75 }}>
              <div><span style={{ color: C.jade }}>Vaqtida o'qilsa</span> — 0 ball</div>
              <div><span style={{ color: C.brass }}>Vaqti o'tib, o'sha kun ichida qazo qilinsa</span> — −0,25</div>
              <div><span style={{ color: C.clay }}>Kun yopilib, keyingi kunga qolsa yoki o'qilmasa</span> — −1</div>
              <div><span style={{ color: C.brass }}>Har {STREAK_STEP} kunlik strike</span> — qarzning yarmi o'chadi</div>
              <div><span style={{ color: C.text }}>Har {TASK_AT} ball qarz</span> — 25 rakat nafl va 500 tasbeh</div>
            </div>
          </div>
        </Panel>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat big={fmt(s.penalty)} label="Jamg'arilgan minus" c={C.clay} />
          <Stat big={`−${fmt(s.bonusSum + s.tasks * TASK_AT)}`} label="Mukofot + vazifa" c={C.jade} />
          <Stat big={s.debt > 0 ? fmt(s.debt) : `+${fmt(-s.debt)}`} label={s.debt > 0 ? "Qolgan qarz" : "Zaxira"} c={s.debt > 0 ? C.brass : C.jade} />
        </div>

        {pending > 0 ? (
          <Panel style={{ padding: 18, borderColor: `${C.brass}66` }}>
            <div style={{ fontFamily: serif, fontSize: 20, color: C.brass }}>Faol vazifa</div>
            <p style={{ fontFamily: sans, fontSize: 12, color: C.mut, marginTop: 4, marginBottom: 16 }}>
              Qarz {fmt(s.debt)} ball. {pending} ta vazifa ochiq — har biri 4 ballni yopadi.
            </p>
            <div style={{ marginBottom: 18 }}>
              <div className="flex justify-between" style={{ fontFamily: sans, fontSize: 12, marginBottom: 8 }}>
                <span>Nafl namoz</span><span style={{ color: C.brass }}>{rak} / 25 rakat</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 25 }).map((_, i) => (
                  <button key={i} onClick={() => setRak(i + 1 === rak ? i : i + 1)}
                    style={{ width: 22, height: 22, borderRadius: 5, cursor: "pointer", background: i < rak ? C.brass : C.panel2, border: `1px solid ${i < rak ? C.brass : C.line}` }} />
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between" style={{ fontFamily: sans, fontSize: 12, marginBottom: 8 }}>
                <span>Tasbeh</span><span style={{ color: C.brass }}>{tas} / 500</span>
              </div>
              <div style={{ height: 6, background: C.panel2, borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ width: `${Math.min(100, (tas / 500) * 100)}%`, height: "100%", background: C.brass, transition: "width .2s" }} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTas((v) => Math.min(500, v + 1))}
                  style={{ flex: 1, padding: "16px 0", borderRadius: 12, background: C.panel2, border: `1px solid ${C.brass}55`, color: C.brass, fontFamily: serif, fontSize: 18, cursor: "pointer" }}>
                  Subhanalloh +1
                </button>
                <button onClick={() => setTas((v) => Math.min(500, v + 33))} style={{ ...btnGhost, padding: "16px 14px", fontFamily: sans, fontSize: 13 }}>+33</button>
                <button onClick={() => setTas(0)} style={{ ...btnGhost, padding: "16px 14px" }}><RotateCcw size={15} /></button>
              </div>
            </div>
            <button onClick={finish} disabled={!(rak >= 25 && tas >= 500)}
              style={{ width: "100%", marginTop: 18, padding: "13px 0", borderRadius: 12, border: "none", fontFamily: sans, fontSize: 14, fontWeight: 600,
                cursor: rak >= 25 && tas >= 500 ? "pointer" : "not-allowed",
                background: rak >= 25 && tas >= 500 ? C.jade : C.panel2, color: rak >= 25 && tas >= 500 ? "#08140F" : C.mut }}>
              Vazifani yopish (−4 ball)
            </button>
          </Panel>
        ) : (
          <Panel style={{ padding: 26, textAlign: "center" }}>
            <Award size={30} color={C.jade} style={{ margin: "0 auto 10px" }} />
            <div style={{ fontFamily: serif, fontSize: 19 }}>Vazifa yo'q</div>
            <p style={{ fontFamily: sans, fontSize: 13, color: C.mut, marginTop: 6 }}>
              {s.debt > 0 ? `Yana ${fmt(TASK_AT - s.debt)} ball qarz yig'ilsa vazifa ochiladi.` : "Qarzingiz yo'q. Strike'ni uzmang."}
            </p>
          </Panel>
        )}

        <Panel style={{ padding: 14, marginTop: 14 }}>
          <Eyebrow>Jamoa holati</Eyebrow>
          <div style={{ marginTop: 8 }}>
            {others.map((m) => (
              <div key={m.id} style={{ padding: "7px 0", borderBottom: `1px solid ${C.line}` }}>
                <div style={{ fontFamily: sans, fontSize: 12.5, color: colorOf(m.id), marginBottom: 3 }}>{shortName(m.name)}</div>
                <Row l="Minus / mukofot / vazifa" v={`${fmt(S[m.id].penalty)} · −${fmt(S[m.id].bonusSum)} · ${S[m.id].tasks}`} c={C.mut} />
                <Row l={S[m.id].debt > 0 ? "Qarz" : "Zaxira"} v={S[m.id].debt > 0 ? `−${fmt(S[m.id].debt)}` : `+${fmt(-S[m.id].debt)}`} c={S[m.id].debt > 0 ? C.clay : C.jade} />
              </div>
            ))}
          </div>
        </Panel>

        {(myData.bonuses || []).length > 0 && (
          <Panel style={{ padding: 14, marginTop: 14 }}>
            <Eyebrow>Mukofot tarixi</Eyebrow>
            <div style={{ marginTop: 8 }}>
              {(myData.bonuses || []).slice().reverse().map((b, i) => (
                <Row key={i} l={`${PRAYERS.find((p) => p.k === b.p)?.n} · ${b.lvl * STREAK_STEP} kun · ${b.d}`} v={`−${fmt(b.amt)}`} c={C.jade} />
              ))}
            </div>
          </Panel>
        )}
      </div>
    );
  };

  const TABS = [
    { k: "today", n: "Bugun", Icon: ClipboardList },
    { k: "stats", n: "Statistika", Icon: BarChart3 },
    { k: "sunnat", n: "Sunnat", Icon: BookOpen },
    { k: "task", n: "Vazifa", Icon: Flame },
  ];

  return (
    <Shell>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div style={{ width: 6, height: 36, borderRadius: 3, background: colorOf(me) }} />
          <div>
            <Eyebrow>Ahd daftari</Eyebrow>
            <div style={{ fontFamily: serif, fontSize: 21, marginTop: 2 }}>
              {shortName(cfg.name)} <span style={{ color: C.mut, fontSize: 13 }}>· {cfg.city}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadAll(members)} style={btnGhost} title="Yangilash"><RefreshCw size={15} /></button>
          <button onClick={() => setScreen("pick")} style={btnGhost} title="Odamlar"><Users size={15} /></button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 18, padding: "10px 12px", background: C.panel, borderLeft: `2px solid ${C.brass}`, borderRadius: "0 10px 10px 0" }}>
        <Quote size={13} color={C.brass} style={{ marginTop: 3, flexShrink: 0 }} />
        <span style={{ fontFamily: serif, fontSize: 13.5, color: C.mut, lineHeight: 1.55, fontStyle: "italic" }}>
          {AYAT[new Date(date + "T12:00:00").getDate() % AYAT.length]}
        </span>
      </div>

      {tab === "today" && <TodayTab />}
      {tab === "stats" && <StatsTab />}
      {tab === "sunnat" && <SunnatTab />}
      {tab === "task" && <TaskTab />}

      <div style={{ height: 84 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(13,18,32,.94)", borderTop: `1px solid ${C.line}`, backdropFilter: "blur(8px)" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "flex" }}>
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ flex: 1, padding: "11px 0 14px", background: "none", border: "none", cursor: "pointer",
                color: tab === t.k ? C.brass : C.mut, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <t.Icon size={17} />
              <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.05em" }}>{t.n}</span>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ────────────────────────── ODAM QO'SHISH EKRANI ────────────────────────── */
function AddMember({ members, onSave, onCancel }) {
  const autoTz = Math.round(-new Date().getTimezoneOffset() / 60 * 2) / 2;
  const [name, setName] = useState("");
  const [cityIdx, setCityIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const [cityName, setCityName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [tz, setTz] = useState(autoTz);
  const [asr, setAsr] = useState(2);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    if (!name.trim()) return setErr("Ism kiriting");
    let city, la, ln, fa = 18, ia = 18;
    if (manual) {
      if (!cityName.trim() || lat === "" || lng === "") return setErr("Shahar nomi va koordinatalarni to'ldiring");
      city = cityName.trim(); la = Number(lat); ln = Number(lng);
      if (isNaN(la) || isNaN(ln) || Math.abs(la) > 66) return setErr("Koordinatalar noto'g'ri (kenglik ±66 dan oshmasin)");
    } else {
      const c = CITIES[cityIdx];
      city = c.n; la = c.lat; ln = c.lng; fa = c.fa; ia = c.ia;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) return setErr("PIN 4-6 raqamdan iborat bo'lsin");
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "user";
    let id = base, i = 2;
    while (members.some((m) => m.id === id)) id = `${base}${i++}`;
    onSave({ id, name: name.trim(), city, lat: la, lng: ln, tz: Number(tz), asr: Number(asr), fa, ia, pin: pin.trim() });
  };

  return (
    <Shell>
      <div style={{ maxWidth: 460, margin: "0 auto", paddingTop: 10 }}>
        <button onClick={onCancel} style={{ ...btnGhost, marginBottom: 16, gap: 6, fontFamily: sans, fontSize: 12 }}><ArrowLeft size={14} /> Orqaga</button>
        <Eyebrow>Yangi a'zo</Eyebrow>
        <h1 style={{ fontFamily: serif, fontSize: 28, margin: "8px 0 18px" }}>Odam qo'shish</h1>

        <Label>Ism familiya</Label>
        <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="Masalan: Aziz Rahimov" style={inputS} />

        <Label>Shahar</Label>
        {!manual ? (
          <select value={cityIdx} onChange={(e) => setCityIdx(Number(e.target.value))} style={{ ...inputS, appearance: "none" }}>
            {CITIES.map((c, i) => <option key={c.n} value={i} style={{ background: C.panel2 }}>{c.n}</option>)}
          </select>
        ) : (
          <>
            <input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="Shahar nomi" style={inputS} />
            <div className="flex gap-2" style={{ marginTop: 8 }}>
              <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Kenglik (lat), masalan 41.3" style={inputS} />
              <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Uzunlik (lng), masalan 69.24" style={inputS} />
            </div>
            <p style={{ fontFamily: sans, fontSize: 11, color: C.mut, marginTop: 6 }}>
              Koordinatani xaritadan olish mumkin: Google Maps'da joyni bosib turing, chiqqan raqamlarni ko'chiring.
            </p>
          </>
        )}
        <button onClick={() => setManual(!manual)} style={{ background: "none", border: "none", color: C.brass, fontFamily: sans, fontSize: 12, cursor: "pointer", padding: "8px 0" }}>
          {manual ? "← Ro'yxatdan tanlash" : "Ro'yxatda yo'q — qo'lda kiritaman →"}
        </button>

        <Label>Vaqt mintaqasi (UTC)</Label>
        <input type="number" step="0.5" value={tz} onChange={(e) => setTz(e.target.value)} style={inputS} />
        <p style={{ fontFamily: sans, fontSize: 11, color: C.mut, marginTop: 6 }}>
          Qurilmangizdan olindi. Yozgi vaqtga o'tadigan davlatlarda mavsum almashganda shu yerni yangilash kerak.
        </p>

        <Label>Asr namozi hisobi</Label>
        <div className="flex gap-2">
          {[{ v: 2, n: "Hanafiy" }, { v: 1, n: "Shofe'iy / Moliki" }].map((o) => (
            <button key={o.v} onClick={() => setAsr(o.v)}
              style={{ flex: 1, padding: "11px 0", borderRadius: 9, cursor: "pointer", fontFamily: sans, fontSize: 13,
                background: asr === o.v ? C.brass : C.panel2, color: asr === o.v ? "#0D1220" : C.mut,
                border: `1px solid ${asr === o.v ? C.brass : C.line}` }}>{o.n}</button>
          ))}
        </div>

        <Label>PIN kod (ixtiyoriy)</Label>
        <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} placeholder="4-6 raqam" style={inputS} />

        {err && <div style={{ color: C.clay, fontFamily: sans, fontSize: 12, marginTop: 12 }}>{err}</div>}

        <button onClick={submit}
          style={{ width: "100%", marginTop: 20, padding: "14px 0", borderRadius: 12, background: C.jade, color: "#08140F", border: "none", fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Qo'shish
        </button>
        <div style={{ height: 40 }} />
      </div>
    </Shell>
  );
}
const Label = ({ children }) => (
  <div style={{ fontFamily: sans, fontSize: 11, color: C.mut, letterSpacing: "0.06em", textTransform: "uppercase", margin: "16px 0 7px" }}>{children}</div>
);
