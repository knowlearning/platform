var ie, je = new Uint8Array(16);
function Ue() {
  if (!ie && (ie = typeof crypto < "u" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto) || typeof msCrypto < "u" && typeof msCrypto.getRandomValues == "function" && msCrypto.getRandomValues.bind(msCrypto), !ie))
    throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
  return ie(je);
}
const Be = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
function k(e) {
  return typeof e == "string" && Be.test(e);
}
var j = [];
for (var he = 0; he < 256; ++he)
  j.push((he + 256).toString(16).substr(1));
function Me(e) {
  var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0, r = (j[e[t + 0]] + j[e[t + 1]] + j[e[t + 2]] + j[e[t + 3]] + "-" + j[e[t + 4]] + j[e[t + 5]] + "-" + j[e[t + 6]] + j[e[t + 7]] + "-" + j[e[t + 8]] + j[e[t + 9]] + "-" + j[e[t + 10]] + j[e[t + 11]] + j[e[t + 12]] + j[e[t + 13]] + j[e[t + 14]] + j[e[t + 15]]).toLowerCase();
  if (!k(r))
    throw TypeError("Stringified UUID is invalid");
  return r;
}
var Pe, ve, ye = 0, me = 0;
function ne(e, t, r) {
  var n = t && r || 0, o = t || new Array(16);
  e = e || {};
  var s = e.node || Pe, c = e.clockseq !== void 0 ? e.clockseq : ve;
  if (s == null || c == null) {
    var d = e.random || (e.rng || Ue)();
    s == null && (s = Pe = [d[0] | 1, d[1], d[2], d[3], d[4], d[5]]), c == null && (c = ve = (d[6] << 8 | d[7]) & 16383);
  }
  var w = e.msecs !== void 0 ? e.msecs : Date.now(), u = e.nsecs !== void 0 ? e.nsecs : me + 1, i = w - ye + (u - me) / 1e4;
  if (i < 0 && e.clockseq === void 0 && (c = c + 1 & 16383), (i < 0 || w > ye) && e.nsecs === void 0 && (u = 0), u >= 1e4)
    throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
  ye = w, me = u, ve = c, w += 122192928e5;
  var a = ((w & 268435455) * 1e4 + u) % 4294967296;
  o[n++] = a >>> 24 & 255, o[n++] = a >>> 16 & 255, o[n++] = a >>> 8 & 255, o[n++] = a & 255;
  var h = w / 4294967296 * 1e4 & 268435455;
  o[n++] = h >>> 8 & 255, o[n++] = h & 255, o[n++] = h >>> 24 & 15 | 16, o[n++] = h >>> 16 & 255, o[n++] = c >>> 8 | 128, o[n++] = c & 255;
  for (var l = 0; l < 6; ++l)
    o[n + l] = s[l];
  return t || Me(o);
}
function Fe(e, t, r) {
  e = e || {};
  var n = e.random || (e.rng || Ue)();
  return n[6] = n[6] & 15 | 64, n[8] = n[8] & 63 | 128, Me(n);
}
/*!
 * https://github.com/Starcounter-Jack/JSON-Patch
 * (c) 2017-2022 Joachim Wester
 * MIT licensed
 */
