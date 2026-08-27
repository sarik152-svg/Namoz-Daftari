/* Duel: two people, or two pairs, over a week of prayer points. The result is never
   stored — it is worked out from the same records the ranking reads. */
const { loadClient } = require("./harness");

const mk = (id, name) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
});
const SARDOR = mk("sardor", "Sardor Valixanov");
const BEHRUZ = mk("behruz", "Behruz Qurbonov");
const HIKMAT = mk("hikmat", "Hikmatilla Ismailov");
const AZIZ = mk("aziz", "Aziz Rahimov");
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

/* n of the five fard prayers said on time, all on 22 August and nothing before it.
   A member's scoring starts at their first recorded day, and an open day does not
   penalise what is unmarked, so a window over that one day scores exactly n. */
const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];
const prayed = (n) => {
  const marks = {};
  FARD.slice(0, n).forEach(k => { marks[k] = { s: "ontime" }; });
  return { ...blank(), days: { "2026-08-22": marks } };
};

function client(patch = {}, at = "2026-08-22T09:00:00Z") {
  const loaded = loadClient({
    at,
    expose: ["duelHisob", "duelYutuq", "duels"],
    routes: {
      "/circles/1/duels": { id: 9, size: 1, created_by: "sardor",
        started: null, ends: null, members: [] },
      "/duels/4/confirm": { id: 4, size: 1, created_by: "behruz",
        started: "2026-08-22", ends: "2026-08-28", members: [] },
      "/duels/4": { ok: true },
      "/state?circle=1": { members: [], data: {}, calls: [], khatm: null, duels: [] },
    },
  });
  loaded.setState({
    members: [SARDOR, BEHRUZ, HIKMAT, AZIZ],
    data: { sardor: prayed(5), behruz: prayed(3), hikmat: prayed(2), aziz: prayed(1) },
    me: "sardor", date: "2026-08-22", token: "tok", isAdmin: false, circleId: 1,
    ...patch,
  });
  return loaded;
}

/* Running by default: it ends after today, so today's marks are what count. */
const duel = (over) => ({
  id: 1, size: 1, created_by: "sardor", started: "2026-08-22", ends: "2026-08-28",
  members: [
    { member_id: "sardor", side: 1, confirmed: true },
    { member_id: "behruz", side: 2, confirmed: true },
  ],
  ...over,
});

module.exports = {
  "the side with more points wins"(assert) {
    const c = client();
    c.__setDuels([duel()]);
    const r = c.duelHisob(duel());
    assert.strictEqual(r.ball1, 5, "Sardor prayed five");
    assert.strictEqual(r.ball2, 3, "Behruz prayed three");
    assert.strictEqual(r.golib, 1);
  },

  "equal points means nobody won"(assert) {
    const c = client({ data: { sardor: prayed(3), behruz: prayed(3),
      hikmat: blank(), aziz: blank() } });
    const r = c.duelHisob(duel());
    assert.strictEqual(r.golib, 0, "a draw is not a win for anybody");
  },

  "a pair's points are added together"(assert) {
    const c = client();
    const pair = duel({
      size: 2,
      members: [
        { member_id: "sardor", side: 1, confirmed: true },
        { member_id: "hikmat", side: 1, confirmed: true },
        { member_id: "behruz", side: 2, confirmed: true },
        { member_id: "aziz", side: 2, confirmed: true },
      ],
    });
    const r = c.duelHisob(pair);
    assert.strictEqual(r.ball1, 7, "5 + 2");
    assert.strictEqual(r.ball2, 4, "3 + 1");
  },

  "a duel nobody has finished yet counts for nobody"(assert) {
    const c = client();
    assert.strictEqual(c.duelYutuq([duel()]).sardor || 0, 0, "the week is still running");
  },

  "wins are tallied only from finished duels"(assert) {
    /* A day later, so a duel that ended on the 22nd is over. Sardor prayed all five
       that day and Behruz three, which on a closed day is 3 - 2. */
    const c = client({}, "2026-08-23T09:00:00Z");
    const tally = c.duelYutuq([
      duel({ id: 1, started: "2026-08-22", ends: "2026-08-22" }),
      duel({ id: 2, started: "2026-08-23", ends: "2026-08-29" }),
    ]);
    assert.strictEqual(tally.sardor, 1, "one finished duel, one win");
    assert.strictEqual(tally.behruz || 0, 0);
  },

  "a challenge that has not been accepted is not scored"(assert) {
    const c = client();
    const waiting = duel({ started: null, ends: null,
      members: [
        { member_id: "sardor", side: 1, confirmed: true },
        { member_id: "behruz", side: 2, confirmed: false },
      ] });
    assert.strictEqual(c.duelYutuq([waiting]).sardor || 0, 0);
  },

  /* ---------------------------------------------------------- the screen */
  async "the ranking page offers a duel and shows the running one"(assert) {
    const c = client();
    c.__setDuels([duel()]);
    await c.A.go("app");
    c.A.setTab("stats");
    assert.ok(c.html.includes("Duel"), "expected a duel section");
    assert.ok(c.html.includes("A.duelForm(true)"), "expected a way to send one");
    assert.ok(!c.html.includes("So'nggi 14 kun"), "the chart was asked to go");
  },

  async "somebody challenged is asked, not simply entered"(assert) {
    const c = client({ me: "behruz" });
    c.__setDuels([duel({ id: 4, created_by: "sardor", started: null, ends: null,
      members: [
        { member_id: "sardor", side: 1, confirmed: true },
        { member_id: "behruz", side: 2, confirmed: false },
      ] })]);
    await c.A.go("app");
    c.A.setTab("stats");
    assert.ok(c.html.includes("A.confirmDuel(4)"), "expected an accept button");
    assert.ok(c.html.includes("A.dropDuel(4)"), "and a way to refuse");

    await c.A.confirmDuel(4);
    assert.ok(c.calls.some(x => x.path === "/duels/4/confirm" && x.method === "POST"));
  },

  async "sending a challenge names both sides"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("stats");
    c.A.duelForm(true);
    c.A.setDuelSize(1);
    c.setFields({ d_mine1: "sardor", d_theirs1: "behruz" });
    await c.A.createDuel();
    const sent = c.calls.find(x => x.path === "/circles/1/duels");
    assert.ok(sent, "expected the challenge to be sent");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(sent.body)),
      { size: 1, side1: ["sardor"], side2: ["behruz"] });
  },
};
