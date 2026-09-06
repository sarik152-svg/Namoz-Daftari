/* Haftalik vazifa: bir hafta — bir yaxshi amal. Bajarilsa +2, hafta bajarilmay
   yopilsa −1. Qaysi amal ekani haftaning o'zidan chiqadi, hech qayerda saqlanmaydi. */
const { loadClient } = require("./harness");

const mk = (over = {}) => ({
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18, ...over,
});
const SARDOR = mk();
const BOLA = mk({ id: "aziz", name: "Aziz", is_child: true });
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

/* 2026-09-06 is a Sunday: the last day of the week that began on the 31st. */
function client(at = "2026-09-06T07:00:00Z", patch = {}) {
  const loaded = loadClient({
    at,
    expose: ["prayerRange", "haftaAmali", "AMALLAR", "AMAL_BALL", "AMAL_JARIMA",
             "weekRange", "amalBajarilgan"],
    routes: { "/members/sardor/days/2026-09-06": { ok: true } },
  });
  loaded.setState({
    members: [SARDOR, BOLA], data: { sardor: blank(), aziz: blank() },
    me: "sardor", date: "2026-09-06", token: "tok", isAdmin: false, circleId: 1,
    ...patch,
  });
  return loaded;
}
const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];
const week = (from, to, amalOn) => {
  const days = {};
  let d = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  while (d <= end) {
    const ds = d.toISOString().slice(0, 10);
    days[ds] = Object.fromEntries(FARD.map(k => [k, { s: "ontime" }]));
    if (ds === amalOn) days[ds].amal = true;
    d = new Date(d.getTime() + 86400000);
  }
  return { ...blank(), days };
};

module.exports = {
  "there are plenty of deeds, and they are real things to do"(assert) {
    const c = client();
    assert.ok(c.AMALLAR.length >= 12, "one a week wants a long list: " + c.AMALLAR.length);
    assert.ok(c.AMALLAR.every(a => typeof a === "string" && a.length > 10));
  },

  "the same week gives everyone the same deed, and a new week a new one"(assert) {
    const c = client();
    const bu = c.haftaAmali("2026-08-31");
    assert.strictEqual(bu, c.haftaAmali("2026-08-31"), "settled by the week itself");
    assert.notStrictEqual(bu, c.haftaAmali("2026-09-07"), "next week is another");
  },

  "doing it is worth two points"(assert) {
    const c = client();
    const done = week("2026-08-31", "2026-09-06", "2026-09-02");
    const not = week("2026-08-31", "2026-09-06", null);
    const a = c.prayerRange(done, SARDOR, "2026-08-31", "2026-09-06");
    const b = c.prayerRange(not, SARDOR, "2026-08-31", "2026-09-06");
    assert.strictEqual(a.ball - b.ball, c.AMAL_BALL);
    assert.strictEqual(a.amal, 1);
  },

  "the week still running costs nothing yet"(assert) {
    const c = client();
    const o = c.prayerRange(week("2026-08-31", "2026-09-06", null), SARDOR,
      "2026-08-31", "2026-09-06");
    assert.strictEqual(o.amalYoq, 0, "there is still today to do it in");
  },

  "a week that closed without it costs a point"(assert) {
    const c = client("2026-09-09T07:00:00Z");
    const o = c.prayerRange(week("2026-08-31", "2026-09-06", null), SARDOR,
      "2026-08-31", "2026-09-06");
    assert.strictEqual(o.amalYoq, 1);
    const done = c.prayerRange(week("2026-08-31", "2026-09-06", "2026-09-02"), SARDOR,
      "2026-08-31", "2026-09-06");
    assert.strictEqual(done.amalYoq, 0, "done is done");
    assert.strictEqual(o.ball, done.ball - c.AMAL_BALL - c.AMAL_JARIMA);
  },

  "a child is never fined for it"(assert) {
    const c = client("2026-09-09T07:00:00Z");
    const o = c.prayerRange(week("2026-08-31", "2026-09-06", null), BOLA,
      "2026-08-31", "2026-09-06");
    assert.strictEqual(o.amalYoq, 0, "no penalty work for a child, this included");
  },

  async "it sits on Bugun between the prayers and the make-up notebook"(assert) {
    const c = client();
    await c.A.go("app");
    const h = c.html;
    const amal = h.indexOf("Haftalik vazifa");
    assert.ok(amal > 0, "expected the weekly deed on Bugun");
    assert.ok(h.indexOf(">Xufton<") < amal, "after the prayers");
    assert.ok(amal < h.indexOf("Qazo daftari"), "and before the make-up notebook");
  },

  async "ticking it writes the day and sends it"(assert) {
    const c = client();
    await c.A.go("app");
    await c.A.setAmal(true);
    assert.strictEqual(c.__day("amal"), true);
    assert.ok(c.calls.some(x => x.method === "PUT"), "and it reaches the server");
    assert.ok(c.html.includes("Bajarildi"), "the screen says so");
  },

  "done on any day of the week counts for that week"(assert) {
    const c = client();
    const wk = c.weekRange("2026-09-06");
    assert.ok(c.amalBajarilgan(week("2026-08-31", "2026-09-06", "2026-09-01"), wk));
    assert.ok(!c.amalBajarilgan(week("2026-08-31", "2026-09-06", null), wk));
  },

  "ticking it on two days of one week is still one deed"(assert) {
    /* One deed a week is the whole rule. Crediting each ticked day paid twice for a
       slip of the thumb, which is what Sardor hit. */
    const c = client();
    const bir = week("2026-08-31", "2026-09-06", "2026-09-02");
    const ikki = week("2026-08-31", "2026-09-06", "2026-09-02");
    ikki.days["2026-09-04"] = { ...ikki.days["2026-09-04"], amal: true };
    const a = c.prayerRange(bir, SARDOR, "2026-08-31", "2026-09-06");
    const b = c.prayerRange(ikki, SARDOR, "2026-08-31", "2026-09-06");
    assert.strictEqual(b.amal, 1, "one deed, however many times it was tapped");
    assert.strictEqual(b.ball, a.ball, "and worth the same as ticking it once");
  },

  "two weeks each pay once"(assert) {
    const c = client("2026-09-09T07:00:00Z");
    const u = week("2026-08-31", "2026-09-06", "2026-09-02");
    Object.assign(u.days, week("2026-09-07", "2026-09-08", "2026-09-07").days);
    const o = c.prayerRange(u, SARDOR, "2026-08-31", "2026-09-13");
    assert.strictEqual(o.amal, 2, "a deed in each of two weeks");
  },

  async "and it cannot be ticked twice in the first place"(assert) {
    const c = client();
    await c.A.go("app");
    await c.A.setAmal(true);
    const before = c.calls.filter(x => x.method === "PUT").length;
    c.setState({ date: "2026-09-04" });
    await c.A.setAmal(true);
    assert.strictEqual(c.calls.filter(x => x.method === "PUT").length, before,
      "the week already has its deed");
  },
};