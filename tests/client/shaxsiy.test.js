/* Zikrlar va kunlik vazifalar. Both belong to one person: they are fetched from a
   route about the caller and never from the circle's state. */
const { loadClient } = require("./harness");

const SARDOR = { id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18 };
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const ZIKR = { id: 1, name: "Subhanalloh", meaning: "Alloh pokdir", count: 33 };
const TAKRORIY = { id: 1, text: "Ertalab yugurish", repeating: true, due: null,
  done_at: null, created: "2026-09-01" };
const BIRLIK = { id: 2, text: "Hujjatni topshirish", repeating: false,
  due: "2026-09-12", done_at: null, created: "2026-09-01" };

function client(private_ = {}) {
  const loaded = loadClient({
    at: "2026-09-09T07:00:00Z",
    expose: ["zikrs", "todos", "todoUnutilgan"],
    routes: {
      "/me/private": { zikrs: [], zikr_marks: [], todos: [], todo_marks: [], ...private_ },
      "/me/zikrs": ZIKR,
      "/me/zikrs/1/day/2026-09-09?on=true": { ok: true },
      "/me/todos": TAKRORIY,
      "/me/todos/1/day/2026-09-09?on=true": { ok: true },
      "/me/todos/2/day/2026-09-09?on=true": { ok: true },
    },
  });
  loaded.setState({
    members: [SARDOR], data: { sardor: blank() },
    me: "sardor", date: "2026-09-09", token: "tok", isAdmin: false, circleId: 1,
    circles: [{ id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor",
      week_goal: 25, bonus_easy: 20, bonus_mid: 50, bonus_hard: 100 }],
    deeds: [], rewards: [], skills: [], duels: [], medicines: [], doses: [],
  });
  return loaded;
}

