var fe, Ye = new Uint8Array(16);
function be() {
  if (!fe && (fe = typeof crypto < "u" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto) || typeof msCrypto < "u" && typeof msCrypto.getRandomValues == "function" && msCrypto.getRandomValues.bind(msCrypto), !fe))
    throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
  return fe(Ye);
}
const ze = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
function Q(e) {
  return typeof e == "string" && ze.test(e);
}
var j = [];
for (var ye = 0; ye < 256; ++ye)
  j.push((ye + 256).toString(16).substr(1));
function xe(e) {
  var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0, r = (j[e[t + 0]] + j[e[t + 1]] + j[e[t + 2]] + j[e[t + 3]] + "-" + j[e[t + 4]] + j[e[t + 5]] + "-" + j[e[t + 6]] + j[e[t + 7]] + "-" + j[e[t + 8]] + j[e[t + 9]] + "-" + j[e[t + 10]] + j[e[t + 11]] + j[e[t + 12]] + j[e[t + 13]] + j[e[t + 14]] + j[e[t + 15]]).toLowerCase();
  if (!Q(r))
    throw TypeError("Stringified UUID is invalid");
  return r;
}
var De, me, Ee = 0, Ae = 0;
function ie(e, t, r) {
  var n = t && r || 0, o = t || new Array(16);
  e = e || {};
  var i = e.node || De, c = e.clockseq !== void 0 ? e.clockseq : me;
  if (i == null || c == null) {
    var d = e.random || (e.rng || be)();
    i == null && (i = De = [d[0] | 1, d[1], d[2], d[3], d[4], d[5]]), c == null && (c = me = (d[6] << 8 | d[7]) & 16383);
  }
  var p = e.msecs !== void 0 ? e.msecs : Date.now(), l = e.nsecs !== void 0 ? e.nsecs : Ae + 1, a = p - Ee + (l - Ae) / 1e4;
  if (a < 0 && e.clockseq === void 0 && (c = c + 1 & 16383), (a < 0 || p > Ee) && e.nsecs === void 0 && (l = 0), l >= 1e4)
    throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
  Ee = p, Ae = l, me = c, p += 122192928e5;
  var s = ((p & 268435455) * 1e4 + l) % 4294967296;
  o[n++] = s >>> 24 & 255, o[n++] = s >>> 16 & 255, o[n++] = s >>> 8 & 255, o[n++] = s & 255;
  var v = p / 4294967296 * 1e4 & 268435455;
  o[n++] = v >>> 8 & 255, o[n++] = v & 255, o[n++] = v >>> 24 & 15 | 16, o[n++] = v >>> 16 & 255, o[n++] = c >>> 8 | 128, o[n++] = c & 255;
  for (var u = 0; u < 6; ++u)
    o[n + u] = i[u];
  return t || xe(o);
}
function Qe(e, t, r) {
  e = e || {};
  var n = e.random || (e.rng || be)();
  return n[6] = n[6] & 15 | 64, n[8] = n[8] & 63 | 128, xe(n);
}
/*!
 * https://github.com/Starcounter-Jack/JSON-Patch
 * (c) 2017-2022 Joachim Wester
 * MIT licensed
 */
