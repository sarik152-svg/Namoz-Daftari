/* Loads static/index.html's inline script into a sandbox so its functions can be
   called from Node. There is no build step and no module system, so the script is
   evaluated whole; `expose` names the internals a test wants back, because `const`
   declarations do not become properties of the vm context by themselves. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const INDEX = path.join(__dirname, "..", "..", "static", "index.html");

function clientSource() {
  const html = fs.readFileSync(INDEX, "utf8");
  const open = html.indexOf("<script>");
  const start = open + "<script>".length;
  const end = html.indexOf("</script>", start);
  if (open < 0 || end < 0) throw new Error("no <script> block in static/index.html");
  return html.slice(start, end).replace(/\nA\.boot\(\);\s*$/, "\n");
}

/* `at` is the wall-clock instant the app should believe it is, as a UTC ISO string.
   Prayer times depend entirely on the clock, so every test states its own. */
/* `routes` stubs the API: a map of path (without the /api/v1 prefix) to the body it
   answers with. Give a body a `__status` to make it an error. Without this the app can
   only be poked at as text, which is how a switcher that never once ran shipped. */
function loadClient({ at = "2026-08-22T09:00:00Z", expose = [], routes = null } = {}) {
  const RealDate = Date;
  const frozen = new RealDate(at);
  /* Every assignment to #app is kept, not just the last one: a screen that flashes
     and is immediately replaced is still a screen the user saw. */
  const renders = [];
  /* One element per id, created on demand. A screen that reads six fields has to be
     able to see six different values; a single shared element made every input
     answer with whatever the last test wrote. */
  const elements = {};
  function elementFor(id) {
    if (!elements[id]) {
      const made = { id, value: "", textContent: "", className: "", checked: false };
      let painted = "";
      Object.defineProperty(made, "innerHTML", {
        get: () => painted,
        set(value) {
          painted = value;
          if (id === "app") renders.push(value);
        },
      });
      elements[id] = made;
    }
    return elements[id];
  }
  const element = elementFor("app");
  const confirms = [];
  const alerts = [];
  const calls = [];
  const reply = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
  const sandbox = {
    console,
    setInterval() {},
    alert(message) { alerts.push(String(message)); },
    prompt: () => sandbox.__prompt,
    confirm(question) { confirms.push(question); return sandbox.__confirm; },
    localStorage: { getItem: () => null, setItem() {} },
    document: {
      getElementById: (id) => elementFor(id),
      /* The add-member form reads its Asr radio with querySelector. Answer with an
         element carrying the value the test set, so the form can be submitted. */
      querySelector: (selector) => elementFor("query:" + selector),
      createElement: (tag) => elementFor("made:" + tag),
      addEventListener() {},
    },
    window: { scrollTo() {}, scrollY: 0 },
    fetch: (url, options) => {
      const path = String(url).replace(/^\/api\/v1/, "");
      let sent = null;
      if (options && options.body) { try { sent = JSON.parse(options.body); } catch (e) {} }
      calls.push({ path, method: (options && options.method) || "GET", body: sent });
      if (!routes) return Promise.reject(new Error("offline"));
      const found = routes[path];
      if (found === undefined) {
        return Promise.resolve(reply(404, { error: { code: "not_found", message: path } }));
      }
      const body = typeof found === "function" ? found(options) : found;
      return Promise.resolve(reply(body && body.__status ? body.__status : 200, body));
    },
    __confirm: true,
    __prompt: null,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const names = ["A", ...expose].join(",");
  vm.runInContext(
    `${clientSource()}
     globalThis.__exports = {${names}};
     globalThis.__setState = (patch) => {
       if ("members" in patch) members = patch.members;
       if ("data" in patch) data = patch.data;
       if ("me" in patch) me = patch.me;
       if ("date" in patch) date = patch.date;
       if ("token" in patch) token = patch.token;
       if ("isAdmin" in patch) isAdmin = patch.isAdmin;
       if ("circleId" in patch) circleId = patch.circleId;
       if ("duels" in patch) duels = patch.duels;
     };
     globalThis.__set_duels = (list) => { duels = list; };
     globalThis.__state_day = () => ((data[me]||{}).days||{})[date] || {};`,
    sandbox
  );

  sandbox.Date = class extends RealDate {
    constructor(...args) {
      if (!args.length) super(frozen.getTime());
      else super(...args);
    }
    static now() { return frozen.getTime(); }
    static UTC(...args) { return RealDate.UTC(...args); }
    static parse(value) { return RealDate.parse(value); }
  };

  return {
    ...sandbox.__exports,
    element,
    elements,
    confirms,
    alerts,
    setConfirm(answer) { sandbox.__confirm = answer; },
    setPrompt(answer) { sandbox.__prompt = answer; },
    /* Fill in form fields by id: setFields({f_name: "Zuhra", f_pin: "4821"}). */
    setFields(values) {
      for (const [id, value] of Object.entries(values)) elementFor(id).value = value;
    },
    field(id) { return elementFor(id); },
    setState: sandbox.__setState,
    /* Duels arrive with /state; tests seed them directly. */
    __setDuels(list) { sandbox.__set_duels(list); },
    /* Every request the app made, in order. */
    calls,
    /* Whatever render() last wrote into #app. */
    get html() { return element.innerHTML; },
    /* Every screen painted, in order. */
    renders,
    /* The prayer written for `me` on `date`; with no argument, the whole day, or
       undefined when nothing has been marked. */
    __day(prayer) {
      const day = sandbox.__state_day();
      if (prayer) return day[prayer];
      return Object.keys(day).length ? day : undefined;
    },
  };
}

module.exports = { loadClient, clientSource };
