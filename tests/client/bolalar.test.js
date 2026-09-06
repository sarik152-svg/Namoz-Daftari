/* Bolalar bo'limi: a parent records what they did with a child, and both are
   credited — the child toward a wish, the adult toward their own tally. */
const { loadClient } = require("./harness");

const mk = (id, name, over = {}) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
  ...over,
});
const OTA = mk("sardor", "Sardor Valixanov");
const ONA = mk("zuhra", "Zuhra");
const AZIZ = mk("aziz", "Aziz", { is_child: true, reward_goal: 20 });
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

function client(patch = {}) {
  const loaded = loadClient({
    at: "2026-09-06T07:00:00Z",
    expose: ["BOLA_AMALLAR", "bolaHolat", "kattaBolaBali", "amalBali", "BILIM",
             "bilimHolat"],
    routes: {
      "/circles/2/child-deeds": { id: 9, child_id: "aziz", adult_id: "sardor",
        deed: "kitob", day: "2026-09-06" },
      "/circles/2/child-rewards": { id: 3, child_id: "aziz", given_by: "sardor",
        wish: "", day: "2026-09-06" },
      "/child-deeds/9": { ok: true },
      "/circles/2/child-skills": { id: 4, child_id: "aziz", adult_id: "sardor",
        kind: "harf", item: "alif", day: "2026-09-06" },
      "/child-skills/4": { ok: true },
      "/circles/2/roster": { members: [
        { id: "aziz", name: "Aziz", city: "Toshkent", pin: "1234", is_child: true }] },
      "/state?circle=2": { members: [], data: {}, calls: [], khatm: null,
        duels: [], deeds: [], rewards: [], skills: [] },
      "/members/aziz/reward-goal": { ok: true },
    },
  });
  loaded.setState({
    members: [OTA, ONA, AZIZ],
    data: { sardor: blank(), zuhra: blank(), aziz: blank() },
    me: "sardor", date: "2026-09-06", token: "tok", isAdmin: false, circleId: 2,
    circles: [{ id: 2, name: "Oilam", kind: "family", owner_id: "sardor", week_goal: 25 }],
    deeds: [], rewards: [], skills: [],
    ...patch,
  });
  return loaded;
}
const deed = (i, adult, k) => ({ id: i, child_id: "aziz", adult_id: adult,
  deed: k, day: "2026-09-06" });