module.exports = {
  async "the private list is asked for on its own route"(assert) {
    const c = client();
    await c.A.loadPrivate();
    assert.ok(c.calls.some(x => x.path === "/me/private"),
      "not from /state, which every phone in the circle receives");
  },

  /* ---------------------------------------------------------- zikr */
  async "a zikr carries its meaning and its count"(assert) {
    const c = client();
    await c.A.loadPrivate();
    c.A.setTab("sunnat");
    c.A.go("app");
    c.A.setTab("sunnat");
    c.setFields({ z_name: "Subhanalloh", z_meaning: "Alloh pokdir", z_count: "33" });
    c.A.zikrForm(true);
    await c.A.addZikr();
    const sent = c.calls.find(x => x.path === "/me/zikrs");
    assert.ok(sent, "expected the zikr to be sent");
    assert.strictEqual(sent.body.name, "Subhanalloh");
    assert.strictEqual(sent.body.meaning, "Alloh pokdir");
    assert.strictEqual(sent.body.count, 33);
  },

  async "it shows on Sunnat with what it means and how many times"(assert) {
    const c = client({ zikrs: [ZIKR] });
    await c.A.loadPrivate();
    await c.A.go("app");
    c.A.setTab("sunnat");
    const h = c.html;
    assert.ok(h.includes("Zikrlar"), "expected the section");
    assert.ok(h.includes("Subhanalloh") && h.includes("Alloh pokdir"), "name and meaning");
    assert.ok(h.includes("33"), "and the count");
    assert.ok(h.includes("A.markZikr(1"), "with a way to tick it");
  },

  async "ticking one is about today"(assert) {
    const c = client({ zikrs: [ZIKR] });
    await c.A.loadPrivate();
    await c.A.markZikr(1, true);
    assert.ok(c.calls.some(x => x.path.startsWith("/me/zikrs/1/day/2026-09-09")));
  },

  /* ---------------------------------------------------------- kunlik vazifa */
  async "the task list sits at the very bottom of Bugun"(assert) {
    const c = client({ todos: [TAKRORIY, BIRLIK] });
    await c.A.loadPrivate();
    await c.A.go("app");
    const h = c.html;
    assert.ok(h.includes("Kunlik vazifalar"), "expected the list");
    assert.ok(h.indexOf("Qur'on o'qidim") < h.indexOf("Kunlik vazifalar"),
      "after the Qur'an line");
    assert.ok(h.includes("Ertalab yugurish") && h.includes("Hujjatni topshirish"));
  },

  async "a repeating task has no deadline and a one-off shows its own"(assert) {
    const c = client({ todos: [TAKRORIY, BIRLIK] });
    await c.A.loadPrivate();
    await c.A.go("app");
    const h = c.html;
    assert.ok(h.includes("har kuni"), "the repeating one says so");
    assert.ok(h.includes("12 sentabr"), "and the one-off shows when it is wanted");
  },

  async "adding a one-off sends its deadline, a repeating one does not"(assert) {
    const c = client();
    await c.A.loadPrivate();
    await c.A.go("app");
    c.A.todoForm(true);
    c.setFields({ t_text: "Hujjatni topshirish", t_due: "2026-09-12" });
    c.A.setTodoKind(false);
    await c.A.addTodo();
    let sent = c.calls.filter(x => x.path === "/me/todos").pop();
    assert.strictEqual(sent.body.repeating, false);
    assert.strictEqual(sent.body.due, "2026-09-12");

    c.A.todoForm(true);
    c.setFields({ t_text: "Ertalab yugurish", t_due: "2026-09-12" });
    c.A.setTodoKind(true);
    await c.A.addTodo();
    sent = c.calls.filter(x => x.path === "/me/todos").pop();
    assert.strictEqual(sent.body.repeating, true);
    assert.strictEqual(sent.body.due, null, "a repeating task is wanted every day");
  },

  async "nothing here carries points"(assert) {
    /* Sardor was explicit: this is a notebook, not a score. */
    const c = client({ zikrs: [ZIKR], todos: [TAKRORIY],
      zikr_marks: [{ zikr_id: 1, day: "2026-09-09" }],
      todo_marks: [{ todo_id: 1, day: "2026-09-09" }] });
    await c.A.loadPrivate();
    await c.A.go("app");
    const found = c.html.match(/<b class="[^"]*">([^<]*)<\/b><i>Shu kun bali<\/i>/);
    assert.strictEqual(found[1], "0", "ticking them moves no score at all");
  },

  /* ------------------------------------------------ unutilganlar */
  async "a repeating task nobody has ticked for days is surfaced"(assert) {
    const c = client({ todos: [TAKRORIY], todo_marks: [{ todo_id: 1, day: "2026-09-05" }] });
    await c.A.loadPrivate();
    const u = c.todoUnutilgan();
    assert.strictEqual(u.length, 1);
    assert.strictEqual(u[0].kun, 4, "last done on the fifth, and today is the ninth");
  },

  async "one done today or yesterday is not nagged about"(assert) {
    const c = client({ todos: [TAKRORIY], todo_marks: [{ todo_id: 1, day: "2026-09-08" }] });
    await c.A.loadPrivate();
    assert.strictEqual(c.todoUnutilgan().length, 0, "a day's gap is life, not neglect");
  },

  async "one never ticked is counted from the day it was written down"(assert) {
    const c = client({ todos: [TAKRORIY], todo_marks: [] });
    await c.A.loadPrivate();
    assert.strictEqual(c.todoUnutilgan()[0].kun, 8, "written on the first, never done");
  },

  async "a one-off is not in this list — it has its own deadline"(assert) {
    const c = client({ todos: [BIRLIK], todo_marks: [] });
    await c.A.loadPrivate();
    assert.strictEqual(c.todoUnutilgan().length, 0);
  },

  async "the longest neglected comes first"(assert) {
    const ikki = { ...TAKRORIY, id: 3, text: "Kitob o'qish", created: "2026-09-01" };
    const c = client({ todos: [TAKRORIY, ikki],
      todo_marks: [{ todo_id: 1, day: "2026-09-05" }] });
    await c.A.loadPrivate();
    const u = c.todoUnutilgan();
    assert.strictEqual(u[0].t.id, 3, "eight days beats four");
    assert.strictEqual(u[1].t.id, 1);
  },

  async "it shows under the list, as a reminder rather than a scolding"(assert) {
    const c = client({ todos: [TAKRORIY], todo_marks: [] });
    await c.A.loadPrivate();
    await c.A.go("app");
    const h = c.html;
    assert.ok(h.includes("E'tibordan qolgan"), "expected the reminder block");
    assert.ok(h.indexOf("Kunlik vazifalar") < h.indexOf("E'tibordan qolgan"), "below the list");
    assert.ok(h.includes("8 kun"), "with how long it has been");
  },
};