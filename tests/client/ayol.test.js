/* Ayollar rejimi. A prayer caught up before the next Fajr earns a full point.
   On time and left-until-tomorrow are judged as anybody's. */
const { loadClient } = require("./harness");

const SARDOR = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const ZUHRA = { ...SARDOR, id: "zuhra", name: "Zuhra", woman_mode: true };
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const withDay = (day) => ({ ...blank(), days: { "2026-08-22": day } });

function client(patch = {}) {
  const loaded = loadClient({
    at: "2026-08-22T09:00:00Z",
    expose: ["score", "prayerRange", "P_QAZO", "P_MISS", "AYOL_BALL"],
    routes: { "/members/zuhra/woman-mode": { ok: true } },
  });
  loaded.setState({
    members: [SARDOR, ZUHRA], data: { sardor: blank(), zuhra: blank() },
    me: "zuhra", date: "2026-08-22", token: "tok", isAdmin: false,
    ...patch,
  });
  return loaded;
}
const oneDay = (c, m, day) => c.prayerRange(withDay(day), m, "2026-08-22", "2026-08-22");

module.exports = {
  "catching a prayer up the same day earns instead of costing"(assert) {
    const c = client();
    const o = oneDay(c, ZUHRA, { peshin: { s: "qazo", t: "20:10" } });
    assert.strictEqual(o.ball, 1);
    assert.strictEqual(o.qazo, 1, "it is still a caught-up prayer, not an on-time one");
    assert.strictEqual(o.ontime, 0, "and it must not be counted as prayed on time");
  },

  async "Peshin Asr and Shom caught up after midnight earn one point each"(assert) {
    const c = loadClient({
      at: "2026-08-22T19:20:00Z", // 00:20 the next day in Toshkent, before Fajr.
      expose: ["prayerRange", "belgiBall"],
      routes: { "/members/zuhra/days/2026-08-22": { ok: true } },
    });
    c.setState({
      members: [ZUHRA], data: { zuhra: blank() },
      me: "zuhra", date: "2026-08-23", token: "tok", isAdmin: false,
    });
    for (const k of ["peshin", "asr", "shom"]) {
      await c.A.mark(k, "pray");
      const mark = c.__me().days["2026-08-22"][k];
      assert.strictEqual(mark.s, "qazo", k + " stays a caught-up prayer on yesterday's record");
      assert.strictEqual(c.belgiBall(ZUHRA, { k }, mark, mark.s), 1);
    }
    const o = c.prayerRange(c.__me(), ZUHRA, "2026-08-22", "2026-08-22");
    assert.strictEqual(o.ball, 3);
    assert.strictEqual(o.qazo, 3);
    assert.strictEqual(o.bad, 0, "the day stays open until Fajr");
  },

  "the same mark still costs anybody else"(assert) {
    const c = client();
    assert.strictEqual(oneDay(c, SARDOR, { peshin: { s: "qazo" } }).ball, -c.P_QAZO);
  },

  "praying on time scores exactly as it does for anybody"(assert) {
    const c = client();
    assert.strictEqual(oneDay(c, ZUHRA, { peshin: { s: "ontime", t: "13:10" } }).ball, 1);
  },

  "a day allowed to close still costs a full point"(assert) {
    const c = client();
    const o = oneDay(c, ZUHRA, { peshin: { s: "late" } });
    assert.strictEqual(o.ball, -c.P_MISS, "the concession is for the same day only");
  },

  "the concession reaches the debt as well as the ranking"(assert) {
    const c = client();
    const her = c.score(withDay({ peshin: { s: "qazo" } }), ZUHRA, false);
    const his = c.score(withDay({ peshin: { s: "qazo" } }), SARDOR, false);
    assert.strictEqual(her.penalty, 0, "no penalty is booked");
    assert.strictEqual(his.penalty, c.P_QAZO);
    assert.ok(her.debt < his.debt, "and it takes the debt down rather than up");
  },

  async "the day card shows it as earned, not as a penalty"(assert) {
    const c = client({ data: { sardor: blank(), zuhra: withDay({ asr: { s: "qazo", t: "20:25" } }) } });
    await c.A.go("app");
    assert.ok(c.html.includes("AYOLLAR REJIMI"), "the card should say why it was not a penalty");
    assert.ok(c.html.includes('+1 ball</span>'), "the caught-up prayer earns a full point on its card");
    assert.ok(c.html.includes("keyingi bomdodgacha o'qisangiz +1 ball"), "the hint uses the same value and deadline");
    assert.ok(!c.html.includes("−0,25 ball"), "no quarter-point penalty should be shown");
  },

  async "the concession is granted by the circle owner, on its own route"(assert) {
    const c = client({ me: "sardor" });
    await c.A.setWomanMode("zuhra", true);
    const sent = c.calls.find(x => x.path === "/members/zuhra/woman-mode");
    assert.ok(sent, "expected its own route");
    assert.strictEqual(sent.body.woman_mode, true);
  },
};
