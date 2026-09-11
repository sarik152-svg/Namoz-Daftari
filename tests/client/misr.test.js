/* Safar va yozgi vaqt. Sardor went to Egypt and the app kept judging him by
   Tashkent's clock: a Shom prayed on time in Cairo landed after Tashkent's window
   had shut and was written down as a qazo. Egypt was not in the list at all. */
const { loadClient } = require("./harness");

const SARDOR = { id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18 };
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const QOHIRA = { d: "2026-09-11", city: "Qohira", lat: 30.0444, lng: 31.2357,
  tz: 2, asr: 2, fa: 19.5, ia: 17.5 };

function client(places = [], at = "2026-09-11T07:00:00Z") {
  const loaded = loadClient({
    at, expose: ["DST", "dowKun", "CITIES", "cfgAt", "cfgNow", "daySchedule", "hm"],
  });
  loaded.setState({
    members: [SARDOR], data: { sardor: { ...blank(), places } },
    me: "sardor", date: "2026-09-11", token: "tok", isAdmin: false,
  });
  return loaded;
}

module.exports = {
  "Egypt is in the list, with the Egyptian twilight angles"(assert) {
    const c = client();
    const q = c.CITIES.find(x => x.n === "Qohira");
    assert.ok(q, "expected Qohira in the city list");
    assert.strictEqual(q.tz, 2, "the winter offset — summer is added by the rule");
    assert.strictEqual(q.fa, 19.5, "Egyptian General Authority of Survey");
    assert.strictEqual(q.ia, 17.5);
    assert.strictEqual(q.asr, 2, "Hanafi, like the rest of the list");
    ["Iskandariya", "Sharm ash-Shayx", "Hurg'ada"].forEach(n =>
      assert.ok(c.CITIES.some(x => x.n === n), "expected " + n));
  },

  "the nth weekday of a month is found from the calendar"(assert) {
    const c = client();
    assert.strictEqual(c.dowKun(2026, 3, 0, -1), 29, "last Sunday of March 2026");
    assert.strictEqual(c.dowKun(2026, 10, 0, -1), 25, "last Sunday of October");
    assert.strictEqual(c.dowKun(2026, 4, 5, -1), 24, "last Friday of April");
    assert.strictEqual(c.dowKun(2026, 10, 4, -1), 29, "last Thursday of October");
    assert.strictEqual(c.dowKun(2026, 3, 0, 2), 8, "second Sunday of March");
    assert.strictEqual(c.dowKun(2026, 11, 0, 1), 1, "first Sunday of November");
  },

  "Egypt's summer runs from the last Friday of April to the last Thursday of October"(assert) {
    const c = client();
    assert.strictEqual(c.DST.misr("2026-04-23"), false, "the day before it starts");
    assert.strictEqual(c.DST.misr("2026-04-24"), true, "the day it starts");
    assert.strictEqual(c.DST.misr("2026-09-11"), true);
    assert.strictEqual(c.DST.misr("2026-10-28"), true, "the last day of it");
    assert.strictEqual(c.DST.misr("2026-10-29"), false, "and the day it ends");
    assert.strictEqual(c.DST.misr("2026-12-01"), false);
  },

  "the clock a day is judged by follows that day, not today"(assert) {
    /* A prayer logged in September must keep September's offset when it is read
       back in December, or the whole autumn would shift by an hour. */
    const c = client([QOHIRA]);
    assert.strictEqual(c.cfgAt(SARDOR, "2026-09-11").tz, 3, "summer");
    assert.strictEqual(c.cfgAt(SARDOR, "2026-12-01").tz, 2, "winter");
    assert.strictEqual(c.cfgAt(SARDOR, "2026-10-28").tz, 3);
    assert.strictEqual(c.cfgAt(SARDOR, "2026-10-29").tz, 2);
  },

  "before he arrived, the days stay on Tashkent"(assert) {
    const c = client([QOHIRA]);
    assert.strictEqual(c.cfgAt(SARDOR, "2026-09-09").city, "Toshkent");
    assert.strictEqual(c.cfgAt(SARDOR, "2026-09-09").tz, 5);
    assert.strictEqual(c.cfgAt(SARDOR, "2026-09-11").city, "Qohira");
  },

  "Cairo's prayer times are Cairo's, three hours off Tashkent's"(assert) {
    const c = client([QOHIRA]);
    const qohira = c.daySchedule(new Date("2026-09-11T12:00:00"),
      c.cfgAt(SARDOR, "2026-09-11"));
    const toshkent = c.daySchedule(new Date("2026-09-11T12:00:00"), SARDOR);
    /* This is the bug itself. He prays Maghrib at Cairo's hour; by Tashkent's clock
       that moment is two hours later, which is past Tashkent's Isha — so the app
       filed an on-time prayer as a qazo. */
    const farq = SARDOR.tz - c.cfgAt(SARDOR, "2026-09-11").tz;  // 5 − 3
    assert.strictEqual(farq, 2, "Cairo is two hours behind Tashkent in summer");
    assert.ok(qohira.shom + farq > toshkent.xufton,
      "his Maghrib, read on Tashkent's clock, is past even Isha: "
      + c.hm(qohira.shom + farq) + " vs " + c.hm(toshkent.xufton));
    assert.ok(qohira.bomdod > 4 && qohira.bomdod < 6, "Fajr around five");
    assert.ok(qohira.shom > 18 && qohira.shom < 20, "Maghrib in the evening");
  },

  "a city with no summer time is left alone"(assert) {
    const c = client();
    assert.strictEqual(c.cfgAt(SARDOR, "2026-07-01").tz, 5, "Tashkent never shifts");
    assert.strictEqual(c.cfgAt(SARDOR, "2026-12-01").tz, 5);
  },

  "London, Berlin and New York keep their winter offset in the list"(assert) {
    /* They were stored on summer time, which was silently an hour out for half of
       every year. The rule carries the shift now, so the list holds the standard. */
    const c = client();
    const shahar = n => c.CITIES.find(x => x.n === n);
    assert.strictEqual(shahar("London").tz, 0);
    assert.strictEqual(shahar("Berlin").tz, 1);
    assert.strictEqual(shahar("Nyu-York").tz, -5);
    assert.strictEqual(c.DST.yevropa("2026-07-01"), true, "Europe in July");
    assert.strictEqual(c.DST.yevropa("2026-01-01"), false);
    assert.strictEqual(c.DST.amerika("2026-07-01"), true);
    assert.strictEqual(c.DST.amerika("2026-12-25"), false);
  },
};