var ze = /* @__PURE__ */ function() {
  var e = function(t, r) {
    return e = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(n, o) {
      n.__proto__ = o;
    } || function(n, o) {
      for (var s in o) o.hasOwnProperty(s) && (n[s] = o[s]);
    }, e(t, r);
  };
  return function(t, r) {
    e(t, r);
    function n() {
      this.constructor = t;
    }
    t.prototype = r === null ? Object.create(r) : (n.prototype = r.prototype, new n());
  };
}(), Qe = Object.prototype.hasOwnProperty;
function ge(e, t) {
  return Qe.call(e, t);
}
function Ie(e) {
  if (Array.isArray(e)) {
    for (var t = new Array(e.length), r = 0; r < t.length; r++)
      t[r] = "" + r;
    return t;
  }
  if (Object.keys)
    return Object.keys(e);
  var n = [];
  for (var o in e)
    ge(e, o) && n.push(o);
  return n;
}
function F(e) {
  switch (typeof e) {
    case "object":
      return JSON.parse(JSON.stringify(e));
    //Faster than ES5 clone - http://jsperf.com/deep-cloning-of-objects/5
    case "undefined":
      return null;
    //this is how JSON.stringify behaves for array items
    default:
      return e;
  }
}
function Te(e) {
  for (var t = 0, r = e.length, n; t < r; ) {
    if (n = e.charCodeAt(t), n >= 48 && n <= 57) {
      t++;
      continue;
    }
    return !1;
  }
  return !0;
}
function ee(e) {
  return e.indexOf("/") === -1 && e.indexOf("~") === -1 ? e : e.replace(/~/g, "~0").replace(/\//g, "~1");
}
function be(e) {
  return e.replace(/~1/g, "/").replace(/~0/g, "~");
}
function Se(e) {
  if (e === void 0)
    return !0;
  if (e) {
    if (Array.isArray(e)) {
      for (var t = 0, r = e.length; t < r; t++)
        if (Se(e[t]))
          return !0;
    } else if (typeof e == "object") {
      for (var n = Ie(e), o = n.length, s = 0; s < o; s++)
        if (Se(e[n[s]]))
          return !0;
    }
  }
  return !1;
}
function Ce(e, t) {
  var r = [e];
  for (var n in t) {
    var o = typeof t[n] == "object" ? JSON.stringify(t[n], null, 2) : t[n];
    typeof o < "u" && r.push(n + ": " + o);
  }
  return r.join(`
`);
}
var xe = (
  /** @class */
  function(e) {
    ze(t, e);
    function t(r, n, o, s, c) {
      var d = this.constructor, w = e.call(this, Ce(r, { name: n, index: o, operation: s, tree: c })) || this;
      return w.name = n, w.index = o, w.operation = s, w.tree = c, Object.setPrototypeOf(w, d.prototype), w.message = Ce(r, { name: n, index: o, operation: s, tree: c }), w;
    }
    return t;
  }(Error)
), U = xe, Ke = F, re = {
  add: function(e, t, r) {
    return e[t] = this.value, { newDocument: r };
  },
  remove: function(e, t, r) {
    var n = e[t];
    return delete e[t], { newDocument: r, removed: n };
  },
  replace: function(e, t, r) {
    var n = e[t];
    return e[t] = this.value, { newDocument: r, removed: n };
  },
  move: function(e, t, r) {
    var n = ue(r, this.path);
    n && (n = F(n));
    var o = te(r, { op: "remove", path: this.from }).removed;
    return te(r, { op: "add", path: this.path, value: o }), { newDocument: r, removed: n };
  },
  copy: function(e, t, r) {
    var n = ue(r, this.from);
    return te(r, { op: "add", path: this.path, value: F(n) }), { newDocument: r };
  },
  test: function(e, t, r) {
    return { newDocument: r, test: oe(e[t], this.value) };
  },
  _get: function(e, t, r) {
    return this.value = e[t], { newDocument: r };
  }
}, We = {
  add: function(e, t, r) {
    return Te(t) ? e.splice(t, 0, this.value) : e[t] = this.value, { newDocument: r, index: t };
  },
  remove: function(e, t, r) {
    var n = e.splice(t, 1);
    return { newDocument: r, removed: n[0] };
  },
  replace: function(e, t, r) {
    var n = e[t];
    return e[t] = this.value, { newDocument: r, removed: n };
  },
  move: re.move,
  copy: re.copy,
  test: re.test,
  _get: re._get
};
function ue(e, t) {
  if (t == "")
    return e;
  var r = { op: "_get", path: t };
  return te(e, r), r.value;
}
function te(e, t, r, n, o, s) {
  if (r === void 0 && (r = !1), n === void 0 && (n = !0), o === void 0 && (o = !0), s === void 0 && (s = 0), r && (typeof r == "function" ? r(t, 0, e, t.path) : le(t, 0)), t.path === "") {
    var c = { newDocument: e };
    if (t.op === "add")
      return c.newDocument = t.value, c;
    if (t.op === "replace")
      return c.newDocument = t.value, c.removed = e, c;
    if (t.op === "move" || t.op === "copy")
      return c.newDocument = ue(e, t.from), t.op === "move" && (c.removed = e), c;
    if (t.op === "test") {
      if (c.test = oe(e, t.value), c.test === !1)
        throw new U("Test operation failed", "TEST_OPERATION_FAILED", s, t, e);
      return c.newDocument = e, c;
    } else {
      if (t.op === "remove")
        return c.removed = e, c.newDocument = null, c;
      if (t.op === "_get")
        return t.value = e, c;
      if (r)
        throw new U("Operation `op` property is not one of operations defined in RFC-6902", "OPERATION_OP_INVALID", s, t, e);
      return c;
    }
  } else {
    n || (e = F(e));
    var d = t.path || "", w = d.split("/"), u = e, i = 1, a = w.length, h = void 0, l = void 0, E = void 0;
    for (typeof r == "function" ? E = r : E = le; ; ) {
      if (l = w[i], l && l.indexOf("~") != -1 && (l = be(l)), o && (l == "__proto__" || l == "prototype" && i > 0 && w[i - 1] == "constructor"))
        throw new TypeError("JSON-Patch: modifying `__proto__` or `constructor/prototype` prop is banned for security reasons, if this was on purpose, please set `banPrototypeModifications` flag false and pass it to this function. More info in fast-json-patch README");
      if (r && h === void 0 && (u[l] === void 0 ? h = w.slice(0, i).join("/") : i == a - 1 && (h = t.path), h !== void 0 && E(t, 0, e, h)), i++, Array.isArray(u)) {
        if (l === "-")
          l = u.length;
        else {
          if (r && !Te(l))
            throw new U("Expected an unsigned base-10 integer value, making the new referenced value the array element with the zero-based index", "OPERATION_PATH_ILLEGAL_ARRAY_INDEX", s, t, e);
          Te(l) && (l = ~~l);
        }
        if (i >= a) {
          if (r && t.op === "add" && l > u.length)
            throw new U("The specified index MUST NOT be greater than the number of elements in the array", "OPERATION_VALUE_OUT_OF_BOUNDS", s, t, e);
          var c = We[t.op].call(t, u, l, e);
          if (c.test === !1)
            throw new U("Test operation failed", "TEST_OPERATION_FAILED", s, t, e);
          return c;
        }
      } else if (i >= a) {
        var c = re[t.op].call(t, u, l, e);
        if (c.test === !1)
          throw new U("Test operation failed", "TEST_OPERATION_FAILED", s, t, e);
        return c;
      }
      if (u = u[l], r && i < a && (!u || typeof u != "object"))
        throw new U("Cannot perform operation at the desired path", "OPERATION_PATH_UNRESOLVABLE", s, t, e);
    }
  }
}
function de(e, t, r, n, o) {
  if (n === void 0 && (n = !0), o === void 0 && (o = !0), r && !Array.isArray(t))
    throw new U("Patch sequence must be an array", "SEQUENCE_NOT_AN_ARRAY");
  n || (e = F(e));
  for (var s = new Array(t.length), c = 0, d = t.length; c < d; c++)
    s[c] = te(e, t[c], r, !0, o, c), e = s[c].newDocument;
  return s.newDocument = e, s;
}
function Ye(e, t, r) {
  var n = te(e, t);
  if (n.test === !1)
    throw new U("Test operation failed", "TEST_OPERATION_FAILED", r, t, e);
  return n.newDocument;
}
function le(e, t, r, n) {
  if (typeof e != "object" || e === null || Array.isArray(e))
    throw new U("Operation is not an object", "OPERATION_NOT_AN_OBJECT", t, e, r);
  if (re[e.op]) {
    if (typeof e.path != "string")
      throw new U("Operation `path` property is not a string", "OPERATION_PATH_INVALID", t, e, r);
    if (e.path.indexOf("/") !== 0 && e.path.length > 0)
      throw new U('Operation `path` property must start with "/"', "OPERATION_PATH_INVALID", t, e, r);
    if ((e.op === "move" || e.op === "copy") && typeof e.from != "string")
      throw new U("Operation `from` property is not present (applicable in `move` and `copy` operations)", "OPERATION_FROM_REQUIRED", t, e, r);
    if ((e.op === "add" || e.op === "replace" || e.op === "test") && e.value === void 0)
      throw new U("Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)", "OPERATION_VALUE_REQUIRED", t, e, r);
    if ((e.op === "add" || e.op === "replace" || e.op === "test") && Se(e.value))
      throw new U("Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)", "OPERATION_VALUE_CANNOT_CONTAIN_UNDEFINED", t, e, r);
    if (r) {
      if (e.op == "add") {
        var o = e.path.split("/").length, s = n.split("/").length;
        if (o !== s + 1 && o !== s)
          throw new U("Cannot perform an `add` operation at the desired path", "OPERATION_PATH_CANNOT_ADD", t, e, r);
      } else if (e.op === "replace" || e.op === "remove" || e.op === "_get") {
        if (e.path !== n)
          throw new U("Cannot perform the operation at a path that does not exist", "OPERATION_PATH_UNRESOLVABLE", t, e, r);
      } else if (e.op === "move" || e.op === "copy") {
        var c = { op: "_get", path: e.from, value: void 0 }, d = $e([c], r);
        if (d && d.name === "OPERATION_PATH_UNRESOLVABLE")
          throw new U("Cannot perform the operation from a path that does not exist", "OPERATION_FROM_UNRESOLVABLE", t, e, r);
      }
    }
  } else throw new U("Operation `op` property is not one of operations defined in RFC-6902", "OPERATION_OP_INVALID", t, e, r);
}
function $e(e, t, r) {
  try {
    if (!Array.isArray(e))
      throw new U("Patch sequence must be an array", "SEQUENCE_NOT_AN_ARRAY");
    if (t)
      de(F(t), F(e), r || !0);
    else {
      r = r || le;
      for (var n = 0; n < e.length; n++)
        r(e[n], n, t, void 0);
    }
  } catch (o) {
    if (o instanceof U)
      return o;
    throw o;
  }
}
function oe(e, t) {
  if (e === t)
    return !0;
  if (e && t && typeof e == "object" && typeof t == "object") {
    var r = Array.isArray(e), n = Array.isArray(t), o, s, c;
    if (r && n) {
      if (s = e.length, s != t.length)
        return !1;
      for (o = s; o-- !== 0; )
        if (!oe(e[o], t[o]))
          return !1;
      return !0;
    }
    if (r != n)
      return !1;
    var d = Object.keys(e);
    if (s = d.length, s !== Object.keys(t).length)
      return !1;
    for (o = s; o-- !== 0; )
      if (!t.hasOwnProperty(d[o]))
        return !1;
    for (o = s; o-- !== 0; )
      if (c = d[o], !oe(e[c], t[c]))
        return !1;
    return !0;
  }
  return e !== e && t !== t;
}
const Ze = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  JsonPatchError: U,
  _areEquals: oe,
  applyOperation: te,
  applyPatch: de,
  applyReducer: Ye,
  deepClone: Ke,
  getValueByPointer: ue,
  validate: $e,
  validator: le
}, Symbol.toStringTag, { value: "Module" }));
/*!
 * https://github.com/Starcounter-Jack/JSON-Patch
 * (c) 2017-2021 Joachim Wester
 * MIT license
 */
