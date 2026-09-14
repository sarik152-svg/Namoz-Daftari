/* Va'da. Owing a task and breaking your word about it are different things, and the
   chip beside somebody's name says which. */
const { loadClient } = require("./harness");

const mk = (id, name) => ({ id, name, city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18 });
const SARDOR = mk("sardor", "Sardor Valixanov");
const BEHRUZ = mk("behruz", "Behruz Qurbonov");
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];
/* Five points owed in September: enough for the first tier. */
const qarzdor = (jarima = 5) => {
  const days = {};
  let qoldi = jarima;
  let d = new Date("2026-09-01T12:00:00");
  for (let i = 0; i < 8; i += 1) {
    const ds = d.toISOString().slice(0, 10);
    days[ds] = Object.fromEntries(FARD.map((k) => {
      const oqilmagan = qoldi > 0;
      if (oqilmagan) qoldi -= 1;
      return [k, { s: oqilmagan ? "missed" : "ontime" }];
    }));
    d = new Date(d.getTime() + 86400000);
  }
  return { ...blank(), days };
};

function client(promises = [], at = "2026-09-09T07:00:00Z") {
  const loaded = loadClient({
    at, expose: ["vazifaQarzi", "vadaHolat", "vazifaBelgi", "JAZO"],
    routes: { "/me/promise": { ok: true }, "/me/private":
      { zikrs: [], zikr_marks: [], todos: [], todo_marks: [] } },
  });
  loaded.setState({
    members: [SARDOR, BEHRUZ], data: { sardor: qarzdor(), behruz: blank() },
    me: "sardor", date: "2026-09-09", token: "tok", isAdmin: false, circleId: 1,
    circles: [{ id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor",
      week_goal: 25, bonus_easy: 20, bonus_mid: 50, bonus_hard: 100 }],
    deeds: [], rewards: [], skills: [], duels: [], medicines: [], doses: [],
    promises,
  });
  return loaded;
}
const vada = (kun) => [{ member_id: "sardor", oy: "2026-09", lvl: 1, promised: kun }];

