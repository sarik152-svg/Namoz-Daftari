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
function loadClient({ at = "2026-08-22T09:00:00Z", expose = [] } = {}) {
  const RealDate = Date;
  const frozen = new RealDate(at);
  const element = { value: "", textContent: "", className: "", innerHTML: "" };
  const confirms = [];
  const sandbox = {
    console,
    setInterval() {},
    alert() {},
    prompt: () => null,
    confirm(question) { confirms.push(question); return sandbox.__confirm; },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => element, addEventListener() {} },
    window: { scrollTo() {}, scrollY: 0 },
    fetch: () => Promise.reject(new Error("offline")),
    __confirm: true,
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
     };
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
    confirms,
    setConfirm(answer) { sandbox.__confirm = answer; },
    setState: sandbox.__setState,
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