var _e = /* @__PURE__ */ new WeakMap(), ke = (
  /** @class */
  /* @__PURE__ */ function() {
    function e(t) {
      this.observers = /* @__PURE__ */ new Map(), this.obj = t;
    }
    return e;
  }()
), Xe = (
  /** @class */
  /* @__PURE__ */ function() {
    function e(t, r) {
      this.callback = t, this.observer = r;
    }
    return e;
  }()
);
function Ve(e) {
  return _e.get(e);
}
function et(e, t) {
  return e.observers.get(t);
}
function tt(e, t) {
  e.observers.delete(t.callback);
}
function nt(e, t) {
  t.unobserve();
}
function rt(e, t) {
  var r = [], n, o = Ve(e);
  if (!o)
    o = new ke(e), _e.set(e, o);
  else {
    var s = et(o, t);
    n = s && s.observer;
  }
  if (n)
    return n;
  if (n = {}, o.value = F(e), t) {
    n.callback = t, n.next = null;
    var c = function() {
      Ne(n);
    }, d = function() {
      clearTimeout(n.next), n.next = setTimeout(c);
    };
    typeof window < "u" && (window.addEventListener("mouseup", d), window.addEventListener("keyup", d), window.addEventListener("mousedown", d), window.addEventListener("keydown", d), window.addEventListener("change", d));
  }
  return n.patches = r, n.object = e, n.unobserve = function() {
    Ne(n), clearTimeout(n.next), tt(o, n), typeof window < "u" && (window.removeEventListener("mouseup", d), window.removeEventListener("keyup", d), window.removeEventListener("mousedown", d), window.removeEventListener("keydown", d), window.removeEventListener("change", d));
  }, o.observers.set(t, new Xe(t, n)), n;
}
function Ne(e, t) {
  t === void 0 && (t = !1);
  var r = _e.get(e.object);
  Re(r.value, e.object, e.patches, "", t), e.patches.length && de(r.value, e.patches);
  var n = e.patches;
  return n.length > 0 && (e.patches = [], e.callback && e.callback(n)), n;
}
function Re(e, t, r, n, o) {
  if (t !== e) {
    typeof t.toJSON == "function" && (t = t.toJSON());
    for (var s = Ie(t), c = Ie(e), d = !1, w = c.length - 1; w >= 0; w--) {
      var u = c[w], i = e[u];
      if (ge(t, u) && !(t[u] === void 0 && i !== void 0 && Array.isArray(t) === !1)) {
        var a = t[u];
        typeof i == "object" && i != null && typeof a == "object" && a != null && Array.isArray(i) === Array.isArray(a) ? Re(i, a, r, n + "/" + ee(u), o) : i !== a && (o && r.push({ op: "test", path: n + "/" + ee(u), value: F(i) }), r.push({ op: "replace", path: n + "/" + ee(u), value: F(a) }));
      } else Array.isArray(e) === Array.isArray(t) ? (o && r.push({ op: "test", path: n + "/" + ee(u), value: F(i) }), r.push({ op: "remove", path: n + "/" + ee(u) }), d = !0) : (o && r.push({ op: "test", path: n, value: e }), r.push({ op: "replace", path: n, value: t }));
    }
    if (!(!d && s.length == c.length))
      for (var w = 0; w < s.length; w++) {
        var u = s[w];
        !ge(e, u) && t[u] !== void 0 && r.push({ op: "add", path: n + "/" + ee(u), value: F(t[u]) });
      }
  }
}
function ot(e, t, r) {
  r === void 0 && (r = !1);
  var n = [];
  return Re(e, t, n, "", r), n;
}
const st = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  compare: ot,
  generate: Ne,
  observe: rt,
  unobserve: nt
}, Symbol.toStringTag, { value: "Module" }));
Object.assign({}, Ze, st, {
  JsonPatchError: xe,
  deepClone: F,
  escapePathComponent: ee,
  unescapePathComponent: be
});
const it = "https://auth.knowlearning.systems", at = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA59Uz6jvBJF3B8/7xMqGo
XkIhLFvTCHuFIGuCNNZGCJUnSk2ne6Jp1ehUIarliJwzrvfr2HMe0PvzAJyZqQIs
uz0Lt867TTojCAKJunxbcrwEhzvz0FNjNu1wpgkSHFvd1uTvRSZqauqUmG0HqC17
HSmBaXivB49B/pviowVJc+mUJJ9MROtOiL4JN5niHnLbt6QVi6NITAJkOwtoRhck
5j0KLvfrq18R8QrfDOq3v5hWlrA6j1wPvTW1mzFk8MrOZw935mMDdMivFAm/DltM
NT5I3YnLZpcl1e/fydC+B6zSz2nZfLb2iDBbADDVj2+i9JUEFomg6ng1DjHUGMYc
ZQIDAQAB
-----END PUBLIC KEY-----
`;
if (window.location.pathname.startsWith("/auth/")) {
  const e = window.location.pathname.slice(6), [t] = e.split("/", 1), r = window.localStorage.getItem(t);
  if (r) {
    const n = e.slice(t.length + 1);
    window.localStorage.setItem("token", n), window.location.href = r;
  }
}
async function ct(e = "google", t) {
  const r = Math.random().toString(36).substring(2);
  if (window.localStorage.setItem(r, window.location.href), e === "code") {
    const n = { code: t, provider: e, domain: window.location.host }, o = await lt(at, JSON.stringify(n));
    window.location.href = `/auth/${r}/${o}`;
  } else {
    const n = encodeURIComponent(window.location.href);
    window.location.href = `${it}/${e}/${r}/${n}`;
  }
}
function ft() {
  window.localStorage.setItem("token", Math.random().toString(36).substring(2)), window.location.reload();
}
async function ut() {
  const e = localStorage.getItem("token");
  return window.localStorage.removeItem("token"), e;
}
async function lt(e, t) {
  const r = await crypto.subtle.importKey(
    "spki",
    dt(e),
    { name: "RSA-OAEP", hash: "SHA-256" },
    !0,
    ["encrypt"]
  ), n = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    !0,
    ["encrypt", "decrypt"]
  ), o = new TextEncoder().encode(t), s = crypto.getRandomValues(new Uint8Array(12)), c = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: s },
    n,
    o
  ), d = await crypto.subtle.exportKey("raw", n), w = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    r,
    d
  );
  return [
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(s)))),
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(c)))),
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(w))))
  ].join(",");
}
function dt(e) {
  const t = e.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), r = atob(t), n = new Uint8Array(r.length);
  for (let o = 0; o < r.length; o++)
    n[o] = r.charCodeAt(o);
  return n.buffer;
}
function pt(e) {
  return e.map((t) => {
    const r = { ...t, path: "/" + t.path.map(De).join("/") };
    return t.from && (r.from = "/" + t.from.map(De).join("/")), r;
  });
}
function De(e) {
  return typeof e == "string" ? e.replaceAll("~", "~0").replaceAll("/", "~1") : e;
}
const Ee = /* @__PURE__ */ new Set(), ae = /* @__PURE__ */ new Map();
function ce(e) {
  return `/${e.join("/")}`;
}
function Le(e) {
  return JSON.parse(JSON.stringify(e));
}
function wt(e, [t, r]) {
  return Math.max(Math.min(parseInt(e), r), t);
}
function se(e, t, r = {}, n = [], o) {
  if (r[ce(n)]) return e;
  if (Ee.has(e))
    throw new Error(`Cannot add mutable state to multiple mutable parents. Attempted Path: ${ce(n)}`);
  const s = Array.isArray(e), c = (i, a) => se(
    a,
    t,
    r,
    [...n, i]
  ), d = {
    copyWithin() {
      throw new Error('"copyWithin" not implemented.');
    },
    sort(i) {
      const a = /* @__PURE__ */ new Map();
      e.forEach((l, E) => {
        a.has(l) || a.set(l, []), a.get(l).push(E);
      }), e.sort(i);
      let h = e.map((l) => a.get(l).shift());
      return t(
        e.map((l, E) => {
          const v = ae.get(l);
          v && (v[v.length - 1] = E);
          const g = h[E];
          return h = h.map((O) => O < g ? O + 1 : O), {
            op: "move",
            from: [...n, g],
            path: [...n, E]
          };
        })
      ), u;
    },
    reverse() {
      const i = [];
      return e.forEach((a, h) => {
        i.push({
          op: "move",
          from: [...n, h],
          path: [...n, 0]
        });
        const l = ae.get(a);
        l && (l[l.length - 1] = e.length - 1 - h);
      }), e.reverse(), t(i), u;
    },
    shift() {
      return d.splice(0, 1)[0];
    },
    unshift() {
      return d.splice(0, 0, ...arguments), e.length;
    },
    splice(i, a, ...h) {
      const l = e.length - i;
      if (arguments.length === 0) return;
      arguments.length === 1 || arguments[1] === 1 / 0 ? a = l : a = wt(a, [0, l]) || 0;
      const E = [...n, i], v = Array.from(
        { length: a },
        () => ({ op: "remove", path: E })
      );
      h.forEach((m, y) => {
        v.push({
          op: "add",
          path: [...n, i + y],
          value: Le(m)
        });
      });
      const g = h.length - a;
      g !== 0 && e.slice(i + a).forEach((m) => {
        const y = ae.get(m);
        y && (y[y.length - 1] = y[y.length - 1] + g);
      });
      const O = h.map(
        (m, y) => m instanceof Object ? c(y + i, m) : m
      ), I = e.splice(i, a, ...O);
      return t(v), I;
    }
  };
  Object.entries(e).filter(([, i]) => i instanceof Object).forEach(([i, a]) => {
    s && /^\d+$/.test(i) && (i = parseInt(i)), e[i] = c(i, a);
  });
  const w = {
    set(i, a, h) {
      if (s)
        if (/^\d+$/.test(a))
          a = parseInt(a);
        else return i[a] = h, !0;
      const l = [...n, a], E = ce(l);
      if (r[E])
        return i[a] = h, !0;
      if (h === void 0)
        throw new Error(`Setting properties to undefined is not supported. Please use a delete statement. Attempted to set ${E}`);
      return t([{
        op: i[a] === void 0 ? "add" : "replace",
        value: Le(h),
        //  TODO: more efficient sanitization
        path: l
      }]), h instanceof Object ? i[a] = c(a, h) : i[a] = h, !0;
    },
    deleteProperty(i, a) {
      if (a in i) {
        if (Ee.delete(u), delete i[a], s)
          if (/^\d+$/.test(a)) a = parseInt(a);
          else return !0;
        const h = [...n, a];
        r[ce(h)] || t([{ op: "remove", path: h }]);
      }
      return !0;
    },
    get(i, a, h) {
      return s && d[a] ? d[a] : i[a];
    }
  }, u = new Proxy(e, w);
  return Ee.add(u), ae.set(u, n), u;
}
const ht = 1e4, vt = { open: !0, mutate: !0, close: !0 };
function yt(e) {
  return structuredClone(e).filter(({ path: t }) => t.shift() === "active");
}
function mt({ token: e, sid: t, domain: r, Connection: n, watchers: o, states: s, applyPatch: c, log: d, login: w, reboot: u, handleDomainMessage: i, trigger: a, variables: h = {} }) {
  let l, E, v = !1, g, O, I = -1, m = 0;
  const y = [];
  let N = -1, _, M = null, $ = null, z = !1, Y = !1;
  const X = [], p = {};
  let A;
  const T = new Promise((f) => A = f), R = {
    loaded: Date.now(),
    connected: null,
    authenticated: null
  };
  async function P() {
    return { variables: h, ...await T, context: [] };
  }
  function H({ scope: f, patch: C, context: b }) {
    if (M === f) {
      const G = y.length - 1;
      y[G].patch = [...y[G].patch, ...C];
    } else
      I += 1, $ = new Promise((G, L) => p[I] = [[G, L]]), y.push({ scope: f, patch: C, context: b, si: I, ts: Date.now() }), M = f, q();
    return $;
  }
  async function q() {
    for (await new Promise((f) => f()), M = null; v && N + 1 < y.length; ) {
      M = null;
      try {
        l.send(y[N + 1]), N += 1, await new Promise((f) => f());
      } catch (f) {
        console.warn("ERROR SENDING OVER CONNECTION", f), B();
        break;
      }
    }
  }
  function Q() {
    const f = Object.keys(p).map(parseInt).sort()[0] || 1 / 0;
    for (; X[0] && X[0].si < f; )
      X.shift().resolve();
  }
  function J() {
    clearTimeout(_), _ = setTimeout(
      () => {
        d("CLOSING DUE TO HEARTBEAT TIMEOUT"), B();
      },
      ht
    );
  }
  async function B() {
    z || (v = !1, l.onmessage = () => {
    }, Y || (await new Promise((f) => setTimeout(f, Math.min(1e3, m * 100))), z = !0, m += 1, K(), z = !1));
  }
  function K() {
    l = new n(), l.onopen = async () => {
      R.connected || (R.connected = Date.now()), d("AUTHORIZING NEWLY OPENED CONNECTION FOR SESSION:", g), m = 0, l.send({ token: await e(), sid: await (t == null ? void 0 : t()), session: g, domain: r });
    }, l.onmessage = async (f) => {
      if (J(), !!f)
        try {
          if (f.error && console.warn("ERROR RESPONSE", f), v)
            if (vt[f.type])
              try {
                i && i(f, a);
              } catch {
                d("ERROR HANDLING DOMAIN MESSAGE", f);
              }
            else if (f.si !== void 0)
              p[f.si] ? (p[f.si].forEach(([C, b]) => f.error ? b(f) : C(f)), delete p[f.si], l.send({ ack: f.si }), Q()) : console.warn("received MULTIPLE responses for message with si", f.si, f);
            else {
              const C = f.domain === r ? "" : f.domain, b = f.user === E ? "" : f.user, G = f.scope, L = k(G) ? G : `${C}/${b}/${G}`;
              if (o[L]) {
                if (s[L] = await s[L], s[L].ii + 1 !== f.ii)
                  return;
                s[L].ii = f.ii;
                const W = f.patch.findLastIndex((V) => V.path.length === 0);
                W > -1 && (s[L] = f.patch[W].value), s[L].active === void 0 && (s[L].active = {}), c(s[L], pt(f.patch.slice(W + 1))), o[L].forEach((V) => {
                  const we = structuredClone(s[L].active);
                  V({ ...f, patch: yt(f.patch), state: we });
                });
              }
            }
          else {
            if (f.error) return w();
            v = !0, E ? O !== f.server ? (console.warn(`REBOOTING DUE TO SERVER SWITCH ${O} -> ${f.server}`, f), u()) : N = f.ack : (console.log("INIT MESSAGE", f), R.authenticated = Date.now(), E = f.auth.user, g = f.session, O = f.server, A(f)), q();
          }
        } catch (C) {
          console.error("ERROR HANDLING CONNECTION MESSAGE", C, f);
        }
    }, l.onerror = async (f) => {
      d("CONNECTION ERROR", f.message);
    }, l.onclose = async (f) => {
      d("CONNECTION CLOSURE", f.message), B();
    }, J();
  }
  async function Z() {
    const f = new Promise((C) => X.push({ si: N, resolve: C }));
    return Q(), f;
  }
  function pe() {
    return new Promise((f, C) => p[I].push([f, C]));
  }
  function S() {
    d("DISCONNECTED AGENT!!!!!!!!!!!!!!!"), Y = !0, l.close({ keepalive: !0 });
  }
  function D() {
    d("RECONNECTED AGENT!!!!!!!!!!!!!!!"), Y = !1, B();
  }
  return K(), [H, pe, S, D, Z, P];
}
function Et(e = "[]", t, r, { keyToSubscriptionId: n, watchers: o, states: s, create: c, environment: d, lastMessageResponse: w, lastInteractionResponse: u, interact: i, log: a }) {
  let h, l = new Promise((v) => h = v);
  const E = new Promise(async (v, g) => {
    const { auth: { user: O }, domain: I, session: m } = await d(), y = k(e) ? e : `${!r || r === I ? "" : r}/${!t || t === O ? "" : t}/${e}`;
    if (!n[y]) {
      const N = Fe();
      n[y] = N, o[y] = [], s[y] = new Promise(async (_, M) => {
        await new Promise(($) => setTimeout($)), i("sessions", [{
          op: "add",
          path: ["active", m, "subscriptions", N],
          value: { scope: e, user: t, domain: r, ii: null }
        }], !1);
        try {
          _(await w());
        } catch ($) {
          M($);
        }
      });
    }
    await u[y];
    try {
      const N = structuredClone(await s[y]), _ = N.active;
      delete N.active, h(N), v(new se(_ || {}, (M) => {
        const $ = structuredClone(M);
        $.forEach((z) => z.path.unshift("active")), i(e, $);
      }));
    } catch (N) {
      g(N);
    }
  });
  return E.metadata = l, E;
}
const At = "[]";
function qe({ metadata: e, environment: t, state: r, watchers: n, synced: o, sentUpdates: s }) {
  function c(u = At, i, a, h) {
    if (Array.isArray(u)) return d(u, i, a, h);
    const l = r(u, a, h);
    let E, v = !1;
    return e(u, a, h).then(async ({ ii: g }) => {
      const { auth: { user: O }, domain: I } = await t(), m = await l;
      v || (E = k(u) ? u : `${!h || h === I ? "" : h}/${!a || a === O ? "" : a}/${u}`, i({ scope: u, user: a, domain: h, state: m, patch: null, ii: g }), s && (s[E] = g), !v && (n[E] || (n[E] = []), n[E].push(i)));
    }), () => {
      v = !0, E && w(E, i);
    };
  }
  function d(u, i, a, h) {
    const l = u[0], E = u.slice(1);
    let v = () => {
    };
    const O = c(l, ({ state: I }) => {
      if (E.length === 0) {
        i(I);
        return;
      }
      v();
      let m = I;
      for (let y = 0; y < E.length; y += 1)
        if (m = m[E[y]], m == null || y === E.length - 1) i(m);
        else if (k(m)) {
          v = d([m, ...E.slice(y + 1)], i, a, h);
          return;
        }
    }, a, h);
    return () => {
      O(), v();
    };
  }
  function w(u, i) {
    if (!n[u]) {
      console.warn("NO WATCHERS FOR KEY", u, i);
      return;
    }
    const a = n[u].findIndex((h) => h === i);
    a > -1 && n[u].splice(a, 1);
  }
  return [c, w];
}
const Ot = "application/json;type=download";
function Je(e, { create: t, lastMessageResponse: r, fetch: n, metadata: o }) {
  t({
    active_type: Ot,
    active: { id: e }
  });
  let s = "fetch";
  const c = new Promise(async (d, w) => {
    const { url: u } = await r();
    if (await new Promise((i) => setTimeout(i)), s === "url") d(u);
    else if (s === "fetch") {
      const i = await n(u), { ok: a, statusText: h } = i;
      a ? d(i) : w(h);
    } else if (s === "direct") {
      const i = await Je(e, { create: t, lastMessageResponse: r, fetch: n, metadata: o }), { name: a } = await o(e), h = i.headers.get("Content-Type"), l = new Blob([await i.blob()], { type: h }), E = window.URL.createObjectURL(l), v = document.createElement("a");
      v.style.display = "none", v.href = E, v.download = a, document.body.appendChild(v), v.click(), window.URL.revokeObjectURL(E), d();
    }
  });
  return c.direct = () => (s = "direct", c), c.url = () => (s = "url", c), c;
}
const Ae = "[]", gt = "application/json;type=upload", It = "application/json;type=domain-claim";
function Tt({ Connection: e, domain: t, token: r, sid: n, uuid: o, fetch: s, applyPatch: c, login: d, logout: w, reboot: u, handleDomainMessage: i, log: a = console.log, variables: h = {} }) {
  const l = {}, E = {}, v = {}, g = {};
  A("INITIALIZING AGENT CONNECTION");
  const [
    O,
    I,
    m,
    y,
    N,
    _
  ] = mt({ token: r, sid: n, domain: t, Connection: e, watchers: E, states: l, applyPatch: c, log: A, login: d, interact: P, reboot: u, trigger: pe, handleDomainMessage: i, variables: h });
  _().then(({ session: S }) => {
    P("sessions", [{ op: "add", path: ["active", S], value: { queries: {}, subscriptions: {} } }], !1);
  });
  const M = {
    keyToSubscriptionId: v,
    watchers: E,
    states: l,
    state: Y,
    create: T,
    environment: _,
    lastInteractionResponse: g,
    lastMessageResponse: I,
    interact: P,
    fetch: s,
    synced: N,
    metadata: J,
    log: A
  }, [$, z] = qe(M);
  function Y(S, D, f) {
    return Et(S, D, f, M);
  }
  function X(S) {
    return Je(S, M);
  }
  function p() {
  }
  function A() {
    a(...arguments);
  }
  function T({ id: S = o(), active_type: D, active: f, name: C }) {
    D || (D = "application/json");
    const b = [
      { op: "add", path: ["active_type"], value: D },
      { op: "add", path: ["active"], value: f }
    ];
    return C && b.push({ op: "add", path: ["name"], value: C }), P(S, b), S;
  }
  async function R(S) {
    const { name: D, type: f, data: C, id: b = o() } = S || {};
    T({
      active_type: gt,
      active: { id: b, type: f, name: D },
      name: D
    });
    const { url: G } = await I();
    if (C === void 0) return G;
    {
      const W = await s(G, { method: "PUT", headers: { "Content-Type": f }, body: C }), { ok: V, statusText: we } = W;
      if (V) return b;
      throw new Error(we);
    }
  }
  async function P(S = Ae, D, f = !0, C = []) {
    const b = O({ scope: S, patch: D, context: C }), G = k(S) ? S : `//${S}`;
    if (f && l[G] !== void 0)
      return g[G] = b.then((L) => L.ii), b;
    {
      const { ii: L } = await b;
      return { ii: L };
    }
  }
  async function H(S) {
    const D = o();
    return T({
      id: D,
      active_type: It,
      active: { domain: S }
    }), I();
  }
  function q(S = Ae) {
    return P(S, [{ op: "remove", path: ["active"] }]);
  }
  function Q({ path: S, op: D, value: f }) {
    return ["active_type", "name"].includes(S[0]) && S.length === 1 && typeof f == "string" || D === "remove";
  }
  async function J(S = Ae, D, f) {
    const C = structuredClone(await Y(S, D).metadata);
    return delete C.active, new se(C, (b) => {
      const G = structuredClone(b);
      if (!G.every(Q))
        throw new Error("You may only modify the type or name for a scope's metadata");
      P(S, G);
    });
  }
  async function B(S, D, f, C = []) {
    const b = o(), G = Date.now(), { session: L } = await _();
    await new Promise((W) => setTimeout(W)), P("sessions", [
      {
        op: "add",
        path: ["active", L, "queries", b],
        value: { query: S, params: D, domain: f, context: C }
      }
    ], !1);
    try {
      const W = await I(), { rows: V } = W;
      return P("sessions", [
        {
          op: "add",
          path: ["active", L, "queries", b, "agent_latency"],
          value: Date.now() - G
        },
        {
          op: "remove",
          path: ["active", L, "queries", b]
        }
      ], !1), V;
    } catch (W) {
      throw W;
    }
  }
  const K = { child: [] };
  function Z(S, D) {
    if (!K[S]) throw new Error('Agent can only listen to events of "child"');
    K[S].push(D);
  }
  function pe(S, D) {
    K[S].forEach((f) => f(D));
  }
  return {
    uuid: o,
    environment: _,
    login: d,
    logout: w,
    log: A,
    create: T,
    state: Y,
    watch: $,
    upload: R,
    download: X,
    interact: P,
    claim: H,
    reset: q,
    metadata: J,
    query: B,
    synced: N,
    disconnect: m,
    reconnect: y,
    debug: p,
    on: Z
  };
}
const St = [...navigator.languages], Ge = localStorage.getItem("API_HOST") || "api.knowlearning.systems";
async function Nt() {
  const e = await fetch(`https://${Ge}/_sid-check`, { method: "GET", credentials: "include" }), t = !!localStorage.getItem("sid");
  if (e.status === 201) {
    if (!t) {
      const r = await e.text();
      localStorage.setItem("sid", r), location.reload();
    }
  } else e.status === 200 ? t && (localStorage.removeItem("sid"), location.reload()) : console.warn("Issue Connecting To the API Server");
}
const _t = (e) => {
  Nt();
  const t = function() {
    const n = new WebSocket(`wss://${Ge}`);
    return this.send = (o) => n.send(JSON.stringify(o)), this.close = (o) => {
      this.send({ type: "close", info: o }), n.close();
    }, n.onopen = () => this.onopen(), n.onmessage = ({ data: o }) => this.onmessage(o.length === 0 ? null : JSON.parse(o)), n.onerror = (o) => this.onerror && this.onerror(o), n.onclose = (o) => this.onclose && this.onclose(o), this;
  }, r = Tt({
    token: e.getToken || ut,
    sid: () => localStorage.getItem("sid"),
    domain: window.location.host,
    Connection: t,
    uuid: ne,
    fetch,
    applyPatch: de,
    login: ct,
    logout: ft,
    variables: { LANGUAGES: St },
    reboot: () => window.location.reload()
  });
  return r.local = () => {
    localStorage.setItem("api", "local"), location.reload();
  }, r.remote = (n = "production") => {
    localStorage.setItem("api", "remote"), localStorage.setItem("mode", n), location.reload();
  }, r.close = () => {
    window.close();
  }, r;
};
function Rt() {
  let e = 0, t;
  const r = new Promise((p) => t = p), n = {}, o = {}, s = {}, [c, d] = qe({ metadata: y, state: E, watchers: o, synced: Y, sentUpdates: s, environment: a });
  async function w(p) {
    const A = p.requestId || ne();
    e += 1;
    const T = window.opener ? window.opener : window.parent;
    try {
      return T.postMessage({
        ...p,
        session: await r,
        requestId: A,
        index: e
      }, "*"), new Promise((R, P) => {
        n[A] = { resolve: R, reject: P };
      });
    } catch (R) {
      console.log("ERROR POSTING MESSAGE UP", p, R);
    }
  }
  let u = !1;
  addEventListener("message", async ({ data: p }) => {
    if (p.type === "setup" && !u)
      u = !0, t(p.session);
    else {
      if (!u || p.session !== await r) return;
      if (n[p.requestId]) {
        const { resolve: A, reject: T } = n[p.requestId];
        p.error ? T(p.error) : A(p.response);
      } else if (p.ii !== void 0) {
        const { scope: A, user: T, domain: R } = p, { auth: P, domain: H } = await a(), q = !R || R === H ? "" : R, Q = !T || P.user === T ? "" : T, J = k(A) ? A : `${q}/${Q}/${A}`, B = () => {
          s[J] = p.ii, o[J].forEach((K) => K(p));
        };
        o[J] && (s[J] === void 0 || s[J] + 1 === p.ii ? B() : p.ii === s[J] || p.ii < s[J] || B());
      }
    }
  });
  let i;
  async function a(p) {
    const A = await w({ type: "environment", user: p });
    return i || (i = A.variables), { ...A, variables: i };
  }
  function h({ id: p = ne(), active_type: A, active: T }) {
    return A || (A = "application/json"), g(p, [
      { op: "add", path: ["active_type"], value: A },
      { op: "add", path: ["active"], value: T }
    ]), p;
  }
  async function l(p, A) {
    return w({ type: "patch", root: p, scopes: A });
  }
  async function E(p, A, T) {
    if (p === void 0) {
      const { context: P } = await a();
      p = JSON.stringify(P);
    }
    const R = await w({ type: "state", scope: p, user: A, domain: T });
    return new se(R, (P) => {
      const H = structuredClone(P);
      H.forEach((q) => q.path.unshift("active")), g(p, H);
    });
  }
  function v(p) {
    return g(p, [{ op: "add", path: ["active"], value: null }]);
  }
  function g(p, A, T, R) {
    return w({ type: "interact", scope: p, patch: A, context: R });
  }
  async function O(p) {
    let { name: A, type: T, data: R, id: P = ne() } = p || {};
    const H = await w({ type: "upload", info: { name: A, type: T, id: P } });
    if (R === void 0) return H;
    {
      const Q = await fetch(H, { method: "PUT", headers: { "Content-Type": T }, body: R }), { ok: J, statusText: B } = Q;
      if (J) return P;
      throw new Error(B);
    }
  }
  function I(p) {
    let A = "fetch";
    const T = new Promise(async (R, P) => {
      const H = await w({ type: "download", id: p });
      if (await new Promise((q) => setTimeout(q)), A === "url") R(H);
      else if (A === "fetch") {
        const q = await fetch(H), { ok: Q, statusText: J } = q;
        Q ? R(q) : P(J);
      } else if (A === "direct") {
        const q = await I(p), { name: Q } = await y(p), J = q.headers.get("Content-Type"), B = new Blob([await q.blob()], { type: J }), K = window.URL.createObjectURL(B), Z = document.createElement("a");
        Z.style.display = "none", Z.href = K, Z.download = Q, document.body.appendChild(Z), Z.click(), window.URL.revokeObjectURL(K), R();
      }
    });
    return T.direct = () => (A = "direct", T), T.url = () => (A = "url", T), T;
  }
  function m({ path: p, op: A, value: T }) {
    return ["active_type", "name"].includes(p[0]) && p.length === 1 && typeof T == "string" || A === "remove";
  }
  async function y(p, A, T) {
    const R = await w({ type: "metadata", scope: p, user: A, domain: T });
    return new se(R, (P) => {
      const H = structuredClone(P);
      H.forEach((q) => {
        if (!m(q)) throw new Error("You may only modify the type or name for a scope's metadata");
      }), g(p, H);
    });
  }
  function N(p, A, T) {
    return w({ type: "login", provider: p, username: A, password: T });
  }
  function _(p, A, T, R = []) {
    return w({ type: "query", query: p, params: A, domain: T, context: R });
  }
  function M() {
    return w({ type: "logout" });
  }
  function $() {
    return w({ type: "disconnect" });
  }
  function z() {
    return w({ type: "reconnect" });
  }
  function Y() {
    return w({ type: "synced" });
  }
  function X(p) {
    return w({ type: "close", info: p });
  }
  return {
    embedded: !0,
    uuid: ne,
    environment: a,
    login: N,
    logout: M,
    create: h,
    state: E,
    watch: c,
    upload: O,
    download: I,
    interact: g,
    patch: l,
    reset: v,
    metadata: y,
    disconnect: $,
    reconnect: z,
    synced: Y,
    close: X,
    query: _
  };
}
async function Pt({ accept: e }) {
  return new Promise((t, r) => {
    const n = document.createElement("input");
    n.type = "file", n.accept = e, n.addEventListener("change", async (o) => {
      const s = o.target.files[0];
      t(s || null);
    }), n.click();
  });
}
let x = window.__default_knowlearning_agent;
function Oe(e, t) {
  const r = (e == null ? void 0 : e.allow) || [], n = typeof e == "string" ? e : e == null ? void 0 : e.prefix;
  return n && !k(t) && !r.some((o) => t.startsWith(o)) ? `${n}/${t}` : t;
}
function He(e = {}) {
  if (x && !e.unique) return x;
  let t;
  try {
    t = window.self !== window.top;
  } catch {
    t = !0;
  }
  const r = t && !e.root ? Rt() : _t(e);
  r.embed = Ct;
  const n = r.upload;
  return r.upload = async (o) => {
    if (o != null && o.browser) {
      const s = await Pt(o);
      if (!s || o.validate && !await o.validate(s)) return;
      o.data = await s.arrayBuffer(), o.name || (o.name = s.name), o.type || (o.type = s.type);
    }
    return n(o);
  }, x || (window.__default_knowlearning_agent = x = r), r;
}
const fe = (e) => JSON.parse(JSON.stringify(e));
function Ct(e, t) {
  const r = {}, n = [], o = {};
  let s = !1, c = !1;
  const d = ne(), w = (v) => new Promise((g, O) => {
    const I = { ...fe(v), session: d };
    n.push({ message: I, sent: g }), s && u();
  }), u = () => {
    for (; t.parentNode && n.length; ) {
      const { message: v, sent: g } = n.shift();
      t.contentWindow.postMessage(v, "*"), g();
    }
  }, i = async (v) => {
    const { requestId: g, type: O } = v, I = (m, y) => w({ requestId: g, response: m, error: y });
    if (O === "error")
      console.error(v), I({});
    else if (O === "close")
      o.close && o.close(v.info);
    else if (O === "environment") {
      const { user: m } = v, { mode: y, variables: N = {} } = e, _ = await (o.environment ? o.environment(m) : x.environment(m));
      I({
        ..._,
        context: [
          ..._.context || [],
          e.id
        ],
        variables: {
          ..._.variables || {},
          ...N
        },
        mode: y
        //  TODO: deprecate
      });
    } else if (O === "interact") {
      let { scope: m, patch: y, context: N = [] } = v;
      const _ = Oe(e.namespace, m);
      let M;
      if (o.mutate && (M = fe(await x.state(_))), await x.interact(_, y, !0, [e.id, ...N]), o.mutate) {
        const $ = fe(y);
        $.forEach((z) => z.path.shift()), o.mutate({
          scope: _,
          before: M,
          after: fe(await x.state(_)),
          patch: $
        });
      }
      I({});
    } else if (O === "metadata") {
      const { scope: m, user: y, domain: N } = v, _ = Oe(e.namespace, m);
      I(await x.metadata(_, y, N));
    } else if (O === "state") {
      const { scope: m, user: y, domain: N } = v, _ = Oe(e.namespace, m), M = x.state(_, y, N), $ = `${N || ""}/${y || ""}/${_}`;
      r[$] || (r[$] = x.watch(_, (z) => w({ ...z, scope: m }), y, N)), o.state && o.state({ scope: m }), I(await M);
    } else if (O === "patch") {
      const { root: m, scopes: y } = v;
      I(await x.patch(m, y));
    } else if (O === "query") {
      const { query: m, params: y, domain: N, context: _ = [] } = v;
      x.query(m, y, N, [e.id, ..._]).then(I).catch((M) => I(null, M.error));
    } else if (O === "upload") {
      const { info: m } = v;
      I(await x.upload(m));
    } else if (O === "download")
      I(await x.download(v.id).url());
    else if (O === "login") {
      const { provider: m, username: y, password: N } = v;
      I(await x.login(m, y, N));
    } else O === "logout" ? x.logout() : O === "disconnect" ? I(await x.disconnect()) : O === "reconnect" ? I(await x.reconnect()) : O === "synced" ? I(await x.synced()) : (console.log("Unknown message type passed up...", v), I({}));
  };
  window.addEventListener("message", ({ data: v }) => {
    v.session === d && (c = !0, i(v));
  }), t.onload = () => {
    s = !0, u();
  }, a();
  async function a() {
    He();
    const { protocol: v } = window.location, { id: g } = e;
    if (k(g)) {
      const { domain: O } = await x.metadata(g);
      t.src = `${v}//${O}/${g}`;
    } else t.src = g;
    for (; !c; )
      w({ type: "setup", session: d }), await new Promise((O) => setTimeout(O, 100));
    o.open && o.open();
  }
  function h() {
    t.parentNode && t.parentNode.removeChild(t);
  }
  function l(v, g) {
    o[v] = g;
  }
  function E(v, g) {
    w({ type: "auth", token: v, state: g });
  }
  return {
    auth: E,
    remove: h,
    on: l
  };
}
window.Agent = He();
