/* The wall between the two circles. Points earned with the children belong to the
   family's KPI and to the child's wish — they must never reach the friends' ranking,
   which is about prayer and nothing else. */
const { loadClient } = require("./harness");

const mk = (id, name, over = {}) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
  ...over,
});
const SARDOR = mk("sardor", "Sardor Valixanov", { kpi_easy: 1, kpi_mid: 50, kpi_hard: 99 });
const BEHRUZ = mk("behruz", "Behruz Qurbonov");
const AZIZ = mk("aziz", "Aziz", { is_child: true, reward_goal: 20 });
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];
const prayed = () => {
  const days = {};
  let d = new Date("2026-08-31T12:00:00");
  for (let i = 0; i < 6; i += 1) {
    days[d.toISOString().slice(0, 10)] =
      Object.fromEntries(FARD.map(k => [k, { s: "ontime" }]));
    d = new Date(d.getTime() + 86400000);
  }
  return { ...blank(), days };
};
/* Enough deeds to swamp a week of prayer, if they leaked. */
const KOP = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, child_id: "aziz", adult_id: "sardor", deed: "arab", day: "2026-09-02",
}));

function client(kind, deeds) {
  const loaded = loadClient({
    at: "2026-09-06T07:00:00Z",
    expose: ["prayerRange", "kpiHolat", "rankBy", "weekRange", "bolaHolat"],
  });
  loaded.setState({
    members: [SARDOR, BEHRUZ, AZIZ],
    data: { sardor: prayed(), behruz: prayed(), aziz: blank() },
    me: "sardor", date: "2026-09-06", token: "tok", isAdmin: false, circleId: 2,
    circles: [{ id: 2, name: kind === "family" ? "Oilam" : "Do'stlar", kind,
      owner_id: "sardor", week_goal: 25, bonus_easy: 20, bonus_mid: 50, bonus_hard: 100 }],
    deeds, rewards: [], skills: [], duels: [],
  });
  return loaded;
}
const wk = ["2026-08-31", "2026-09-06"];

module.exports = {
  "what was done with the children never reaches the prayer score"(assert) {
    const without = client("friends", []).prayerRange(prayed(), SARDOR, wk[0], wk[1]).ball;
    const with_ = client("friends", KOP).prayerRange(prayed(), SARDOR, wk[0], wk[1]).ball;
    assert.strictEqual(with_, without, "thirty-six points of teaching, and the ball is the same");
  },

  "so the friends' podium cannot be moved by it either"(assert) {
    const bare = client("friends", []).rankBy(wk[0], wk[1], "namoz");
    const loaded = client("friends", KOP).rankBy(wk[0], wk[1], "namoz");
    assert.strictEqual(JSON.stringify(bare.map(x => [x.m.id, x.ball])),
      JSON.stringify(loaded.map(x => [x.m.id, x.ball])),
      "the same people with the same numbers in the same order");
  },

  "it does reach the family KPI, which is where it belongs"(assert) {
    const bare = client("family", []).kpiHolat(SARDOR, wk[0], wk[1]).ball;
    const loaded = client("family", KOP).kpiHolat(SARDOR, wk[0], wk[1]).ball;
    assert.strictEqual(loaded - bare, 36, "twelve letters at three points each");
  },

  "and the child's own progress"(assert) {
    const c = client("family", KOP);
    assert.strictEqual(c.bolaHolat(AZIZ).jami, 36);
  },

  async "a friends circle shows no trace of the children at all"(assert) {
    const c = client("friends", KOP);
    await c.A.go("app");
    assert.ok(!c.html.includes("A.addDeed()"), "no children's panel");
    c.A.setTab("stats");
    assert.ok(!c.html.includes("Haftalik KPI"), "no KPI panel");
    assert.ok(c.html.includes("Hafta qahramoni"), "the ordinary podium, untouched");
  },
};
