/* Oflayn navbat. Only prayer marks used to survive a dropped connection: everything
   else — a reading, a child's deed, a dose, a page of a book — was sent once and
   lost if it did not arrive. The queue now carries all of it. */
const { loadClient } = require("./harness");

const mk = (id, name) => ({ id, name, city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18 });
const SARDOR = mk("sardor", "Sardor Valixanov");
const AZIZ = { ...mk("aziz", "Aziz"), is_child: true };
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const OILA = { id: 2, name: "Oilam", kind: "family", owner_id: "sardor", week_goal: 25 };

/* `tarmoq.bor` decides whether the network answers at all. A route function that
   throws is a dropped connection: no status, which is the whole distinction the
   queue rests on. */
function client(patch = {}) {
  const tarmoq = { bor: true };
  const yiqilsa = (body) => () => {
    if (!tarmoq.bor) throw new Error("tarmoq yo'q");
    return body;
  };
  const holat = {
    members: [SARDOR, AZIZ], data: { sardor: blank(), aziz: blank() },
    calls: [], khatm: null, duels: [], deeds: [], rewards: [], skills: [],
    medicines: [], doses: [], promises: [], quran: [], quran_done: [],
    quran_stats: [],
  };
  const loaded = loadClient({
    at: "2026-09-09T07:00:00Z",
    expose: ["flushOutbox", "sendOrQueue", "pushData"],
    routes: {
      "/me/quran": yiqilsa({ ok: true }),
      "/me/quran/done?on=true": yiqilsa({ ok: true }),
      "/circles/2/child-deeds": yiqilsa({ ok: true }),
      "/members/sardor/data": yiqilsa({ ok: true }),
      "/me/private": { zikrs: [], zikr_marks: [], todos: [], todo_marks: [] },
      "/state?circle=2": yiqilsa(holat),
    },
  });
  loaded.setState({
    members: [SARDOR, AZIZ], data: { sardor: blank(), aziz: blank() },
    me: "sardor", date: "2026-09-09", token: "tok", isAdmin: false, circleId: 2,
    circles: [OILA], deeds: [], rewards: [], skills: [], duels: [],
    medicines: [], doses: [], promises: [], quran: [], quranDone: [],
    quranStats: [], ...patch,
  });
  return { c: loaded, tarmoq };
}

module.exports = {
  async "a reading tapped with no connection waits in the queue"(assert) {
    const { c, tarmoq } = client();
    await c.A.go("app");
    tarmoq.bor = false;
    c.setFields({ q_ayah: "5" });
    await c.A.addQuran();
    const navbat = c.__outbox();
    assert.strictEqual(navbat.length, 1, "expected the reading to be queued");
    assert.strictEqual(navbat[0].k, "req");
    assert.strictEqual(navbat[0].p, "/me/quran");
    assert.strictEqual(navbat[0].b.ayah, 5);
  },

  async "and goes out when the connection returns"(assert) {
    const { c, tarmoq } = client();
    await c.A.go("app");
    tarmoq.bor = false;
    c.setFields({ q_ayah: "5" });
    await c.A.addQuran();
    tarmoq.bor = true;
    const yuborildi = await c.flushOutbox();
    assert.ok(yuborildi, "the flush must succeed");
    assert.strictEqual(c.__outbox().length, 0, "and empty the queue");
    const sent = c.calls.filter(x => x.path === "/me/quran");
    assert.ok(sent.length >= 2, "it was retried after the first attempt failed");
    assert.strictEqual(sent[sent.length - 1].body.ayah, 5, "with the same reading");
  },

  async "a request the server refused is not queued"(assert) {
    /* The queue is for a connection that dropped. A server that answered has
       already made its decision, and replaying it would either repeat the same
       refusal for ever or write the thing twice. */
    const { c } = client();
    await c.A.go("app");
    c.setFields({ q_ayah: "40" });   // Fotiha has seven
    await c.A.addQuran();
    assert.strictEqual(c.__outbox().length, 0, "nothing queued");
    assert.ok(c.html.includes("1 dan 7 gacha"), "the refusal is shown instead");
  },

  async "a child's deed survives the same way"(assert) {
    const { c, tarmoq } = client();
    await c.A.go("app");
    c.A.setTab("oila");
    tarmoq.bor = false;
    await c.A.addDeed();
    const navbat = c.__outbox();
    assert.strictEqual(navbat.length, 1);
    assert.strictEqual(navbat[0].p, "/circles/2/child-deeds");
    assert.strictEqual(navbat[0].b.child_id, "aziz");
  },

  async "a page written offline is not lost to the next sync"(assert) {
    /* The book lives in the member document, and pull() replaces the local copy
       with the server's. Without the queue the page written offline would be
       overwritten by a copy that never had it. */
    const kitob = { id: "k1", title: "Sirlar xazinasi", author: "Navoiy",
      pages: 300, started: "2026-09-01", log: [], notes: [] };
    const { c, tarmoq } = client({ data: {
      sardor: { ...blank(), books: [kitob] }, aziz: blank() } });
    await c.A.go("app");
    tarmoq.bor = false;
    await c.pushData("sardor");
    const navbat = c.__outbox();
    assert.strictEqual(navbat.length, 1, "the whole document is queued");
    assert.strictEqual(navbat[0].k, "data");
    assert.strictEqual(navbat[0].id, "sardor");

    tarmoq.bor = true;
    assert.ok(await c.flushOutbox());
    const sent = c.calls.filter(x => x.path === "/members/sardor/data").pop();
    assert.strictEqual(sent.body.books[0].title, "Sirlar xazinasi");
    assert.strictEqual(c.__outbox().length, 0);
  },

  async "the same document is queued once, however many times it fails"(assert) {
    const { c, tarmoq } = client();
    await c.A.go("app");
    tarmoq.bor = false;
    await c.pushData("sardor");
    await c.pushData("sardor");
    await c.pushData("sardor");
    assert.strictEqual(c.__outbox().length, 1);
  },

  async "a sync is refused while anything is still waiting"(assert) {
    /* pull() replaces local data with the server's copy, so it must not run until
       the queue is empty — that is the whole reason the queue exists. */
    const { c, tarmoq } = client();
    await c.A.go("app");
    tarmoq.bor = false;
    c.setFields({ q_ayah: "5" });
    await c.A.addQuran();
    const oldin = c.calls.length;
    await c.A.refresh();
    assert.ok(!c.calls.slice(oldin).some(x => x.path.indexOf("/state") === 0),
      "no state was fetched over the top of unsent work");
  },
};
