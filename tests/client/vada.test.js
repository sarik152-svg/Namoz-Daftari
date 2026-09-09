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
const qarzdor = () => {
  const days = {};
  let d = new Date("2026-09-01T12:00:00");
  for (let i = 0; i < 8; i += 1) {
    const ds = d.toISOString().slice(0, 10);
    days[ds] = Object.fromEntries(FARD.map((k, j) => [k, { s: i === 2 && j < 5 ? "missed" : "ontime" }]));
    d = new Date(d.getTime() + 86400000);
  }
  return { ...blank(), days };
};

function client(promises = [], at = "2026-09-09T07:00:00Z") {
  const loaded = loadClient({
    at, expose: ["vazifaQarzi", "vadaHolat", "vazifaBelgi"],
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

  "'never' is honest, so it can never be broken"(assert) {
    /* A refusal is not a lie. The debt still shows; the word does not. */
    const c = client(vada(null));
    assert.strictEqual(c.vadaHolat(SARDOR), "vada");
    assert.ok(c.vazifaBelgi(SARDOR).includes("VAZIFA"));
    assert.ok(!c.vazifaBelgi(SARDOR).includes("ALDOQCHI"));
  },

  "doing the task clears the mark, broken word or not"(assert) {
    const c = client(vada("2026-09-01"));
    assert.ok(c.vazifaBelgi(SARDOR).includes("ALDOQCHI"));
    const done = { ...qarzdor(),
      tasks: [{ d: "2026-09-09", rak: 12, tas: 500, lvl: 1, oy: "2026-09" }] };
    c.setState({ data: { sardor: done, behruz: blank() } });
    assert.strictEqual(c.vazifaBelgi(SARDOR), "", "no debt, no mark of any kind");
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
};
