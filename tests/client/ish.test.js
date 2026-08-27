/* Ish rejimi. Somebody whose shift covers the middle of the day prays Peshin, Asr
   and Shom when they get home; made up the same day, those three count as prayed on
   time. Nothing else about their record is treated differently. */
const { loadClient } = require("./harness");

const SARDOR = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const SHAHRIDDIN = { ...SARDOR, id: "shahriddin", name: "Shahriddin", work_shift: true };
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const withDay = (day) => ({ ...blank(), days: { "2026-08-22": day } });

function client(patch = {}) {
  const loaded = loadClient({
    at: "2026-08-22T09:00:00Z",
    expose: ["score", "prayerRange", "P_QAZO", "P_MISS", "JAMOAT_BALL"],
  });
  loaded.setState({
    members: [SARDOR, SHAHRIDDIN],
    data: { sardor: blank(), shahriddin: blank() },
    me: "shahriddin", date: "2026-08-22", token: "tok", isAdmin: false,
    ...patch,
  });
  return loaded;
}
const oneDay = (c, m, day) => c.prayerRange(withDay(day), m, "2026-08-22", "2026-08-22");

module.exports = {
  "a midday prayer made up the same day counts as on time"(assert) {
    const c = client();
    const o = oneDay(c, SHAHRIDDIN, { peshin: { s: "qazo", t: "20:10" } });
    assert.strictEqual(o.ontime, 1, "it must count as prayed on time");
    assert.strictEqual(o.qazo, 0, "and not as a late prayer");
    assert.strictEqual(o.ball, 1, "worth a full point");
  },

  "all three of the shift prayers get the same treatment"(assert) {
    const c = client();
    const o = oneDay(c, SHAHRIDDIN, {
      peshin: { s: "qazo", t: "20:10" },
      asr: { s: "qazo", t: "20:25" },
      shom: { s: "qazo", t: "20:40" },
    });
    assert.strictEqual(o.ball, 3);
  },

  "the very same marks still cost anybody else"(assert) {
    const c = client();
    const o = oneDay(c, SARDOR, { peshin: { s: "qazo", t: "20:10" } });
    assert.strictEqual(o.qazo, 1);
    assert.strictEqual(o.ball, -c.P_QAZO);
  },

  "bomdod and xufton are judged as strictly as anyone's"(assert) {
    const c = client();
    const o = oneDay(c, SHAHRIDDIN, {
      bomdod: { s: "qazo", t: "09:10" },
      xufton: { s: "qazo", t: "23:50" },
    });
    assert.strictEqual(o.qazo, 2, "the shift does not cover these two");
    assert.strictEqual(o.ball, -2 * c.P_QAZO);
  },

  "a prayer left until the next day still costs a full point"(assert) {
    const c = client();
    const o = oneDay(c, SHAHRIDDIN, { peshin: { s: "late" } });
    assert.strictEqual(o.bad, 1);
    assert.strictEqual(o.ball, -c.P_MISS, "the concession is for the shift, not for delay");
  },

  "an unmarked prayer on a closed day is still a miss"(assert) {
    const c = client();
    const o = c.prayerRange(
      { ...blank(), days: { "2026-08-20": { peshin: { s: "ontime" } } } },
      SHAHRIDDIN, "2026-08-20", "2026-08-20",
    );
    assert.strictEqual(o.bad, 4, "the other four fard prayers of that closed day");
  },

  "the debt ledger makes the same concession as the ranking"(assert) {
    const c = client();
    const eased = c.score(withDay({ peshin: { s: "qazo", t: "20:10" } }), SHAHRIDDIN, false);
    const plain = c.score(withDay({ peshin: { s: "qazo", t: "20:10" } }), SARDOR, false);
    assert.strictEqual(eased.penalty, 0, "no penalty for a shift prayer made up in the day");
    assert.strictEqual(plain.penalty, c.P_QAZO, "and the ordinary rule is untouched");
  },

  async "the day card calls it prayed on time rather than late"(assert) {
    const c = client({
      data: { sardor: blank(), shahriddin: withDay({ asr: { s: "qazo", t: "20:25" } }) },
    });
    await c.A.go("app");
    assert.ok(c.html.includes("ISH REJIMI"), "the card should say why it was not a penalty");
    assert.ok(!c.html.includes("−0,25 ball"), "no quarter-point penalty should be shown");
  },

  async "the concession is granted by the circle owner, on its own route"(assert) {
    const c = loadClient({
      at: "2026-08-22T09:00:00Z",
      routes: { "/members/shahriddin/work-shift": { ok: true },
                "/circles/1/roster": { members: [] },
                "/circles": { circles: [] },
                "/state": { members: [SARDOR, SHAHRIDDIN], data: {} } },
    });
    c.setState({
      members: [SARDOR, SHAHRIDDIN], data: { sardor: blank(), shahriddin: blank() },
      me: "sardor", date: "2026-08-22", token: "tok", isAdmin: false,
    });
    await c.A.setWorkShift("shahriddin", true);
    const sent = c.calls.find(x => x.path === "/members/shahriddin/work-shift");
    assert.ok(sent, "expected the flag to be set through its own route");
    assert.strictEqual(sent.body.work_shift, true);
  },
};