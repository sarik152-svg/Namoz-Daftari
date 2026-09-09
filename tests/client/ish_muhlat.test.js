/* Kun yarim tunda emas, keyingi kunning bomdodida yopiladi — hamma uchun va har
   bir namoz uchun (2026-09-10, Sardor). Ish rejimi endi kunni emas, BAHONI
   o'zgartiradi: uzilgan peshin/asr/shom unga vaqtida deb yoziladi, boshqaga esa
   o'sha uzilgan namoz qazo bo'lib qolaveradi. */
const { loadClient } = require("./harness");

const mk = (over = {}) => ({
  id: "shax", name: "Shahriddin", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18, ...over,
});
const ISH = mk({ work_shift: true });
const ODDIY = mk({ id: "sardor", name: "Sardor" });
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

/* 2026-09-05 19:20Z is 00:20 on the 6th in Toshkent — past midnight, before Fajr. */
function client(m, at = "2026-09-05T19:20:00Z") {
  const loaded = loadClient({
    at, expose: ["liveDay", "winState", "prayerRange", "todayFor", "cfgNow"],
    routes: { "/members/shax/days/2026-09-05": { ok: true },
              "/members/sardor/days/2026-09-05": { ok: true },
              "/members/shax/days/2026-09-06": { ok: true } },
  });
  loaded.setState({
    members: [m], data: { [m.id]: blank() },
    me: m.id, date: "2026-09-06", token: "tok", isAdmin: false,
  });
  return loaded;
}

module.exports = {
  "after midnight, the midday prayers still belong to yesterday"(assert) {
    const c = client(ISH);
    assert.strictEqual(c.todayFor(ISH), "2026-09-06", "the clock has turned over");
    ["peshin", "asr", "shom"].forEach(k => {
      assert.strictEqual(c.liveDay(k, ISH), "2026-09-05", k + " belongs to yesterday");
    });
  },

  "the same window is everybody's, not only a work shift"(assert) {
    /* Sardor prayed his Shom late in the evening and was charged a whole point for
       it. The day now runs to the next Fajr for everyone. */
    const c = client(ODDIY);
    ["peshin", "asr", "shom"].forEach(k => {
      assert.strictEqual(c.liveDay(k, ODDIY), "2026-09-05", k + " still belongs to yesterday");
    });
  },

  "bomdod is in the window too — every prayer is"(assert) {
    const c = client(ISH);
    assert.strictEqual(c.liveDay("bomdod", ISH), "2026-09-05");
    assert.strictEqual(c.liveDay("bomdod", ODDIY), "2026-09-05");
  },

  "a day already past is never 'not yet'"(assert) {
    /* Yesterday's Peshin at twenty past midnight was being called "early", and the
       app refuses to mark a prayer whose time has not come. */
    const c = client(ISH);
    assert.strictEqual(c.winState("peshin", "2026-09-05", ISH), "past");
  },

  async "marking it then is worth a full point, not a penalty"(assert) {
    const c = client(ISH);
    /* Yesterday's Bomdod is already marked: it gets no grace, and an unmarked one
       would cost its own point and muddy what this test is about. */
    c.setState({ data: { shax: { ...blank(),
      days: { "2026-09-05": { bomdod: { s: "ontime" } } } } } });
    await c.A.mark("peshin", "pray");
    const day = ((c.__me().days || {})["2026-09-05"]) || {};
    assert.ok(day.peshin, "it must land on yesterday, not today");
    assert.strictEqual(day.peshin.s, "qazo", "recorded as caught up");
    const o = c.prayerRange(c.__me(), ISH, "2026-09-05", "2026-09-05");
    assert.strictEqual(o.ontime, 2, "Bomdod and the caught-up Peshin");
    assert.strictEqual(o.bad, 0, "Asr, Shom and Xufton are still open to him");
    assert.strictEqual(o.ball, 2, "a full point each, no penalty");
  },

  "while the grace lasts, an unmarked midday prayer is not charged"(assert) {
    /* The point of the window: at twenty past midnight he can still mark them, so
       charging him for not having done it yet would be charging him twice. */
    const c = client(ISH);
    const u = { ...blank(), days: { "2026-09-05": { bomdod: { s: "ontime" } } } };
    const o = c.prayerRange(u, ISH, "2026-09-05", "2026-09-05");
    assert.strictEqual(o.bad, 0, "nothing is owed yet");
    const other = c.prayerRange(u, ODDIY, "2026-09-05", "2026-09-05");
    assert.strictEqual(other.bad, 0, "and nobody else is charged before Fajr either");
  },

  async "the same tap lands on yesterday for anybody else — but as a qazo"(assert) {
    /* This is what the work shift is now worth: not a longer day, a kinder verdict.
       The prayer is caught up either way; only its value differs. */
    const c = client(ODDIY);
    await c.A.mark("peshin", "pray");
    const day = ((c.__me().days || {})["2026-09-05"]) || {};
    assert.strictEqual(day.peshin.s, "qazo", "it lands on yesterday, caught up");
    const o = c.prayerRange(c.__me(), ODDIY, "2026-09-05", "2026-09-05");
    assert.strictEqual(o.qazo, 1, "a qazo for him");
    assert.strictEqual(o.ontime, 0, "not the work shift's on-time");
    assert.strictEqual(o.ball, -0.25, "quarter of a point, not a whole one");
  },

  "once fajr has passed, yesterday is closed to everyone"(assert) {
    /* 2026-09-06 02:00Z is 07:00 in Toshkent, well after Fajr. The concession is
       for that night, not for putting a prayer off indefinitely. */
    const c = client(ISH, "2026-09-06T02:00:00Z");
    assert.strictEqual(c.liveDay("peshin", ISH), "2026-09-06", "the window has run out");
    assert.strictEqual(c.liveDay("shom", ODDIY), "2026-09-06");
    const u = { ...blank(), days: { "2026-09-05": { bomdod: { s: "ontime" } } } };
    assert.strictEqual(c.prayerRange(u, ODDIY, "2026-09-05", "2026-09-05").bad, 4,
      "now the four unmarked ones are lost");
  },
};
