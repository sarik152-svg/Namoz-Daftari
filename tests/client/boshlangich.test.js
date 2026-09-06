/* Boshlang'ich ball: an opening balance for somebody who joined late. It is its own
   line, never prayer marks — writing worship on somebody's behalf is not ours to do. */
const { loadClient } = require("./harness");

const mk = (id, name, over = {}) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
  ...over,
});
const SARDOR = mk("sardor", "Sardor Valixanov");
const MUNOJAT = mk("munojat", "Munojat", { start_ball: 25, start_day: "2026-09-07" });
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

function client(at = "2026-09-07T07:00:00Z") {
  const loaded = loadClient({
    at, expose: ["prayerRange", "TARKIB", "ballTarkib", "weekRange"],
    routes: { "/members/munojat/start-ball": { ok: true },
              "/circles/2/roster": { members: [
                { id: "munojat", name: "Munojat", city: "Toshkent", pin: "1", is_child: false }] } },
  });
  loaded.setState({
    members: [SARDOR, MUNOJAT], data: { sardor: blank(), munojat: blank() },
    me: "sardor", date: "2026-09-07", token: "tok", isAdmin: false, circleId: 2,
    circles: [{ id: 2, name: "Oilam", kind: "family", owner_id: "sardor",
      week_goal: 25, bonus_easy: 20, bonus_mid: 50, bonus_hard: 100 }],
    deeds: [], rewards: [], skills: [], duels: [],
  });
  return loaded;
}

module.exports = {
  "the balance counts in the week that contains its day"(assert) {
    const c = client();
    const wk = c.weekRange("2026-09-07");
    const o = c.prayerRange(blank(), MUNOJAT, wk[0], wk[1]);
    assert.strictEqual(o.boshlangich, 25);
    assert.strictEqual(o.ball, 25);
  },

  "and never again in a later week"(assert) {
    const c = client("2026-09-16T07:00:00Z");
    const o = c.prayerRange(blank(), MUNOJAT, "2026-09-14", "2026-09-20");
    assert.strictEqual(o.boshlangich, 0, "an opening balance opens once");
    assert.strictEqual(o.ball, 0);
  },

  "it counts once in the month and once in the year too"(assert) {
    const c = client();
    assert.strictEqual(
      c.prayerRange(blank(), MUNOJAT, "2026-09-01", "2026-09-30").boshlangich, 25);
    assert.strictEqual(
      c.prayerRange(blank(), MUNOJAT, "2026-01-01", "2026-12-31").boshlangich, 25);
  },

  "nobody else is given one"(assert) {
    const c = client();
    const wk = c.weekRange("2026-09-07");
    assert.strictEqual(c.prayerRange(blank(), SARDOR, wk[0], wk[1]).boshlangich, 0);
  },

  "it is never counted as a prayer"(assert) {
    const c = client();
    const wk = c.weekRange("2026-09-07");
    const o = c.prayerRange(blank(), MUNOJAT, wk[0], wk[1]);
    assert.strictEqual(o.ontime, 0, "she has prayed nothing yet, and the app says so");
    assert.strictEqual(o.qazo, 0);
    assert.strictEqual(o.bad, 0);
  },

  "the breakdown shows it as its own line"(assert) {
    const c = client();
    const wk = c.weekRange("2026-09-07");
    const o = c.prayerRange(blank(), MUNOJAT, wk[0], wk[1]);
    const total = c.TARKIB.reduce((n, r) => n + c.ballTarkib(MUNOJAT, o, r.k), 0);
    assert.strictEqual(total, o.ball, "the rows must still add up to the total");
    assert.ok(c.TARKIB.some(r => r.k === "boshlangich"), "and it has a row of its own");
  },

  async "the owner sets it from the roster"(assert) {
    const c = client();
    await c.A.go("sync");
    assert.ok(c.html.includes("A.setStartBall('munojat')"), "expected it in the roster");
    c.setPrompt("25");
    await c.A.setStartBall("munojat");
    const sent = c.calls.find(x => x.path === "/members/munojat/start-ball");
    assert.ok(sent, "expected it to be sent");
    assert.strictEqual(sent.body.start_ball, 25);
    assert.strictEqual(sent.body.start_day, "2026-09-07", "dated today");
  },
};