var Ke = /* @__PURE__ */ function() {
  var e = function(t, r) {
    return e = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(n, o) {
      n.__proto__ = o;
    } || function(n, o) {
      for (var i in o) o.hasOwnProperty(i) && (n[i] = o[i]);
    }, e(t, r);
  };
  return function(t, r) {
    e(t, r);
    function n() {
      this.constructor = t;
    }
    t.prototype = r === null ? Object.create(r) : (n.prototype = r.prototype, new n());
  };
}(), We = Object.prototype.hasOwnProperty;
function Ie(e, t) {
  return We.call(e, t);
}
function Se(e) {
  if (Array.isArray(e)) {
    for (var t = new Array(e.length), r = 0; r < t.length; r++)
      t[r] = "" + r;
    return t;
  }
  if (Object.keys)
    return Object.keys(e);
  var n = [];
  for (var o in e)
    Ie(e, o) && n.push(o);
  return n;
}
function Y(e) {
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
function Ne(e) {
  for (var t = 0, r = e.length, n; t < r; ) {
    if (n = e.charCodeAt(t), n >= 48 && n <= 57) {
      t++;
      continue;
    }
    return !1;
  }
  return !0;
}
function re(e) {
  return e.indexOf("/") === -1 && e.indexOf("~") === -1 ? e : e.replace(/~/g, "~0").replace(/\//g, "~1");
}
function $e(e) {
  return e.replace(/~1/g, "/").replace(/~0/g, "~");
}
function _e(e) {
  if (e === void 0)
    return !0;
  if (e) {
    if (Array.isArray(e)) {
      for (var t = 0, r = e.length; t < r; t++)
        if (_e(e[t]))
          return !0;
    } else if (typeof e == "object") {
      for (var n = Se(e), o = n.length, i = 0; i < o; i++)
        if (_e(e[n[i]]))
          return !0;
    }
  }
  return !1;
}
function Le(e, t) {
  var r = [e];
  for (var n in t) {
    var o = typeof t[n] == "object" ? JSON.stringify(t[n], null, 2) : t[n];
    typeof o < "u" && r.push(n + ": " + o);
  }
  return r.join(`
`);
}
var qe = (
  /** @class */
  function(e) {
    Ke(t, e);
    function t(r, n, o, i, c) {
      var d = this.constructor, p = e.call(this, Le(r, { name: n, index: o, operation: i, tree: c })) || this;
      return p.name = n, p.index = o, p.operation = i, p.tree = c, Object.setPrototypeOf(p, d.prototype), p.message = Le(r, { name: n, index: o, operation: i, tree: c }), p;
    }
    return t;
  }(Error)
), M = qe, Ze = Y, se = {
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
    var n = we(r, this.path);
    n && (n = Y(n));
    var o = oe(r, { op: "remove", path: this.from }).removed;
    return oe(r, { op: "add", path: this.path, value: o }), { newDocument: r, removed: n };
  },
  copy: function(e, t, r) {
    var n = we(r, this.from);
    return oe(r, { op: "add", path: this.path, value: Y(n) }), { newDocument: r };
  },
  test: function(e, t, r) {
    return { newDocument: r, test: ae(e[t], this.value) };
  },
  _get: function(e, t, r) {
    return this.value = e[t], { newDocument: r };
  }
}, ke = {
  add: function(e, t, r) {
    return Ne(t) ? e.splice(t, 0, this.value) : e[t] = this.value, { newDocument: r, index: t };
  },
  remove: function(e, t, r) {
    var n = e.splice(t, 1);
    return { newDocument: r, removed: n[0] };
  },
  replace: function(e, t, r) {
    var n = e[t];
    return e[t] = this.value, { newDocument: r, removed: n };
  },
  move: se.move,
  copy: se.copy,
  test: se.test,
  _get: se._get
};
function we(e, t) {
  if (t == "")
    return e;
  var r = { op: "_get", path: t };
  return oe(e, r), r.value;
}
function oe(e, t, r, n, o, i) {
  if (r === void 0 && (r = !1), n === void 0 && (n = !0), o === void 0 && (o = !0), i === void 0 && (i = 0), r && (typeof r == "function" ? r(t, 0, e, t.path) : pe(t, 0)), t.path === "") {
    var c = { newDocument: e };
    if (t.op === "add")
      return c.newDocument = t.value, c;
    if (t.op === "replace")
      return c.newDocument = t.value, c.removed = e, c;
    if (t.op === "move" || t.op === "copy")
      return c.newDocument = we(e, t.from), t.op === "move" && (c.removed = e), c;
    if (t.op === "test") {
      if (c.test = ae(e, t.value), c.test === !1)
        throw new M("Test operation failed", "TEST_OPERATION_FAILED", i, t, e);
      return c.newDocument = e, c;
    } else {
      if (t.op === "remove")
        return c.removed = e, c.newDocument = null, c;
      if (t.op === "_get")
        return t.value = e, c;
      if (r)
        throw new M("Operation `op` property is not one of operations defined in RFC-6902", "OPERATION_OP_INVALID", i, t, e);
      return c;
    }
  } else {
    n || (e = Y(e));
    var d = t.path || "", p = d.split("/"), l = e, a = 1, s = p.length, v = void 0, u = void 0, g = void 0;
    for (typeof r == "function" ? g = r : g = pe; ; ) {
      if (u = p[a], u && u.indexOf("~") != -1 && (u = $e(u)), o && (u == "__proto__" || u == "prototype" && a > 0 && p[a - 1] == "constructor"))
        throw new TypeError("JSON-Patch: modifying `__proto__` or `constructor/prototype` prop is banned for security reasons, if this was on purpose, please set `banPrototypeModifications` flag false and pass it to this function. More info in fast-json-patch README");
      if (r && v === void 0 && (l[u] === void 0 ? v = p.slice(0, a).join("/") : a == s - 1 && (v = t.path), v !== void 0 && g(t, 0, e, v)), a++, Array.isArray(l)) {
        if (u === "-")
          u = l.length;
        else {
          if (r && !Ne(u))
            throw new M("Expected an unsigned base-10 integer value, making the new referenced value the array element with the zero-based index", "OPERATION_PATH_ILLEGAL_ARRAY_INDEX", i, t, e);
          Ne(u) && (u = ~~u);
        }
        if (a >= s) {
          if (r && t.op === "add" && u > l.length)
            throw new M("The specified index MUST NOT be greater than the number of elements in the array", "OPERATION_VALUE_OUT_OF_BOUNDS", i, t, e);
          var c = ke[t.op].call(t, l, u, e);
          if (c.test === !1)
            throw new M("Test operation failed", "TEST_OPERATION_FAILED", i, t, e);
          return c;
        }
      } else if (a >= s) {
        var c = se[t.op].call(t, l, u, e);
        if (c.test === !1)
          throw new M("Test operation failed", "TEST_OPERATION_FAILED", i, t, e);
        return c;
      }
      if (l = l[u], r && a < s && (!l || typeof l != "object"))
        throw new M("Cannot perform operation at the desired path", "OPERATION_PATH_UNRESOLVABLE", i, t, e);
    }
  }
}
function he(e, t, r, n, o) {
  if (n === void 0 && (n = !0), o === void 0 && (o = !0), r && !Array.isArray(t))
    throw new M("Patch sequence must be an array", "SEQUENCE_NOT_AN_ARRAY");
  n || (e = Y(e));
  for (var i = new Array(t.length), c = 0, d = t.length; c < d; c++)
    i[c] = oe(e, t[c], r, !0, o, c), e = i[c].newDocument;
  return i.newDocument = e, i;
}
function Xe(e, t, r) {
  var n = oe(e, t);
  if (n.test === !1)
    throw new M("Test operation failed", "TEST_OPERATION_FAILED", r, t, e);
  return n.newDocument;
}
function pe(e, t, r, n) {
  if (typeof e != "object" || e === null || Array.isArray(e))
    throw new M("Operation is not an object", "OPERATION_NOT_AN_OBJECT", t, e, r);
  if (se[e.op]) {
    if (typeof e.path != "string")
      throw new M("Operation `path` property is not a string", "OPERATION_PATH_INVALID", t, e, r);
    if (e.path.indexOf("/") !== 0 && e.path.length > 0)
      throw new M('Operation `path` property must start with "/"', "OPERATION_PATH_INVALID", t, e, r);
    if ((e.op === "move" || e.op === "copy") && typeof e.from != "string")
      throw new M("Operation `from` property is not present (applicable in `move` and `copy` operations)", "OPERATION_FROM_REQUIRED", t, e, r);
    if ((e.op === "add" || e.op === "replace" || e.op === "test") && e.value === void 0)
      throw new M("Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)", "OPERATION_VALUE_REQUIRED", t, e, r);
    if ((e.op === "add" || e.op === "replace" || e.op === "test") && _e(e.value))
      throw new M("Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)", "OPERATION_VALUE_CANNOT_CONTAIN_UNDEFINED", t, e, r);
    if (r) {
      if (e.op == "add") {
        var o = e.path.split("/").length, i = n.split("/").length;
        if (o !== i + 1 && o !== i)
          throw new M("Cannot perform an `add` operation at the desired path", "OPERATION_PATH_CANNOT_ADD", t, e, r);
      } else if (e.op === "replace" || e.op === "remove" || e.op === "_get") {
        if (e.path !== n)
          throw new M("Cannot perform the operation at a path that does not exist", "OPERATION_PATH_UNRESOLVABLE", t, e, r);
      } else if (e.op === "move" || e.op === "copy") {
        var c = { op: "_get", path: e.from, value: void 0 }, d = Ge([c], r);
        if (d && d.name === "OPERATION_PATH_UNRESOLVABLE")
          throw new M("Cannot perform the operation from a path that does not exist", "OPERATION_FROM_UNRESOLVABLE", t, e, r);
      }
    }
  } else throw new M("Operation `op` property is not one of operations defined in RFC-6902", "OPERATION_OP_INVALID", t, e, r);
}
function Ge(e, t, r) {
  try {
    if (!Array.isArray(e))
      throw new M("Patch sequence must be an array", "SEQUENCE_NOT_AN_ARRAY");
    if (t)
      he(Y(t), Y(e), r || !0);
    else {
      r = r || pe;
      for (var n = 0; n < e.length; n++)
        r(e[n], n, t, void 0);
    }
  } catch (o) {
    if (o instanceof M)
      return o;
    throw o;
  }
}
function ae(e, t) {
  if (e === t)
    return !0;
  if (e && t && typeof e == "object" && typeof t == "object") {
    var r = Array.isArray(e), n = Array.isArray(t), o, i, c;
    if (r && n) {
      if (i = e.length, i != t.length)
        return !1;
      for (o = i; o-- !== 0; )
        if (!ae(e[o], t[o]))
          return !1;
      return !0;
    }
    if (r != n)
      return !1;
    var d = Object.keys(e);
    if (i = d.length, i !== Object.keys(t).length)
      return !1;
    for (o = i; o-- !== 0; )
      if (!t.hasOwnProperty(d[o]))
        return !1;
    for (o = i; o-- !== 0; )
      if (c = d[o], !ae(e[c], t[c]))
        return !1;
    return !0;
  }
  return e !== e && t !== t;
}
const Ve = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  JsonPatchError: M,
  _areEquals: ae,
  applyOperation: oe,
  applyPatch: he,
  applyReducer: Xe,
  deepClone: Ze,
  getValueByPointer: we,
  validate: Ge,
  validator: pe
}, Symbol.toStringTag, { value: "Module" }));
/*!
 * https://github.com/Starcounter-Jack/JSON-Patch
 * (c) 2017-2021 Joachim Wester
 * MIT license
 */