module.exports = {
  "every deed is a real thing to do, and worth something"(assert) {
    const c = client();
    assert.ok(c.BOLA_AMALLAR.length >= 8, "a short list gets boring quickly");
    assert.ok(c.BOLA_AMALLAR.every(a => a.k && a.n && a.b >= 1));
  },

  "the child's points are the deeds done with them"(assert) {
    const c = client({ deeds: [deed(1, "sardor", "kitob"), deed(2, "zuhra", "arab")] });
    const h = c.bolaHolat(AZIZ);
    assert.strictEqual(h.jami, c.amalBali("kitob") + c.amalBali("arab"));
    assert.strictEqual(h.bosqich, h.jami, "nothing granted yet");
    assert.strictEqual(h.qolgan, 20 - h.jami);
  },

  "the adult who did it is credited too"(assert) {
    const c = client({ deeds: [deed(1, "sardor", "kitob"), deed(2, "zuhra", "arab")] });
    assert.strictEqual(c.kattaBolaBali("sardor"), c.amalBali("kitob"));
    assert.strictEqual(c.kattaBolaBali("zuhra"), c.amalBali("arab"));
  },

  "reaching the number means a wish is owed"(assert) {
    const many = Array.from({ length: 10 }, (_, i) => deed(i + 1, "sardor", "arab"));
    const c = client({ deeds: many });
    const h = c.bolaHolat(AZIZ);
    assert.ok(h.jami >= 20);
    assert.strictEqual(h.tayyor, true, "twenty points is a wish");
  },

  "granting a wish does not wipe what the child has earned"(assert) {
    const many = Array.from({ length: 10 }, (_, i) => deed(i + 1, "sardor", "arab"));
    const c = client({ deeds: many,
      rewards: [{ id: 1, child_id: "aziz", given_by: "sardor", wish: "", day: "2026-09-06" }] });
    const h = c.bolaHolat(AZIZ);
    assert.strictEqual(h.jami, 30, "a lifetime total, not a counter that resets");
    assert.strictEqual(h.olingan, 1);
    assert.strictEqual(h.bosqich, 10, "and ten of the way to the next one");
    assert.strictEqual(h.tayyor, false);
  },

  async "the panel is on Bugun, and only in a family"(assert) {
    const c = client();
    await c.A.go("app");
    assert.ok(c.html.includes("Bolalar"), "expected the children's panel");
    assert.ok(c.html.includes("A.addDeed()"), "and a way to record a deed");

    const friends = client({
      circles: [{ id: 2, name: "Do'stlar", kind: "friends", owner_id: "sardor", week_goal: 25 }],
    });
    await friends.A.go("app");
    assert.ok(!friends.html.includes("A.addDeed()"), "friends have no children's panel");
  },

  async "recording a deed sends who, what and which child"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setDeedChild("aziz");
    c.A.setDeedKind("arab");
    await c.A.addDeed();
    const sent = c.calls.find(x => x.path === "/circles/2/child-deeds");
    assert.ok(sent, "expected the deed to be sent");
    assert.strictEqual(sent.body.child_id, "aziz");
    assert.strictEqual(sent.body.deed, "arab");
    assert.strictEqual(sent.body.day, "2026-09-06");
  },

  async "the wish is granted from the panel once it is earned"(assert) {
    const many = Array.from({ length: 10 }, (_, i) => deed(i + 1, "sardor", "arab"));
    const c = client({ deeds: many });
    await c.A.go("app");
    assert.ok(c.html.includes("A.grantReward('aziz')"), "expected a way to grant it");
    await c.A.grantReward("aziz");
    assert.ok(c.calls.some(x => x.path === "/circles/2/child-rewards"));
  },

  /* ------------------------------------------------ bilim ro'yxatlari */
  "there are twenty-eight letters, and suras and duas besides"(assert) {
    const c = client();
    const harf = c.BILIM.find(b => b.k === "harf");
    assert.strictEqual(harf.items.length, 28, "the Arabic alphabet");
    assert.ok(c.BILIM.find(b => b.k === "sura").items.length >= 8);
    assert.ok(c.BILIM.find(b => b.k === "duo").items.length >= 8);
    assert.ok(c.BILIM.every(b => b.b >= 1 && b.items.every(i => i.k && i.n)));
  },

  "learning something adds to the same points as a deed"(assert) {
    const c = client({
      skills: [
        { id: 1, child_id: "aziz", adult_id: "sardor", kind: "harf", item: "alif", day: "2026-09-06" },
        { id: 2, child_id: "aziz", adult_id: "zuhra", kind: "sura", item: "ixlos", day: "2026-09-06" },
      ],
    });
    const harf = c.BILIM.find(b => b.k === "harf").b;
    const sura = c.BILIM.find(b => b.k === "sura").b;
    assert.strictEqual(c.bolaHolat(AZIZ).jami, harf + sura,
      "the wish comes closer for learning, not only for playing");
  },

  "progress is counted against the whole list"(assert) {
    const c = client({
      skills: [{ id: 1, child_id: "aziz", adult_id: "sardor", kind: "harf",
        item: "alif", day: "2026-09-06" }],
    });
    const h = c.bilimHolat("aziz", "harf");
    assert.strictEqual(h.bor, 1);
    assert.strictEqual(h.jami, 28);
    assert.ok(h.olingan.alif, "and it knows which one");
  },

  async "the lists open from the child's panel and tick one at a time"(assert) {
    const c = client();
    await c.A.go("app");
    assert.ok(c.html.includes("Arab harflari"), "expected the alphabet on the panel");
    assert.ok(c.html.includes("A.bilimOch('harf')"), "and a way to open it");

    c.A.bilimOch("harf");
    assert.ok(c.html.includes("A.addSkill('harf','alif')"), "expected the letters");
    await c.A.addSkill("harf", "alif");
    const sent = c.calls.find(x => x.path === "/circles/2/child-skills");
    assert.ok(sent, "expected it to be sent");
    assert.strictEqual(sent.body.kind, "harf");
    assert.strictEqual(sent.body.item, "alif");
  },

  async "the circle owner sets how many points a wish costs"(assert) {
    const c = client();
    await c.A.go("sync");
    assert.ok(c.html.includes("A.setRewardGoal('aziz')"), "expected it in the roster");
    assert.ok(c.html.includes("Tilak uchun 20 ball"), "showing the number in force");
    c.setPrompt("40");
    await c.A.setRewardGoal("aziz");
    const sent = c.calls.find(x => x.path === "/members/aziz/reward-goal");
    assert.ok(sent, "expected it to be sent");
    assert.strictEqual(sent.body.reward_goal, 40);
  },
};