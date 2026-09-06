/* Haftalik KPI: three tiers, three amounts, and how far each adult is from the next.
   Points come from the same place the ranking reads plus what they did with the
   children — one act should count once, in both places it belongs. */
const { loadClient } = require("./harness");

const mk = (id, name, over = {}) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
  ...over,
});
const OTA = mk("sardor", "Sardor Valixanov", { kpi_easy: 10, kpi_mid: 20, kpi_hard: 30 });
const ONA = mk("zuhra", "Zuhra", { kpi_easy: 5, kpi_mid: 8, kpi_hard: 12 });
const AZIZ = mk("aziz", "Aziz", { is_child: true, reward_goal: 20 });
const OILA = { id: 2, name: "Oilam", kind: "family", owner_id: "sardor",
  week_goal: 25, bonus_easy: 20, bonus_mid: 50, bonus_hard: 100 };
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];
/* Walk real dates: "2026-08-32" is not a day, and the scoring quietly agreed. */
const prayed = (n) => {
  const days = {};
  let d = new Date("2026-08-31T12:00:00");
  for (let i = 0; i < n; i += 1) {
    days[d.toISOString().slice(0, 10)] =
      Object.fromEntries(FARD.map(k => [k, { s: "ontime" }]));
    d = new Date(d.getTime() + 86400000);
  }
  return { ...blank(), days };
};

function client(patch = {}) {
  const loaded = loadClient({
    at: "2026-09-06T07:00:00Z",
    expose: ["kpiHolat", "weekRange"],
    routes: { "/members/zuhra/kpi": { ok: true }, "/circles/2/bonuses": OILA },
  });
  loaded.setState({
    members: [OTA, ONA, AZIZ],
    /* Every closed day of the week marked, so the baseline is a clean positive
       number and the test is about tiers rather than about gaps. */
    data: { sardor: prayed(6), zuhra: prayed(6), aziz: blank() },
    me: "sardor", date: "2026-09-06", token: "tok", isAdmin: false, circleId: 2,
    circles: [OILA], deeds: [], rewards: [], skills: [], duels: [],
    ...patch,
  });
  return loaded;
}
const wk = ["2026-08-31", "2026-09-06"];

module.exports = {
  "what was done with the children counts toward the KPI"(assert) {
    /* Against a baseline rather than an absolute: the prayer half of the score is
       the ranking's business and is tested there. */
    const bare = client().kpiHolat(ONA, wk[0], wk[1]).ball;
    const withDeed = client({
      deeds: [{ id: 1, child_id: "aziz", adult_id: "zuhra", deed: "arab", day: "2026-09-02" }],
    }).kpiHolat(ONA, wk[0], wk[1]).ball;
    assert.strictEqual(withDeed - bare, 3, "teaching a letter is worth three");
  },

  "a deed outside the week does not count toward it"(assert) {
    const bare = client().kpiHolat(ONA, wk[0], wk[1]).ball;
    const outside = client({
      deeds: [{ id: 1, child_id: "aziz", adult_id: "zuhra", deed: "arab", day: "2026-08-20" }],
    }).kpiHolat(ONA, wk[0], wk[1]).ball;
    assert.strictEqual(outside, bare, "last week is last week's");
  },

  "the tier reached is the highest one cleared, and the next one is named"(assert) {
    /* Thresholds pinned around whatever the week actually scored, so the test is
       about the tiers rather than about the prayer arithmetic. */
    const base = client().kpiHolat(ONA, wk[0], wk[1]).ball;
    const her = { ...ONA, kpi_easy: base - 2, kpi_mid: base, kpi_hard: base + 5 };
    const c = client({ members: [OTA, her, AZIZ] });
    const k = c.kpiHolat(her, wk[0], wk[1]);
    assert.strictEqual(k.daraja, 2, "she cleared easy and mid, not hard");
    assert.strictEqual(k.pul, 50);
    assert.strictEqual(k.keyingi, base + 5, "hard is what is left");
    assert.strictEqual(k.qolgan, 5);
  },

  "nobody without thresholds has a KPI at all"(assert) {
    const c = client({ members: [mk("behruz", "Behruz"), AZIZ] });
    assert.strictEqual(c.kpiHolat(mk("behruz", "Behruz"), wk[0], wk[1]).bor, false);
  },

  "children are not given a KPI"(assert) {
    const c = client();
    assert.strictEqual(c.kpiHolat(AZIZ, wk[0], wk[1]).bor, false);
  },

  async "the family page shows each adult's tier and what is left"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("stats");
    const h = c.html;
    assert.ok(h.includes("KPI"), "expected the KPI panel");
    assert.ok(/\$\d+/.test(h), "with the money on it");
    assert.ok(/Oson|O'rta|Qiyin/.test(h), "and the tier named");
    assert.ok(h.includes("Zuhra"), "and everybody who has one");
  },

  async "friends have no KPI panel"(assert) {
    const c = client({ circles: [{ ...OILA, kind: "friends", name: "Do'stlar" }] });
    await c.A.go("app");
    c.A.setTab("stats");
    assert.ok(!c.html.includes("KPI"), "this is a family arrangement");
  },

  async "the owner sets the thresholds and the amounts"(assert) {
    const c = client();
    c.setPrompt("6");
    await c.A.setKpi("zuhra");
    const sent = c.calls.find(x => x.path === "/members/zuhra/kpi");
    assert.ok(sent, "expected the thresholds to be sent");
    assert.strictEqual(sent.body.kpi_easy, 6);

    c.setPrompt("30");
    await c.A.setBonuses();
    assert.ok(c.calls.some(x => x.path === "/circles/2/bonuses"));
  },
};