var Pe = /* @__PURE__ */ new WeakMap(), et = (
  /** @class */
  /* @__PURE__ */ function() {
    function e(t) {
      this.observers = /* @__PURE__ */ new Map(), this.obj = t;
    }
    return e;
  }()
), tt = (
  /** @class */
  /* @__PURE__ */ function() {
    function e(t, r) {
      this.callback = t, this.observer = r;
    }
    return e;
  }()
);
function nt(e) {
  return Pe.get(e);
}
function rt(e, t) {
  return e.observers.get(t);
}
function ot(e, t) {
  e.observers.delete(t.callback);
}
function it(e, t) {
  t.unobserve();
}
function st(e, t) {
  var r = [], n, o = nt(e);
  if (!o)
    o = new et(e), Pe.set(e, o);
  else {
    var i = rt(o, t);
    n = i && i.observer;
  }
  if (n)
    return n;
  if (n = {}, o.value = Y(e), t) {
    n.callback = t, n.next = null;
    var c = function() {
      Re(n);
    }, d = function() {
      clearTimeout(n.next), n.next = setTimeout(c);
    };
    typeof window < "u" && (window.addEventListener("mouseup", d), window.addEventListener("keyup", d), window.addEventListener("mousedown", d), window.addEventListener("keydown", d), window.addEventListener("change", d));
  }
  return n.patches = r, n.object = e, n.unobserve = function() {
    Re(n), clearTimeout(n.next), ot(o, n), typeof window < "u" && (window.removeEventListener("mouseup", d), window.removeEventListener("keyup", d), window.removeEventListener("mousedown", d), window.removeEventListener("keydown", d), window.removeEventListener("change", d));
  }, o.observers.set(t, new tt(t, n)), n;
}
function Re(e, t) {
  t === void 0 && (t = !1);
  var r = Pe.get(e.object);
  Ce(r.value, e.object, e.patches, "", t), e.patches.length && he(r.value, e.patches);
  var n = e.patches;
  return n.length > 0 && (e.patches = [], e.callback && e.callback(n)), n;
}
function Ce(e, t, r, n, o) {
  if (t !== e) {
    typeof t.toJSON == "function" && (t = t.toJSON());
    for (var i = Se(t), c = Se(e), d = !1, p = c.length - 1; p >= 0; p--) {
      var l = c[p], a = e[l];
      if (Ie(t, l) && !(t[l] === void 0 && a !== void 0 && Array.isArray(t) === !1)) {
        var s = t[l];
        typeof a == "object" && a != null && typeof s == "object" && s != null && Array.isArray(a) === Array.isArray(s) ? Ce(a, s, r, n + "/" + re(l), o) : a !== s && (o && r.push({ op: "test", path: n + "/" + re(l), value: Y(a) }), r.push({ op: "replace", path: n + "/" + re(l), value: Y(s) }));
      } else Array.isArray(e) === Array.isArray(t) ? (o && r.push({ op: "test", path: n + "/" + re(l), value: Y(a) }), r.push({ op: "remove", path: n + "/" + re(l) }), d = !0) : (o && r.push({ op: "test", path: n, value: e }), r.push({ op: "replace", path: n, value: t }));
    }
    if (!(!d && i.length == c.length))
      for (var p = 0; p < i.length; p++) {
        var l = i[p];
        !Ie(e, l) && t[l] !== void 0 && r.push({ op: "add", path: n + "/" + re(l), value: Y(t[l]) });
      }
  }
}
function at(e, t, r) {
  r === void 0 && (r = !1);
  var n = [];
  return Ce(e, t, n, "", r), n;
}
const ct = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  compare: at,
  generate: Re,
  observe: st,
  unobserve: it
}, Symbol.toStringTag, { value: "Module" }));
Object.assign({}, Ve, ct, {
  JsonPatchError: qe,
  deepClone: Y,
  escapePathComponent: re,
  unescapePathComponent: $e
});
const ft = "https://auth.knowlearning.systems", ut = `-----BEGIN PUBLIC KEY-----
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
async function lt(e = "google", t) {
  const r = Math.random().toString(36).substring(2);
  if (window.localStorage.setItem(r, window.location.href), e === "code") {
    const n = { code: t, provider: e, domain: window.location.host }, o = await pt(ut, JSON.stringify(n));
    window.location.href = `/auth/${r}/${o}`;
  } else {
    const n = encodeURIComponent(window.location.href);
    window.location.href = `${ft}/${e}/${r}/${n}`;
  }
}
function dt() {
  window.localStorage.setItem("token", Math.random().toString(36).substring(2)), window.location.reload();
}
async function wt() {
  const e = localStorage.getItem("token");
  return window.localStorage.removeItem("token"), e;
}
async function pt(e, t) {
  const r = await crypto.subtle.importKey(
    "spki",
    ht(e),
    { name: "RSA-OAEP", hash: "SHA-256" },
    !0,
    ["encrypt"]
  ), n = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    !0,
    ["encrypt", "decrypt"]
  ), o = new TextEncoder().encode(t), i = crypto.getRandomValues(new Uint8Array(12)), c = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: i },
    n,
    o
  ), d = await crypto.subtle.exportKey("raw", n), p = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    r,
    d
  );
  return [
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(i)))),
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(c)))),
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(p))))
  ].join(",");
}
function ht(e) {
  const t = e.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), r = atob(t), n = new Uint8Array(r.length);
  for (let o = 0; o < r.length; o++)
    n[o] = r.charCodeAt(o);
  return n.buffer;
}
function vt(e) {
  return e.map((t) => {
    const r = { ...t, path: "/" + t.path.map(Ue).join("/") };
    return t.from && (r.from = "/" + t.from.map(Ue).join("/")), r;
  });
}
function Ue(e) {
  return typeof e == "string" ? e.replaceAll("~", "~0").replaceAll("/", "~1") : e;
}
const ge = /* @__PURE__ */ new Set(), ue = /* @__PURE__ */ new Map();
function le(e) {
  return `/${e.join("/")}`;
}
function Me(e) {
  return JSON.parse(JSON.stringify(e));
}
function yt(e, [t, r]) {
  return Math.max(Math.min(parseInt(e), r), t);
}
function ce(e, t, r = {}, n = [], o) {
  if (r[le(n)]) return e;
  if (ge.has(e))
    throw new Error(`Cannot add mutable state to multiple mutable parents. Attempted Path: ${le(n)}`);
  const i = Array.isArray(e), c = (a, s) => ce(
    s,
    t,
    r,
    [...n, a]
  ), d = {
    copyWithin() {
      throw new Error('"copyWithin" not implemented.');
    },
    sort(a) {
      const s = /* @__PURE__ */ new Map();
      e.forEach((u, g) => {
        s.has(u) || s.set(u, []), s.get(u).push(g);
      }), e.sort(a);
      let v = e.map((u) => s.get(u).shift());
      return t(
        e.map((u, g) => {
          const h = ue.get(u);
          h && (h[h.length - 1] = g);
          const N = v[g];
          return v = v.map((O) => O < N ? O + 1 : O), {
            op: "move",
            from: [...n, N],
            path: [...n, g]
          };
        })
      ), l;
    },
    reverse() {
      const a = [];
      return e.forEach((s, v) => {
        a.push({
          op: "move",
          from: [...n, v],
          path: [...n, 0]
        });
        const u = ue.get(s);
        u && (u[u.length - 1] = e.length - 1 - v);
      }), e.reverse(), t(a), l;
    },
    shift() {
      return d.splice(0, 1)[0];
    },
    unshift() {
      return d.splice(0, 0, ...arguments), e.length;
    },
    splice(a, s, ...v) {
      const u = e.length - a;
      if (arguments.length === 0) return;
      arguments.length === 1 || arguments[1] === 1 / 0 ? s = u : s = yt(s, [0, u]) || 0;
      const g = [...n, a], h = Array.from(
        { length: s },
        () => ({ op: "remove", path: g })
      );
      v.forEach((m, A) => {
        h.push({
          op: "add",
          path: [...n, a + A],
          value: Me(m)
        });
      });
      const N = v.length - s;
      N !== 0 && e.slice(a + s).forEach((m) => {
        const A = ue.get(m);
        A && (A[A.length - 1] = A[A.length - 1] + N);
      });
      const O = v.map(
        (m, A) => m instanceof Object ? c(A + a, m) : m
      ), I = e.splice(a, s, ...O);
      return t(h), I;
    }
  };
  Object.entries(e).filter(([, a]) => a instanceof Object).forEach(([a, s]) => {
    i && /^\d+$/.test(a) && (a = parseInt(a)), e[a] = c(a, s);
  });
  const p = {
    set(a, s, v) {
      if (i)
        if (/^\d+$/.test(s))
          s = parseInt(s);
        else return a[s] = v, !0;
      const u = [...n, s], g = le(u);
      if (r[g])
        return a[s] = v, !0;
      if (v === void 0)
        throw new Error(`Setting properties to undefined is not supported. Please use a delete statement. Attempted to set ${g}`);
      return t([{
        op: a[s] === void 0 ? "add" : "replace",
        value: Me(v),
        //  TODO: more efficient sanitization
        path: u
      }]), v instanceof Object ? a[s] = c(s, v) : a[s] = v, !0;
    },
    deleteProperty(a, s) {
      if (s in a) {
        if (ge.delete(l), delete a[s], i)
          if (/^\d+$/.test(s)) s = parseInt(s);
          else return !0;
        const v = [...n, s];
        r[le(v)] || t([{ op: "remove", path: v }]);
      }
      return !0;
    },
    get(a, s, v) {
      return i && d[s] ? d[s] : a[s];
    }
  }, l = new Proxy(e, p);
  return ge.add(l), ue.set(l, n), l;
}
const mt = 1e4, Et = { open: !0, mutate: !0, close: !0 };
function At(e) {
  return structuredClone(e).filter(({ path: t }) => t.shift() === "active");
}
function gt({ token: e, sid: t, domain: r, Connection: n, watchers: o, states: i, applyPatch: c, log: d, login: p, reboot: l, handleDomainMessage: a, trigger: s, variables: v = {} }) {
  let u, g, h = !1, N, O, I = -1, m = 0;
  const A = [];
  let R = -1, _, L = null, q = null, G = !1, V = !1;
  const K = [], W = {};
  let te;
  const ee = new Promise((w) => te = w), f = {
    loaded: Date.now(),
    connected: null,
    authenticated: null
  };
  async function E() {
    return { variables: v, ...await ee, context: [] };
  }
  function S({ scope: w, patch: y }) {
    if (L === w) {
      const T = A.length - 1;
      A[T].patch = [...A[T].patch, ...y];
    } else
      I += 1, q = new Promise((T, C) => W[I] = [[T, C]]), A.push({ scope: w, patch: y, si: I, ts: Date.now() }), L = w, P();
    return q;
  }
  async function P() {
    for (await new Promise((w) => w()), L = null; h && R + 1 < A.length; ) {
      L = null;
      try {
        u.send(A[R + 1]), R += 1, await new Promise((w) => w());
      } catch (w) {
        console.warn("ERROR SENDING OVER CONNECTION", w), b();
        break;
      }
    }
  }
  function x() {
    const w = Object.keys(W).map(parseInt).sort()[0] || 1 / 0;
    for (; K[0] && K[0].si < w; )
      K.shift().resolve();
  }
  function J() {
    clearTimeout(_), _ = setTimeout(
      () => {
        d("CLOSING DUE TO HEARTBEAT TIMEOUT"), b();
      },
      mt
    );
  }
  async function b() {
    G || (h = !1, u.onmessage = () => {
    }, V || (await new Promise((w) => setTimeout(w, Math.min(1e3, m * 100))), G = !0, m += 1, B(), G = !1));
  }
  function B() {
    u = new n(), u.onopen = async () => {
      f.connected || (f.connected = Date.now()), d("AUTHORIZING NEWLY OPENED CONNECTION FOR SESSION:", N), m = 0, u.send({ token: await e(), sid: await (t == null ? void 0 : t()), session: N, domain: r });
    }, u.onmessage = async (w) => {
      if (J(), !!w)
        try {
          if (w.error && console.warn("ERROR RESPONSE", w), h)
            if (Et[w.type])
              try {
                a && a(w, s);
              } catch {
                d("ERROR HANDLING DOMAIN MESSAGE", w);
              }
            else if (w.si !== void 0)
              W[w.si] ? (W[w.si].forEach(([y, T]) => w.error ? T(w) : y(w)), delete W[w.si], u.send({ ack: w.si }), x()) : console.warn("received MULTIPLE responses for message with si", w.si, w);
            else {
              const y = w.domain === r ? "" : w.domain, T = w.user === g ? "" : w.user, C = w.scope, D = Q(C) ? C : `${y}/${T}/${C}`;
              if (o[D]) {
                if (i[D] = await i[D], i[D].ii + 1 !== w.ii)
                  return;
                i[D].ii = w.ii;
                const $ = w.patch.findLastIndex((F) => F.path.length === 0);
                $ > -1 && (i[D] = w.patch[$].value), i[D].active === void 0 && (i[D].active = {}), c(i[D], vt(w.patch.slice($ + 1))), o[D].forEach((F) => {
                  const k = structuredClone(i[D].active);
                  F({ ...w, patch: At(w.patch), state: k });
                });
              }
            }
          else {
            if (w.error) return p();
            h = !0, g ? O !== w.server ? (console.warn(`REBOOTING DUE TO SERVER SWITCH ${O} -> ${w.server}`, w), l()) : R = w.ack : (console.log("INIT MESSAGE", w), f.authenticated = Date.now(), g = w.auth.user, N = w.session, O = w.server, te(w)), P();
          }
        } catch (y) {
          console.error("ERROR HANDLING CONNECTION MESSAGE", y, w);
        }
    }, u.onerror = async (w) => {
      d("CONNECTION ERROR", w.message);
    }, u.onclose = async (w) => {
      d("CONNECTION CLOSURE", w.message), b();
    }, J();
  }
  async function H() {
    const w = new Promise((y) => K.push({ si: R, resolve: y }));
    return x(), w;
  }
  function z() {
    return new Promise((w, y) => W[I].push([w, y]));
  }
  function Z() {
    d("DISCONNECTED AGENT!!!!!!!!!!!!!!!"), V = !0, u.close({ keepalive: !0 });
  }
  function X() {
    d("RECONNECTED AGENT!!!!!!!!!!!!!!!"), V = !1, b();
  }
  return B(), [S, z, Z, X, H, E];
}
function Ot(e = "[]", t, r, { keyToSubscriptionId: n, watchers: o, states: i, create: c, environment: d, lastMessageResponse: p, lastInteractionResponse: l, tagIfNotYetTaggedInSession: a, interact: s, log: v }) {
  let u, g = new Promise((N) => u = N);
  const h = new Promise(async (N, O) => {
    const { auth: { user: I }, domain: m, session: A } = await d(), R = Q(e) ? e : `${!r || r === m ? "" : r}/${!t || t === I ? "" : t}/${e}`;
    if (!n[R]) {
      const _ = Qe();
      n[R] = _, o[R] = [], i[R] = new Promise(async (L, q) => {
        await new Promise((G) => setTimeout(G)), s("sessions", [{
          op: "add",
          path: ["active", A, "subscriptions", _],
          value: { scope: e, user: t, domain: r, ii: null }
        }], !1, !1);
        try {
          L(await p());
        } catch (G) {
          q(G);
        }
      });
    }
    await l[R];
    try {
      const _ = structuredClone(await i[R]), L = _.active;
      delete _.active, u(_), N(new ce(L || {}, (q) => {
        const G = structuredClone(q);
        G.forEach((V) => V.path.unshift("active")), s(e, G);
      }));
    } catch (_) {
      O(_);
    }
  });
  return h.metadata = g, h;
}
const Tt = "[]";
function Je({ metadata: e, environment: t, state: r, watchers: n, synced: o, sentUpdates: i }) {
  function c(l = Tt, a, s, v) {
    if (Array.isArray(l)) return d(l, a, s, v);
    const u = r(l, s, v);
    let g, h = !1;
    return e(l, s, v).then(async ({ ii: N }) => {
      const { auth: { user: O }, domain: I } = await t(), m = await u;
      h || (g = Q(l) ? l : `${!v || v === I ? "" : v}/${!s || s === O ? "" : s}/${l}`, a({ scope: l, user: s, domain: v, state: m, patch: null, ii: N }), i && (i[g] = N), !h && (n[g] || (n[g] = []), n[g].push(a)));
    }), () => {
      h = !0, g && p(g, a);
    };
  }
  function d(l, a, s, v) {
    const u = l[0], g = l.slice(1);
    let h = () => {
    };
    const O = c(u, ({ state: I }) => {
      if (g.length === 0) {
        a(I);
        return;
      }
      h();
      let m = I;
      for (let A = 0; A < g.length; A += 1)
        if (m = m[g[A]], m == null || A === g.length - 1) a(m);
        else if (Q(m)) {
          h = d([m, ...g.slice(A + 1)], a, s, v);
          return;
        }
    }, s, v);
    return () => {
      O(), h();
    };
  }
  function p(l, a) {
    if (!n[l]) {
      console.warn("NO WATCHERS FOR KEY", l, a);
      return;
    }
    const s = n[l].findIndex((v) => v === a);
    s > -1 && n[l].splice(s, 1);
  }
  return [c, p];
}
const It = "application/json;type=download";
function He(e, { create: t, lastMessageResponse: r, fetch: n, metadata: o }) {
  t({
    active_type: It,
    active: { id: e }
  });
  let i = "fetch";
  const c = new Promise(async (d, p) => {
    const { url: l } = await r();
    if (await new Promise((a) => setTimeout(a)), i === "url") d(l);
    else if (i === "fetch") {
      const a = await n(l), { ok: s, statusText: v } = a;
      s ? d(a) : p(v);
    } else if (i === "direct") {
      const a = await He(e, { create: t, lastMessageResponse: r, fetch: n, metadata: o }), { name: s } = await o(e), v = a.headers.get("Content-Type"), u = new Blob([await a.blob()], { type: v }), g = window.URL.createObjectURL(u), h = document.createElement("a");
      h.style.display = "none", h.href = g, h.download = s, document.body.appendChild(h), h.click(), window.URL.revokeObjectURL(g), d();
    }
  });
  return c.direct = () => (i = "direct", c), c.url = () => (i = "url", c), c;
}
const Oe = "[]", St = "application/json;type=upload", Nt = "application/json;type=tag", _t = "application/json;type=domain-claim";
function Rt({ Connection: e, domain: t, token: r, sid: n, uuid: o, fetch: i, applyPatch: c, login: d, logout: p, reboot: l, handleDomainMessage: a, log: s = console.log, variables: v = {} }) {
  const u = {}, g = {}, h = {}, N = {}, O = {};
  ee("INITIALIZING AGENT CONNECTION");
  const [
    I,
    m,
    A,
    R,
    _,
    L
  ] = gt({ token: r, sid: n, domain: t, Connection: e, watchers: g, states: u, applyPatch: c, log: ee, login: d, interact: P, reboot: l, trigger: w, handleDomainMessage: a, variables: v });
  L().then(({ session: y }) => {
    P("sessions", [{ op: "add", path: ["active", y], value: { queries: {}, subscriptions: {} } }], !1, !1);
  });
  const q = {
    keyToSubscriptionId: h,
    watchers: g,
    states: u,
    state: K,
    create: f,
    environment: L,
    lastInteractionResponse: N,
    lastMessageResponse: m,
    tagIfNotYetTaggedInSession: E,
    interact: P,
    fetch: i,
    synced: _,
    metadata: B,
    log: ee
  }, [G, V] = Je(q);
  function K(y, T, C) {
    return Ot(y, T, C, q);
  }
  function W(y) {
    return He(y, q);
  }
  function te() {
  }
  function ee() {
    s(...arguments);
  }
  function f({ id: y = o(), active_type: T, active: C, name: D }) {
    T || (T = "application/json");
    const $ = [
      { op: "add", path: ["active_type"], value: T },
      { op: "add", path: ["active"], value: C }
    ];
    return D && $.push({ op: "add", path: ["name"], value: D }), P(y, $, !1), y;
  }
  async function E(y, T) {
    const C = O[y];
    C && C[T] || (C || (O[y] = {}), !O[y][T] && (O[y][T] = !0, Q(T) || (T = (await B(T)).id), await z(y, T)));
  }
  async function S(y) {
    const { name: T, type: C, data: D, id: $ = o() } = y || {};
    f({
      active_type: St,
      active: { id: $, type: C, name: T },
      name: T
    });
    const { url: F } = await m();
    if (D === void 0) return F;
    {
      const ne = await i(F, { method: "PUT", headers: { "Content-Type": C }, body: D }), { ok: ve, statusText: Fe } = ne;
      if (ve) return $;
      throw new Error(Fe);
    }
  }
  async function P(y = Oe, T, C = !0, D = !0) {
    C && E("mutated", y);
    const $ = I({ scope: y, patch: T }), F = Q(y) ? y : `//${y}`;
    if (D && u[F] !== void 0)
      return N[F] = $.then((k) => k.ii), $;
    {
      const { ii: k } = await $;
      return { ii: k };
    }
  }
  async function x(y) {
    const T = o();
    return f({
      id: T,
      active_type: _t,
      active: { domain: y }
    }), m();
  }
  function J(y = Oe) {
    return P(y, [{ op: "remove", path: ["active"] }]);
  }
  function b({ path: y, op: T, value: C }) {
    return ["active_type", "name"].includes(y[0]) && y.length === 1 && typeof C == "string" || T === "remove";
  }
  async function B(y = Oe, T, C) {
    const D = structuredClone(await K(y, T).metadata);
    return delete D.active, new ce(D, ($) => {
      const F = structuredClone($);
      if (!F.every(b))
        throw new Error("You may only modify the type or name for a scope's metadata");
      P(y, F);
    });
  }
  async function H(y, T, C, D = []) {
    const $ = o(), F = Date.now(), { session: k } = await L();
    await new Promise((ne) => setTimeout(ne)), P("sessions", [
      {
        op: "add",
        path: ["active", k, "queries", $],
        value: { query: y, params: T, domain: C, context: D }
      }
    ], !1, !1);
    try {
      const ne = await m(), { rows: ve } = ne;
      return P("sessions", [
        {
          op: "add",
          path: ["active", k, "queries", $, "agent_latency"],
          value: Date.now() - F
        },
        {
          op: "remove",
          path: ["active", k, "queries", $]
        }
      ], !1, !1), ve;
    } catch (ne) {
      throw ne;
    }
  }
  function z(y, T, C = []) {
    return f({
      active_type: Nt,
      active: { tag_type: y, target: T, context: C }
    });
  }
  const Z = { child: [] };
  function X(y, T) {
    if (!Z[y]) throw new Error('Agent can only listen to events of "child"');
    Z[y].push(T);
  }
  function w(y, T) {
    Z[y].forEach((C) => C(T));
  }
  return {
    uuid: o,
    environment: L,
    login: d,
    logout: p,
    log: ee,
    create: f,
    state: K,
    watch: G,
    upload: S,
    download: W,
    interact: P,
    claim: x,
    reset: J,
    metadata: B,
    query: H,
    synced: _,
    disconnect: A,
    reconnect: R,
    tag: z,
    debug: te,
    on: X
  };
}
const Pt = [...navigator.languages], je = localStorage.getItem("API_HOST") || "api.knowlearning.systems";
async function Ct() {
  const e = await fetch(`https://${je}/_sid-check`, { method: "GET", credentials: "include" }), t = !!localStorage.getItem("sid");
  if (e.status === 201) {
    if (!t) {
      const r = await e.text();
      localStorage.setItem("sid", r), location.reload();
    }
  } else e.status === 200 ? t && (localStorage.removeItem("sid"), location.reload()) : console.warn("Issue Connecting To the API Server");
}
const Dt = (e) => {
  Ct();
  const t = function() {
    const n = new WebSocket(`wss://${je}`);
    return this.send = (o) => n.send(JSON.stringify(o)), this.close = (o) => {
      this.send({ type: "close", info: o }), n.close();
    }, n.onopen = () => this.onopen(), n.onmessage = ({ data: o }) => this.onmessage(o.length === 0 ? null : JSON.parse(o)), n.onerror = (o) => this.onerror && this.onerror(o), n.onclose = (o) => this.onclose && this.onclose(o), this;
  }, r = Rt({
    token: e.getToken || wt,
    sid: () => localStorage.getItem("sid"),
    domain: window.location.host,
    Connection: t,
    uuid: ie,
    fetch,
    applyPatch: he,
    login: lt,
    logout: dt,
    variables: { LANGUAGES: Pt },
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
function Lt() {
  let e = 0, t;
  const r = new Promise((f) => t = f), n = {}, o = {}, i = {}, [c, d] = Je({ metadata: _, state: N, watchers: o, synced: te, sentUpdates: i, environment: s });
  async function p(f) {
    const E = f.requestId || ie();
    e += 1;
    const S = window.opener ? window.opener : window.parent;
    try {
      return S.postMessage({
        ...f,
        session: await r,
        requestId: E,
        index: e
      }, "*"), new Promise((P, x) => {
        n[E] = { resolve: P, reject: x };
      });
    } catch (P) {
      console.log("ERROR POSTING MESSAGE UP", f, P);
    }
  }
  let l = !1;
  addEventListener("message", async ({ data: f }) => {
    if (f.type === "setup" && !l)
      l = !0, t(f.session);
    else {
      if (!l || f.session !== await r) return;
      if (n[f.requestId]) {
        const { resolve: E, reject: S } = n[f.requestId];
        f.error ? S(f.error) : E(f.response);
      } else if (f.ii !== void 0) {
        const { scope: E, user: S, domain: P } = f, { auth: x, domain: J } = await s(), b = !P || P === J ? "" : P, B = !S || x.user === S ? "" : S, H = Q(E) ? E : `${b}/${B}/${E}`, z = () => {
          i[H] = f.ii, o[H].forEach((Z) => Z(f));
        };
        o[H] && (i[H] === void 0 || i[H] + 1 === f.ii ? z() : f.ii === i[H] || f.ii < i[H] || z());
      }
    }
  });
  let a;
  async function s(f) {
    const E = await p({ type: "environment", user: f });
    return a || (a = E.variables), { ...E, variables: a };
  }
  function v({ id: f = ie(), active_type: E, active: S }) {
    return E || (E = "application/json"), I(f, [
      { op: "add", path: ["active_type"], value: E },
      { op: "add", path: ["active"], value: S }
    ]), f;
  }
  const u = {};
  async function g(f, E) {
    const S = u[f];
    S && S[E] || (Q(E) || (E = (await _(E)).id), u[f] || (u[f] = {}), !u[f][E] && (u[f][E] = !0, await L(f, E)));
  }
  async function h(f, E) {
    return p({ type: "patch", root: f, scopes: E });
  }
  async function N(f, E, S) {
    if (f === void 0) {
      const { context: x } = await s();
      f = JSON.stringify(x);
    }
    g("subscribed", f);
    const P = await p({ type: "state", scope: f, user: E, domain: S });
    return new ce(P, (x) => {
      const J = structuredClone(x);
      J.forEach((b) => b.path.unshift("active")), I(f, J);
    });
  }
  function O(f) {
    return I(f, [{ op: "add", path: ["active"], value: null }]);
  }
  function I(f, E, S = !0) {
    return S && g("mutated", f), p({ type: "interact", scope: f, patch: E });
  }
  async function m(f) {
    let { name: E, type: S, data: P, id: x = ie() } = f || {};
    const J = await p({ type: "upload", info: { name: E, type: S, id: x } });
    if (P === void 0) return J;
    {
      const B = await fetch(J, { method: "PUT", headers: { "Content-Type": S }, body: P }), { ok: H, statusText: z } = B;
      if (H) return x;
      throw new Error(z);
    }
  }
  function A(f) {
    let E = "fetch";
    const S = new Promise(async (P, x) => {
      const J = await p({ type: "download", id: f });
      if (await new Promise((b) => setTimeout(b)), E === "url") P(J);
      else if (E === "fetch") {
        const b = await fetch(J), { ok: B, statusText: H } = b;
        B ? P(b) : x(H);
      } else if (E === "direct") {
        const b = await A(f), { name: B } = await _(f), H = b.headers.get("Content-Type"), z = new Blob([await b.blob()], { type: H }), Z = window.URL.createObjectURL(z), X = document.createElement("a");
        X.style.display = "none", X.href = Z, X.download = B, document.body.appendChild(X), X.click(), window.URL.revokeObjectURL(Z), P();
      }
    });
    return S.direct = () => (E = "direct", S), S.url = () => (E = "url", S), S;
  }
  function R({ path: f, op: E, value: S }) {
    return ["active_type", "name"].includes(f[0]) && f.length === 1 && typeof S == "string" || E === "remove";
  }
  async function _(f, E, S) {
    const P = await p({ type: "metadata", scope: f, user: E, domain: S });
    return new ce(P, (x) => {
      const J = structuredClone(x);
      J.forEach((b) => {
        if (!R(b)) throw new Error("You may only modify the type or name for a scope's metadata");
      }), I(f, J);
    });
  }
  function L(f, E, S = []) {
    return p({ type: "tag", tag_type: f, target: E, context: S });
  }
  function q(f, E, S) {
    return p({ type: "login", provider: f, username: E, password: S });
  }
  function G(f, E, S, P = []) {
    return p({ type: "query", query: f, params: E, domain: S, context: P });
  }
  function V() {
    return p({ type: "logout" });
  }
  function K() {
    return p({ type: "disconnect" });
  }
  function W() {
    return p({ type: "reconnect" });
  }
  function te() {
    return p({ type: "synced" });
  }
  function ee(f) {
    return p({ type: "close", info: f });
  }
  return {
    embedded: !0,
    uuid: ie,
    environment: s,
    login: q,
    logout: V,
    create: v,
    state: N,
    watch: c,
    upload: m,
    download: A,
    interact: I,
    patch: h,
    reset: O,
    metadata: _,
    disconnect: K,
    reconnect: W,
    synced: te,
    close: ee,
    query: G,
    tag: L
  };
}
async function Ut({ accept: e }) {
  return new Promise((t, r) => {
    const n = document.createElement("input");
    n.type = "file", n.accept = e, n.addEventListener("change", async (o) => {
      const i = o.target.files[0];
      t(i || null);
    }), n.click();
  });
}
let U = window.__default_knowlearning_agent;
function Te(e, t) {
  const r = (e == null ? void 0 : e.allow) || [], n = typeof e == "string" ? e : e == null ? void 0 : e.prefix;
  return n && !Q(t) && !r.some((o) => t.startsWith(o)) ? `${n}/${t}` : t;
}
function Be(e = {}) {
  if (U && !e.unique) return U;
  let t;
  try {
    t = window.self !== window.top;
  } catch {
    t = !0;
  }
  const r = t && !e.root ? Lt() : Dt(e);
  r.embed = Mt;
  const n = r.upload;
  return r.upload = async (o) => {
    if (o != null && o.browser) {
      const i = await Ut(o);
      if (!i || o.validate && !await o.validate(i)) return;
      o.data = await i.arrayBuffer(), o.name || (o.name = i.name), o.type || (o.type = i.type);
    }
    return n(o);
  }, U || (window.__default_knowlearning_agent = U = r), r;
}
const de = (e) => JSON.parse(JSON.stringify(e));
function Mt(e, t) {
  const r = {}, n = [], o = {};
  let i = !1, c = !1;
  const d = ie(), p = (h) => new Promise((N, O) => {
    const I = { ...de(h), session: d };
    n.push({ message: I, sent: N }), i && l();
  }), l = () => {
    for (; t.parentNode && n.length; ) {
      const { message: h, sent: N } = n.shift();
      t.contentWindow.postMessage(h, "*"), N();
    }
  }, a = async (h) => {
    const { requestId: N, type: O } = h, I = (m, A) => p({ requestId: N, response: m, error: A });
    if (O === "error")
      console.error(h), I({});
    else if (O === "close")
      o.close && o.close(h.info);
    else if (O === "environment") {
      const { user: m } = h, { mode: A, variables: R = {} } = e, _ = await (o.environment ? o.environment(m) : U.environment(m));
      I({
        ..._,
        context: [
          ..._.context || [],
          e.id
        ],
        variables: {
          ..._.variables || {},
          ...R
        },
        mode: A
        //  TODO: deprecate
      });
    } else if (O === "interact") {
      let { scope: m, patch: A } = h;
      const R = Te(e.namespace, m);
      let _, L;
      if (o.mutate && (_ = de(await U.state(R))), await U.interact(R, A, !1), o.mutate && (L = de(await U.state(R))), o.mutate) {
        const q = de(A);
        q.forEach((G) => G.path.shift()), o.mutate({
          scope: R,
          before: _,
          after: L,
          patch: q
        });
      }
      I({});
    } else if (O === "metadata") {
      const { scope: m, user: A, domain: R } = h, _ = Te(e.namespace, m);
      I(await U.metadata(_, A, R));
    } else if (O === "tag") {
      const { tag_type: m, target: A, context: R } = h, _ = [e.id, ...R];
      I(await U.tag(m, A, _));
    } else if (O === "state") {
      const { scope: m, user: A, domain: R } = h, _ = Te(e.namespace, m), L = U.state(_, A, R), q = `${R || ""}/${A || ""}/${_}`;
      r[q] || (r[q] = U.watch(_, (G) => p({ ...G, scope: m }), A, R)), o.state && o.state({ scope: m }), I(await L);
    } else if (O === "patch") {
      const { root: m, scopes: A } = h;
      I(await U.patch(m, A));
    } else if (O === "query") {
      const { query: m, params: A, domain: R, context: _ = [] } = h;
      U.query(m, A, R, [e.id, ..._]).then(I).catch((L) => I(null, L.error));
    } else if (O === "upload") {
      const { info: m } = h;
      I(await U.upload(m));
    } else if (O === "download")
      I(await U.download(h.id).url());
    else if (O === "login") {
      const { provider: m, username: A, password: R } = h;
      I(await U.login(m, A, R));
    } else O === "logout" ? U.logout() : O === "disconnect" ? I(await U.disconnect()) : O === "reconnect" ? I(await U.reconnect()) : O === "synced" ? I(await U.synced()) : (console.log("Unknown message type passed up...", h), I({}));
  };
  window.addEventListener("message", ({ data: h }) => {
    h.session === d && (c = !0, a(h));
  }), t.onload = () => {
    i = !0, l();
  }, s();
  async function s() {
    Be();
    const { protocol: h } = window.location, { id: N } = e;
    if (Q(N)) {
      const { domain: O } = await U.metadata(N);
      t.src = `${h}//${O}/${N}`;
    } else t.src = N;
    for (; !c; )
      p({ type: "setup", session: d }), await new Promise((O) => setTimeout(O, 100));
    o.open && o.open();
  }
  function v() {
    t.parentNode && t.parentNode.removeChild(t);
  }
  function u(h, N) {
    o[h] = N;
  }
  function g(h, N) {
    p({ type: "auth", token: h, state: N });
  }
  return {
    auth: g,
    remove: v,
    on: u
  };
}
window.Agent = Be();