module.exports = {
  async "somebody with an unanswered task is asked when"(assert) {
    const c = client();
    await c.A.go("app");
    const h = c.html;
    assert.ok(h.includes("Sardor"), "by name");
    assert.ok(h.includes("vazifangizni qachon bajarasiz"), "and asked the question");
    ["Bugun", "Ertaga", "Shu hafta", "Hech qachon"].forEach(x =>
      assert.ok(h.includes(">" + x + "<"), "expected the option " + x));
  },

  async "having answered, the question stops"(assert) {
    const c = client(vada("2026-09-12"));
    await c.A.go("app");
    assert.ok(!c.html.includes("vazifangizni qachon bajarasiz"), "asked once, not daily");
  },

  async "somebody with no task is never asked"(assert) {
    const c = client();
    c.setState({ me: "behruz" });
    await c.A.go("app");
    assert.ok(!c.html.includes("vazifangizni qachon bajarasiz"));
  },

  "a promise still in the future is just a promise"(assert) {
    const c = client(vada("2026-09-12"));
    assert.strictEqual(c.vadaHolat(SARDOR), "vada");
    assert.ok(c.vazifaBelgi(SARDOR).includes("VAZIFA"));
    assert.ok(!c.vazifaBelgi(SARDOR).includes("ALDOQCHI"));
  },

  "a day promised and let pass is a broken word"(assert) {
    const c = client(vada("2026-09-07"));
    assert.strictEqual(c.vadaHolat(SARDOR), "aldoqchi");
    assert.ok(c.vazifaBelgi(SARDOR).includes("ALDOQCHI"), "and the circle sees it");
    assert.ok(!c.vazifaBelgi(SARDOR).includes(">⚠ VAZIFA<"));
  },

  "'never' says so on the chip, and is never a lie"(assert) {
    /* A refusal is not a lie, and it is not a pending task either — it is its own
       answer, so it gets its own word. */
    const c = client(vada(null));
    assert.strictEqual(c.vadaHolat(SARDOR), "hech");
    const belgi = c.vazifaBelgi(SARDOR);
    assert.ok(belgi.includes("HECH QACHON"), "the answer they gave: " + belgi);
    assert.ok(!belgi.includes("ALDOQCHI"), "refusing plainly is not lying");
    assert.ok(!/>\u26A0 VAZIFA</.test(belgi), "and it is no longer just a pending task");
  },

  "doing the task clears the mark, broken word or not"(assert) {
    const c = client(vada("2026-09-01"));
    assert.ok(c.vazifaBelgi(SARDOR).includes("ALDOQCHI"));
    const done = { ...qarzdor(),
      tasks: [{ d: "2026-09-09", rak: 12, tas: 500, lvl: 1, oy: "2026-09" }] };
    c.setState({ data: { sardor: done, behruz: blank() } });
    assert.strictEqual(c.vazifaBelgi(SARDOR), "", "no debt, no mark of any kind");
    const kechikkan = client(vada(null));
    kechikkan.setState({ data: { sardor: done, behruz: blank() } });
    assert.strictEqual(kechikkan.vazifaBelgi(SARDOR), "",
      "and doing it after saying never clears that too");
  },

  async "answering sends the day it was promised for"(assert) {
    const c = client();
    await c.A.go("app");
    await c.A.promise("ertaga");
    const sent = c.calls.find(x => x.path === "/me/promise");
    assert.ok(sent, "expected the promise to be sent");
    assert.strictEqual(sent.body.promised, "2026-09-10");
    assert.strictEqual(sent.body.oy, "2026-09");
    assert.strictEqual(sent.body.lvl, 1);

    await c.A.promise("hech");
    assert.strictEqual(c.calls.filter(x => x.path === "/me/promise").pop().body.promised, null);
  },

  /* --------------------------------------------------------- tasbeh sanoq */
  async "the counter goes as far as the task asks, not 500"(assert) {
    /* It stopped at 500 while the second and third tiers ask for 1000 and 2000, so
       "Bajardim" could never light up and the task could not be closed at all.
       Sardor hit exactly this. */
    const c = client();
    c.setState({ data: { sardor: qarzdor(7), behruz: blank() } });
    await c.A.go("app");
    c.A.setTab("sunnat");
    const owed = c.vazifaQarzi(c.__me(), SARDOR);
    assert.strictEqual(owed.daraja, 2, "seven points is the second tier");
    assert.strictEqual(owed.jazo.tas, 1000);
    for (let i = 0; i < 12; i += 1) c.A.addTas(100);
    assert.strictEqual(c.A.tas, 1000, "it reaches what the tier asks and stops there");
  },

  async "and the whole task can then be finished"(assert) {
    const c = client();
    c.setState({ data: { sardor: qarzdor(7), behruz: blank() } });
    await c.A.go("app");
    c.A.setTab("sunnat");
    const owed = c.vazifaQarzi(c.__me(), SARDOR);
    c.A.setRak(owed.jazo.rak);
    for (let i = 0; i < 12; i += 1) c.A.addTas(100);
    assert.ok(c.html.includes("A.finishTask()"), "the button is live");
    await c.A.finishTask();
    assert.strictEqual(c.vazifaQarzi(c.__me(), SARDOR), null, "the task is closed");
    assert.strictEqual(c.A.tas, 0, "and the counter is cleared");
  },

  async "counting more than the task asks is not possible"(assert) {
    const c = client();
    c.setState({ data: { sardor: qarzdor(5), behruz: blank() } });
    await c.A.go("app");
    c.A.setTab("sunnat");
    for (let i = 0; i < 20; i += 1) c.A.addTas(100);
    assert.strictEqual(c.A.tas, 500, "the first tier asks for five hundred");
  },
};
