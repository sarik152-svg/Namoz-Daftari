/* The year view: who took each finished month, and the totals that never reset. */
const { loadClient } = require("./harness");

const mk = (id, name) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
});
const SARDOR = mk("sardor", "Sardor Valixanov");
const BEHRUZ = mk("behruz", "Behruz Qurbonov");
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];
const fullDay = () => Object.fromEntries(FARD.map(k => [k, { s: "ontime" }]));
const on = (...dates) => ({
  ...blank(), days: Object.fromEntries(dates.map(d => [d, fullDay()])),
});

function client(patch = {}) {
  const loaded = loadClient({
    at: "2026-08-28T09:00:00Z",
    expose: ["prayerRange", "oyGolibi", "oyQahramonlari", "yearRange", "OY"],
  });
  loaded.setState({
    members: [SARDOR, BEHRUZ],
    data: { sardor: on("2026-06-15"), behruz: on("2026-07-15") },
    me: "sardor", date: "2026-08-28", token: "tok", isAdmin: false, circleId: 1,
    ...patch,
  });
  return loaded;
}

module.exports = {
  "a year is not cut short after forty days"(assert) {
    /* The range loop was capped at forty iterations, which was plenty for a week or
       a month and silently lost most of a year. */
    const c = client();
    const both = on("2026-01-05", "2026-06-15");
    const o = c.prayerRange(both, SARDOR, "2026-01-01", "2026-12-31");
    assert.strictEqual(o.ontime, 10, "both days must be counted, five months apart");
  },

  "each finished month names its champion"(assert) {
    const c = client();
    assert.strictEqual(c.oyGolibi(2026, 5).m.id, "sardor", "June is Sardor's");
    assert.strictEqual(c.oyGolibi(2026, 6).m.id, "behruz", "July is Behruz's");
  },

  "somebody who was not there that month cannot win it"(assert) {
    /* Scoring starts at a member's first record, so a month they logged nothing in
       comes out as a flat zero — which would otherwise beat somebody who was
       there and missed a few. */
    const c = client();
    const june = c.oyGolibi(2026, 5);
    assert.ok(june && june.m.id === "sardor", "Behruz logged nothing in June");
  },

  "the month still running has no champion yet"(assert) {
    const c = client();
    assert.strictEqual(c.oyGolibi(2026, 7), null, "August is not over");
  },

  "a month nobody prayed in has no champion"(assert) {
    const c = client();
    assert.strictEqual(c.oyGolibi(2026, 2), null, "nothing was logged in March");
  },

  "months won are tallied per person"(assert) {
    const c = client();
    const tally = c.oyQahramonlari(2026);
    assert.strictEqual(tally.count.sardor, 1);
    assert.strictEqual(tally.count.behruz, 1);
    assert.strictEqual(tally.rows.length, 12, "every month of the year gets a row");
    assert.strictEqual(tally.rows[5].golib.id, "sardor", "June");
    assert.strictEqual(tally.rows[7].golib, null, "August is still running");
  },

  async "the ranking offers a year beside the week and the month"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("stats");
    assert.ok(c.html.includes("A.setStatPeriod('yil')"), "expected a year button");
  },

  async "the year page leads with who has taken the most months"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("stats");
    c.A.setStatPeriod("yil");
    const h = c.html;
    assert.ok(h.includes("Oy qahramonlari"), "expected the months-won card");
    assert.ok(h.indexOf("Oy qahramonlari") < h.indexOf("Umumiy"),
      "the months won come before the lifetime totals");
    assert.ok(h.includes("iyun"), "expected the month-by-month table");
    assert.ok(h.includes("Duel g'alabalari"), "duel wins belong in the totals");
  },
};
