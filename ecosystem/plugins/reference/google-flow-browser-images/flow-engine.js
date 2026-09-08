(() => {
  "use strict";
  const w = window;

  if (w.chrome && w.chrome.runtime && typeof w.chrome.runtime.sendMessage === "function") return;

  let meta = {};
  try {
    meta = JSON.parse(document.documentElement.dataset.faRelay || "{}");
  } catch (_) {}

  let seq = 0;
  function sendMessage(msg, cb) {
    const id = "_fa" + ++seq;
    let done = false;
    const onMsg = (e) => {
      if (e.source !== w) return;
      const d = e.data;
      if (!d || d.__faRes !== id) return;
      if (done) return;
      done = true;
      w.removeEventListener("message", onMsg);
      const p = d.payload || {};
      rt.lastError = p.err ? { message: p.err } : undefined;
      if (typeof cb === "function") {
        try {
          cb(p.resp != null ? p.resp : undefined);
        } catch (_) {}
      }
    };
    w.addEventListener("message", onMsg);
    try {
      w.postMessage({ __faReq: id, msg: msg }, "*");
    } catch (_) {}

    setTimeout(() => {
      if (!done) {
        done = true;
        w.removeEventListener("message", onMsg);
        rt.lastError = { message: "sem resposta do service worker" };
        if (typeof cb === "function") {
          try {
            cb(undefined);
          } catch (_) {}
        }
      }
    }, 30000);
  }

  const rt = {
    id: meta.id || "fa-remote",
    lastError: undefined,
    getURL: (p) => (meta.base || "") + String(p || "").replace(/^\//, ""),
    sendMessage: sendMessage,
    onMessage: { addListener: () => {}, removeListener: () => {} },
  };

  try {
    w.chrome = w.chrome || {};
    w.chrome.runtime = rt;
  } catch (_) {
    try {
      w.chrome = { runtime: rt };
    } catch (_2) {}
  }
})();

window.FA_VARIANT = "estudio";

(() => {
  const VERSION = "0.1.0";
  if (window.__faBridge?.version === VERSION) return;
  if (window.__faBridge?.dispose) {
    try {
      window.__faBridge.dispose();
    } catch {}
  }

  function findReactKey(node) {
    if (!node || typeof node !== "object") return null;
    const keys = Object.keys(node);
    return (
      keys.find((k) => k.startsWith("__reactProps")) ||
      keys.find((k) => k.startsWith("__reactEventHandlers")) ||
      null
    );
  }

  function getReactOnClick(node) {
    const key = findReactKey(node);
    if (!key) return null;
    const props = node[key];
    if (props && typeof props.onClick === "function") {
      return { onClick: props.onClick, key, source: node };
    }
    return null;
  }

  function findOnClickInTree(start) {
    const direct = getReactOnClick(start);
    if (direct) return { ...direct, depth: "self" };

    let cur = start.parentElement;
    for (let i = 0; i < 5 && cur; i++) {
      const f = getReactOnClick(cur);
      if (f) return { ...f, depth: "parent+" + (i + 1) };
      cur = cur.parentElement;
    }

    const queue = [{ node: start, depth: 0 }];
    let visited = 0;
    while (queue.length > 0 && visited < 30) {
      const { node, depth } = queue.shift();
      visited++;
      if (depth > 0) {
        const f = getReactOnClick(node);
        if (f) return { ...f, depth: "child-" + depth };
      }
      if (depth < 3) {
        for (const c of node.children) queue.push({ node: c, depth: depth + 1 });
      }
    }
    return null;
  }

  function buildSyntheticEvent(target) {
    return {
      isTrusted: true,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
      type: "click",
      target,
      currentTarget: target,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      eventPhase: 2,
      detail: 1,
      button: 0,
      buttons: 0,
      clientX: 0,
      clientY: 0,
      screenX: 0,
      screenY: 0,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      view: window,
      nativeEvent: { isTrusted: true, type: "click" },
    };
  }

  function dispatchResult(detail) {
    window.dispatchEvent(new CustomEvent("fa-tc-result", { detail }));
  }

  function handleTrustedClickRequest(e) {
    const { id, selector } = e.detail || {};
    if (!id || !selector) return;
    try {
      const el = document.querySelector(selector);
      if (!el) {
        dispatchResult({ id, ok: false, error: "elemento não encontrado: " + selector });
        return;
      }
      const found = findOnClickInTree(el);
      if (!found) {
        dispatchResult({ id, ok: false, error: "nenhum onClick React na árvore local" });
        return;
      }
      try {
        found.onClick(buildSyntheticEvent(found.source));
        dispatchResult({ id, ok: true, depth: found.depth, key: found.key });
      } catch (err) {
        dispatchResult({
          id,
          ok: false,
          error: "onClick lançou: " + (err?.message || String(err)),
        });
      }
    } catch (err) {
      dispatchResult({ id, ok: false, error: "handler lançou: " + (err?.message || String(err)) });
    }
  }

  window.addEventListener("fa-tc-request", handleTrustedClickRequest);

  function setToken(t) {
    if (!t || typeof t !== "string") return;
    if (document.documentElement.dataset.faFlowToken === t) return;
    try {
      document.documentElement.dataset.faFlowToken = t;
    } catch {}
  }

  function captureFromHeaders(headers) {
    try {
      if (!headers) return;
      if (typeof headers.get === "function") {
        const v = headers.get("authorization") || headers.get("Authorization");
        if (v && v.startsWith("Bearer ")) setToken(v);
        return;
      }
      if (Array.isArray(headers)) {
        for (const [k, v] of headers) {
          if (
            typeof k === "string" &&
            k.toLowerCase() === "authorization" &&
            typeof v === "string" &&
            v.startsWith("Bearer ")
          )
            setToken(v);
        }
        return;
      }
      if (typeof headers === "object") {
        for (const k of Object.keys(headers)) {
          const v = headers[k];
          if (
            k.toLowerCase() === "authorization" &&
            typeof v === "string" &&
            v.startsWith("Bearer ")
          )
            setToken(v);
        }
      }
    } catch {}
  }

  const origFetch = window.fetch;
  if (origFetch && !window.__faTokenFetchPatched) {
    window.fetch = function (input, init) {
      try {
        if (init?.headers) captureFromHeaders(init.headers);
        if (input instanceof Request) captureFromHeaders(input.headers);
      } catch {}
      return origFetch.apply(this, arguments);
    };
    window.__faTokenFetchPatched = true;
  }

  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  if (!XMLHttpRequest.prototype.__faTokenPatched) {
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try {
        if (
          typeof name === "string" &&
          name.toLowerCase() === "authorization" &&
          typeof value === "string" &&
          value.startsWith("Bearer ")
        )
          setToken(value);
      } catch {}
      return origSetHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.__faTokenPatched = true;
  }

  window.__faBridge = {
    version: VERSION,
    dispose: () => {
      window.removeEventListener("fa-tc-request", handleTrustedClickRequest);
      try {
        delete window.__faBridge;
      } catch {
        window.__faBridge = null;
      }
    },
  };

  console.log("[flow-auto/bridge] v" + VERSION + " instalado no MAIN world");
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});

  NS.T = {
    SHORT: [350, 700],
    MEDIUM: [600, 1100],
    LONG: [900, 1600],
    DOM_SETTLE: [300, 550],
    HUMAN_PAUSE: [500, 1100],
    HUMAN_READ: [900, 1800],

    GENERATION_TIMEOUT: 300000,
    TILE_CHECK_INTERVAL: 2500,
    STABILIZE_TIME: 6000,
    VIDEO_LOAD_RETRY_MS: 5000,
  };

  NS.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  NS.dynamicSleep = (range) => {
    const [min, max] = Array.isArray(range) ? range : [range, range];
    const ms = min + Math.random() * Math.max(0, max - min);
    return new Promise((r) => setTimeout(r, ms));
  };
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});

  const MAX = 200;
  const lines = [];
  const subscribers = new Set();

  function push(level, args) {
    const text = args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" ");
    const entry = { level, text, ts: Date.now() };
    lines.push(entry);
    if (lines.length > MAX) lines.shift();
    subscribers.forEach((fn) => {
      try {
        fn(entry);
      } catch {}
    });
    const tag = "[flow-auto]";
    if (level === "error") console.error(tag, ...args);
    else if (level === "warn") console.warn(tag, ...args);
    else console.log(tag, ...args);
  }

  function safeStringify(v) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  NS.log = {
    info: (...a) => push("info", a),
    warn: (...a) => push("warn", a),
    error: (...a) => push("error", a),
    lines: () => lines.slice(),
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    clear: () => {
      lines.length = 0;
      subscribers.forEach((fn) => {
        try {
          fn(null);
        } catch {}
      });
    },
  };
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const { S, T } = NS;

  const getEditor = () => document.querySelector(S.editor);

  const getUploadInput = () => document.querySelector(S.fileInput);

  const getScroller = () => {
    for (const sel of S.scroller) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const listAllTiles = () => [...document.querySelectorAll(S.tile)];

  const snapshotTileIds = () => new Set(listAllTiles().map((t) => t.getAttribute("data-tile-id")));

  const getInnerTiles = () => {
    const out = [];
    for (const el of document.querySelectorAll(S.tile)) {
      if (!el.querySelector(S.tile)) out.push(el);
    }
    return out;
  };

  const getMediaSrcFromTile = (tile) => {
    const img = tile.querySelector(S.tileImg);
    if (img && img.complete) return { kind: "image", src: img.src };
    const video = tile.querySelector(S.tileVideo);
    if (video?.src) return { kind: "video", src: video.src };
    return null;
  };

  const isVideoTile = (tile) => !!tile.querySelector(S.tileVideo);

  const tileHasProgress = (tile) => {
    for (const el of tile.querySelectorAll("div, span")) {
      const t = el.textContent?.trim();
      if (t && S.re.progress.test(t)) return true;
    }
    return false;
  };

  const stripFeIdPrefix = (id) =>
    id && id.startsWith(S.feIdPrefix) ? id.slice(S.feIdPrefix.length) : id;

  const getWorkflowIdFromTile = (tile) => {
    if (!tile) return null;
    const link = tile.querySelector(S.editLink);
    if (link) {
      const m = link.href.match(S.re.editUuid);
      if (m) return m[1];
    }
    const dataTileId = tile.getAttribute("data-tile-id");
    return dataTileId ? stripFeIdPrefix(dataTileId) : null;
  };

  const getMediaUuidFromTile = (tile) => {
    if (!tile) return null;
    const media = tile.querySelector(S.tileImg) || tile.querySelector(S.tileVideo);
    if (!media?.src) return null;
    try {
      return new URL(media.src).searchParams.get("name");
    } catch {
      return null;
    }
  };

  const findTileElByWorkflowId = (workflowId) => {
    if (!workflowId) return null;
    const esc = CSS.escape(workflowId);
    return (
      document.querySelector(`[data-tile-id="${esc}"]`) ||
      document.querySelector(`[data-tile-id="${CSS.escape(S.feIdPrefix + workflowId)}"]`) ||
      (() => {
        const link = [...document.querySelectorAll(S.editLink)].find((a) =>
          a.href.includes(`/edit/${workflowId}`),
        );
        return link?.closest(S.tile) ?? null;
      })()
    );
  };

  const findTileElByMediaUuid = (mediaUuid) => {
    if (!mediaUuid) return null;
    const esc = CSS.escape(mediaUuid);
    const media =
      document.querySelector(`img[src*="name=${esc}"]`) ||
      document.querySelector(`video[src*="name=${esc}"]`);
    return media?.closest(S.tile) ?? null;
  };

  const resolveTileAndWorkflowId = ({ workflowId, mediaUuid }) => {
    let tile = null,
      source = null;
    if (mediaUuid) {
      tile = findTileElByMediaUuid(mediaUuid);
      if (tile) source = "mediaUuid";
    }
    if (!tile && workflowId) {
      tile = findTileElByWorkflowId(workflowId);
      if (tile) source = "workflowId";
    }
    if (!tile) return null;
    const link = tile.querySelector(S.editLink);
    const m = link?.href?.match(S.re.editUuid);
    return { tile, workflowId: m?.[1] ?? null, source };
  };

  const getTileName = (tile) => {
    for (const div of tile.querySelectorAll("div")) {
      if (div.querySelector("img, video, button, svg")) continue;
      const text = (div.innerText || "").trim();
      if (!text || text.length > 80) continue;
      if (S.re.progress.test(text)) continue;
      if (/^\d+:\d+/.test(text)) continue;
      return text;
    }
    return null;
  };

  const getTileDisplayName = (tile) => {
    if (!tile) return null;
    for (const div of tile.querySelectorAll("div")) {
      if (div.children.length) continue;
      const text = (div.textContent || "").trim();
      if (!text || text.length > 80) continue;
      if (S.re.progress.test(text)) continue;
      if (/^\d+:\d+/.test(text)) continue;
      return text;
    }
    return null;
  };

  const getFlowProjectId = () => {
    const m = location.href.match(S.re.projectUuid);
    if (m) return m[1];
    const link = document.querySelector('a[href*="/project/"]');
    if (link) {
      const m2 = link.href.match(S.re.projectUuid);
      if (m2) return m2[1];
    }
    return null;
  };

  const getCapturedToken = () => {
    try {
      const t = document.documentElement?.dataset?.faFlowToken;
      if (t) return t;
    } catch {}
    return null;
  };

  const videoLoadRetryAt = new Map();

  const classifyTile = (tile) => {
    const img = tile.querySelector(S.tileImg);
    if (img && img.complete) return "loaded";

    const video = tile.querySelector(S.tileVideo);
    if (video?.src) {
      if (Number.isFinite(video.duration) && video.duration > 0) return "loaded";
      const tileId = tile.getAttribute("data-tile-id");
      if (tileId) {
        const last = videoLoadRetryAt.get(tileId) || 0;
        if (Date.now() - last > T.VIDEO_LOAD_RETRY_MS) {
          videoLoadRetryAt.set(tileId, Date.now());
          try {
            if (video.preload !== "auto") video.preload = "auto";
          } catch {}
          try {
            video.load();
          } catch {}
        }
      }
      return "not_resolved";
    }

    if (tileHasProgress(tile)) return "pending";

    const icons = [...tile.querySelectorAll("i")].map((i) => (i.textContent || "").trim());
    if (icons.includes(S.icon.refresh) && icons.includes(S.icon.warning)) return "real_error";

    return "not_resolved";
  };

  function getTileErrorType(tile) {
    const txt = (tile?.textContent || "").toLowerCase();
    if (
      /limite de uso|cota|quota|daily limit|limite di[áa]rio|n[ãa]o houve cobran[çc]a|voc[êe] chegou ao limite/i.test(
        txt,
      )
    )
      return "model_limit";
    if (/muito r[áa]pido|aguarde um instante|too quickly|too fast|rate limit|slow down/.test(txt))
      return "rate_limit";
    if (/atividade incomum|unusual activity|unusual traffic|suspicious activity/.test(txt))
      return "unusual_activity";
    if (/pol[íi]tica|viol|policy|policies|guidelines/.test(txt)) return "policy";
    return "other";
  }

  function findInnerTileById(id) {
    if (!id) return null;
    const esc = CSS.escape(id);
    return (
      [...document.querySelectorAll(`[data-tile-id="${esc}"]`)].find(
        (el) => !el.querySelector(S.tile),
      ) || null
    );
  }

  NS.dom = {
    getEditor,
    getUploadInput,
    getScroller,
    listAllTiles,
    snapshotTileIds,
    getInnerTiles,
    getMediaSrcFromTile,
    isVideoTile,
    tileHasProgress,
    stripFeIdPrefix,
    getWorkflowIdFromTile,
    getMediaUuidFromTile,
    findTileElByWorkflowId,
    findTileElByMediaUuid,
    resolveTileAndWorkflowId,
    getTileName,
    getTileDisplayName,
    getFlowProjectId,
    getCapturedToken,
    classifyTile,
    getTileErrorType,
    findInnerTileById,
  };
})();

(function () {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const log = NS.log || { info() {}, warn() {} };
  const VERSION = "0.1.0";
  const FAILSAFE_MS = 45000;

  const EVENTS = [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
    "dblclick",
    "auxclick",
    "contextmenu",
  ];

  const _stack = [];
  let _overlay = null;
  let _failsafe = 0;

  function blocker(e) {
    if (!_stack.length) return;
    if (!e.isTrusted) return;
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
  }

  function ensureOverlay() {
    if (_overlay) return;
    const d = document.createElement("div");
    d.id = "fa-popup-shield";
    d.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none;" +
      "background:rgba(10,13,18,.06);display:flex;align-items:flex-start;justify-content:center;";
    const tag = document.createElement("div");
    tag.style.cssText =
      "margin-top:14px;padding:8px 14px;border-radius:999px;pointer-events:none;" +
      "background:rgba(16,185,129,.96);color:#04140d;font:600 12.5px system-ui,-apple-system,sans-serif;" +
      "letter-spacing:.2px;box-shadow:0 6px 20px rgba(0,0,0,.28);";
    d.appendChild(tag);
    d._tag = tag;
    (document.documentElement || document.body).appendChild(d);
    _overlay = d;
  }
  function updateTag() {
    if (!_overlay) return;
    const r =
      (_stack[_stack.length - 1] && _stack[_stack.length - 1].reason) || "Automação em andamento";
    _overlay._tag.textContent = "🔒 " + r + " · não clique";
  }
  function teardown() {
    clearTimeout(_failsafe);
    _failsafe = 0;
    EVENTS.forEach((t) => window.removeEventListener(t, blocker, true));
    if (_overlay) {
      _overlay.remove();
      _overlay = null;
    }
    log.info("shield: 🔓 liberado");
  }
  function armFailsafe() {
    clearTimeout(_failsafe);
    _failsafe = setTimeout(() => {
      if (_stack.length) {
        log.warn("shield: failsafe — liberando (algum release se perdeu)");
        _stack.length = 0;
        teardown();
      }
    }, FAILSAFE_MS);
  }

  function lock(reason) {
    const token = { reason: reason || "Automação em andamento" };
    _stack.push(token);
    if (_stack.length === 1) {
      EVENTS.forEach((t) => window.addEventListener(t, blocker, true));
      ensureOverlay();
      log.info("shield: 🔒 " + token.reason);
    }
    updateTag();
    armFailsafe();
    let released = false;
    return function release() {
      if (released) return;
      released = true;
      const i = _stack.indexOf(token);
      if (i >= 0) _stack.splice(i, 1);
      if (!_stack.length) teardown();
      else {
        updateTag();
        armFailsafe();
      }
    };
  }
  async function withShield(reason, fn) {
    const rel = lock(reason);
    try {
      return await fn();
    } finally {
      rel();
    }
  }

  NS.shield = { version: VERSION, lock, withShield, isActive: () => _stack.length > 0 };
  log.info("shield v" + VERSION + " pronto");
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const FLOW_NOVO = /(^|\.)flow\.google\.com$/.test(location.hostname);
  NS.FLOW_NOVO = FLOW_NOVO;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const MEDIA_URL_RE = /^https:\/\/flow-content\.google\/(image|video)\/([0-9a-f-]{36})/i;

  function decodificar(texto) {
    const out = [];
    const linhas = String(texto || "").split("\n");
    for (const linha of linhas) {
      const l = linha.trim();
      if (!l.startsWith("[[")) continue;
      let arr;
      try {
        arr = JSON.parse(l);
      } catch {
        continue;
      }
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!Array.isArray(item) || item[0] !== "wrb.fr") continue;
        let payload = null;
        if (typeof item[2] === "string" && item[2]) {
          try {
            payload = JSON.parse(item[2]);
          } catch {
            payload = null;
          }
        }
        out.push({
          rpcid: item[1],
          payload,
          erro: item[5] && item[5] !== "generic" ? item[5] : null,
        });
      }
    }
    return out;
  }

  function extrairMidias(payload) {
    const achados = new Map();
    const visitar = (node, trilha) => {
      if (typeof node === "string") {
        const m = MEDIA_URL_RE.exec(node);
        if (m) {
          const mediaId = m[2].toLowerCase();
          const reg = achados.get(mediaId) || {
            mediaId,
            url: node,
            kind: m[1] === "video" ? "video" : "image",
            workflowId: null,
            nome: null,
            prompt: null,
            largura: null,
            altura: null,
            poster: null,
          };

          if (m[1] === "video") {
            if (reg.kind !== "video" && reg.url && reg.url !== node) reg.poster = reg.url;
            reg.kind = "video";
            reg.url = node;
          } else if (reg.kind === "video") {
            reg.poster = node;
          } else {
            reg.url = node;
          }

          for (let i = trilha.length - 1; i >= 0; i--) {
            const a = trilha[i];
            if (Array.isArray(a) && a[0] === mediaId) {
              if (typeof a[2] === "string" && UUID_RE.test(a[2])) reg.workflowId = a[2];
              break;
            }
          }

          for (let i = trilha.length - 1; i >= 0; i--) {
            const a = trilha[i];
            if (!Array.isArray(a)) continue;
            const dims = a.find(
              (x) =>
                Array.isArray(x) &&
                x.length === 2 &&
                Number.isInteger(x[0]) &&
                Number.isInteger(x[1]) &&
                x[0] > 16 &&
                x[1] > 16,
            );
            if (dims) {
              reg.largura = dims[0];
              reg.altura = dims[1];
              break;
            }
          }
          achados.set(mediaId, reg);
        }
        return;
      }
      if (Array.isArray(node)) {
        trilha.push(node);
        for (const x of node) visitar(x, trilha);
        trilha.pop();
      }
    };
    visitar(payload, []);

    const nomear = (node) => {
      if (!Array.isArray(node)) return;
      if (
        typeof node[0] === "string" &&
        !UUID_RE.test(node[0]) &&
        node.length >= 5 &&
        typeof node[4] === "string" &&
        achados.has(String(node[4]).toLowerCase())
      ) {
        achados.get(String(node[4]).toLowerCase()).nome = node[0];
      }
      for (const x of node) nomear(x);
    };
    nomear(payload);

    for (const reg of achados.values()) {
      const livres = [];
      let estruturado = null;
      const buscar = (node, dentro) => {
        if (Array.isArray(node)) {
          const meu = dentro || node[0] === reg.mediaId;
          if (
            meu &&
            node.length === 1 &&
            Array.isArray(node[0]) &&
            node[0].length === 1 &&
            Array.isArray(node[0][0]) &&
            node[0][0].length === 1 &&
            typeof node[0][0][0] === "string" &&
            !estruturado
          )
            estruturado = node[0][0][0];
          for (const x of node) buscar(x, meu);
        } else if (
          dentro &&
          typeof node === "string" &&
          node.length > 3 &&
          !UUID_RE.test(node) &&
          !/^https?:/.test(node) &&
          !/^[A-Z_0-9]+$/.test(node)
        ) {
          if (!livres.includes(node)) livres.push(node);
        }
      };
      buscar(payload, false);
      reg.prompts = livres;
      reg.prompt = estruturado || livres[0] || null;
    }
    return [...achados.values()];
  }

  const ouvintes = new Map();
  const historico = [];
  const MAX_HIST = 80;
  const GERACAO_RPCS = new Set(["ogiZ0b", "eb1hJf", "MZZa6b"]);
  function on(rpcid, cb) {
    const chave = rpcid || "*";
    let set = ouvintes.get(chave);
    if (!set) {
      set = new Set();
      ouvintes.set(chave, set);
    }
    set.add(cb);
    return () => set.delete(cb);
  }
  function emitir(ev) {
    for (const chave of [ev.rpcid, "*"]) {
      const set = ouvintes.get(chave);
      if (!set) continue;
      for (const cb of set) {
        try {
          cb(ev);
        } catch (e) {
          console.warn("[flow2/rpc] ouvinte falhou", e);
        }
      }
    }
  }
  function registrar(url, req, status, res, via) {
    const ts = Date.now();
    const eventos = decodificar(res);
    for (const e of eventos) {
      const ev = {
        t: ts,
        via,
        rpcid: e.rpcid,
        payload: e.payload,
        erro: e.erro,
        midias: e.payload ? extrairMidias(e.payload) : [],
      };
      historico.push(ev);
      if (historico.length > MAX_HIST) historico.shift();
      emitir(ev);
    }
    try {
      let n = document.getElementById("fa-flow2-caps");
      if (!n) {
        n = document.createElement("div");
        n.id = "fa-flow2-caps";
        n.hidden = true;
        document.documentElement.appendChild(n);
      }
      const caps = JSON.parse(n.textContent || "[]");
      caps.push({
        t: ts,
        via,
        u: String(url).slice(0, 300),
        req: String(req || "").slice(0, 6000),
        status,
        res: String(res || "").slice(0, 30000),
      });
      n.textContent = JSON.stringify(caps.slice(-60));
    } catch {}
  }
  function instalar() {
    if (window.__faRpc2Patched) return;
    window.__faRpc2Patched = true;
    const O = XMLHttpRequest.prototype.open,
      S = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) {
      try {
        this.__faU = String(u);
      } catch {}
      return O.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (b) {
      const x = this;
      try {
        if (/batchexecute/.test(x.__faU || "")) {
          x.addEventListener("loadend", () => {
            try {
              registrar(x.__faU, b, x.status, x.responseText, "xhr");
            } catch {}
          });
        }
      } catch {}
      return S.apply(this, arguments);
    };
    const F2 = window.fetch;
    window.fetch = async function (input, init) {
      const u = typeof input === "string" ? input : (input && input.url) || "";
      const r = await F2.apply(this, arguments);
      if (/batchexecute/.test(u)) {
        try {
          registrar(u, init && init.body, r.status, await r.clone().text(), "fetch");
        } catch {}
      }
      return r;
    };
  }
  NS.rpc2 = {
    ativo: FLOW_NOVO,
    on,
    historico: () => historico.slice(),
    desde: (t) => historico.filter((e) => e.t >= t),

    geracaoSubmetidaDesde: (ts) => historico.some((e) => e.t >= ts && GERACAO_RPCS.has(e.rpcid)),
    decodificar,
    extrairMidias,
    UUID_RE,
    MEDIA_URL_RE,
    _registrarParaTeste: registrar,
  };
  if (FLOW_NOVO) {
    try {
      instalar();
      console.log("[flow2/rpc] barramento de RPC ligado");
    } catch (e) {
      console.warn("[flow2/rpc] não instalou:", e);
    }
  }
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  NS.S2 = {
    editor: 'flow-rich-text-editor .ProseMirror[contenteditable="true"]',
    promptBox: "flow-base-prompt-box",
    agentChip: "flow-agent-mode-toggle-chip button.agent-mode-chip",
    settingsTrigger: "button.settings-trigger-button",
    generateButton: "flow-generate-icon-button button",
    addMenuButton: "flow-add-menu button",
    addMenuPopover: ".cdk-overlay-container flow-add-menu-popover-content",
    addMenuSearch: ".cdk-overlay-container flow-add-menu-popover-content input",
    addMenuItem: ".cdk-overlay-container flow-add-menu-asset-item",
    addMenuUpload:
      'flow-media-upload input[type="file"], .cdk-overlay-container input[type="file"]',
    addMenuSideNav: ".cdk-overlay-container flow-add-menu-side-nav",

    addMenuNavIcons: {
      todos: "dashboard",
      imagens: "image",
      videos: "videocam",
      vozes: "voice_selection",
      personagens: "accessibility_new",
      avatares: "face",
      envios: "drive_folder_upload",
      enviar: "upload",
    },
    ingredientBar: "flow-ingredient-bar",
    audioChip: "flow-ingredient-bar flow-audio-ingredient-chip",
    ingredientChip: "flow-ingredient-bar flow-ingredient-chip",

    qualquerChip:
      "flow-base-prompt-box flow-ingredient-chip, flow-base-prompt-box flow-image-ingredient-chip, flow-base-prompt-box flow-audio-ingredient-chip, flow-base-prompt-box .frame-trigger img",

    frameSlots: 'flow-base-prompt-box [class*="frame"]',
    overlay: ".cdk-overlay-container",
    settingsPanel: ".cdk-overlay-container flow-prompt-box-settings",
    radio: 'button[role="radio"]',
    modelButton:
      '.cdk-overlay-container button[aria-label*="modelos"], .cdk-overlay-container button[aria-label*="model"]',
    menuItem: '.cdk-overlay-container [role="menuitem"]',
    backdrop: ".cdk-overlay-container .cdk-overlay-backdrop",
    scroller: "cdk-virtual-scroll-viewport.tiles-container, cdk-virtual-scroll-viewport",
    tile: "flow-tile-container",
    tilePending: "flow-pending-tile",
    tileImage: "flow-image-tile",
    tileVideo: "flow-video-tile",
    tileImg: "img",
    tileVideoEl: "video",
    tileFooter: "flow-tile-hover-footer",
    tileMoreButton: 'button[aria-label*="Mais"], button[aria-label*="More"]',
    tileRenameInput: "input.editable-text-input.editing",
    projectTitleInput: "flow-navigation-header flow-editable-text input.editable-text-input",
    emptyProject: ".empty-project-message",
    newProjectLabels: ["novo projeto", "new project", "nuevo proyecto"],
    creditLabel: "flow-credit-cost-label",

    creditValue: "flow-credit-cost-label a.credit-cost-link",
    re: {
      projectUuid: /\/project\/([0-9a-f-]{36})/i,
      mediaUrl: /^https:\/\/flow-content\.google\/(image|video)\/([0-9a-f-]{36})/i,
      aspectIcon: /crop_(16_9|9_16|landscape|square|portrait|free)/i,
    },
    aspectByIcon: {
      "16_9": "16:9",
      "9_16": "9:16",
      landscape: "4:3",
      square: "1:1",
      portrait: "3:4",
    },
    tipoLabels: { image: /^(imagem|image|imagen)$/i, video: /^(v[íi]deo)$/i },
    videoModeLabels: {
      frames: /^(frames|quadros)$/i,
      elements: /^(elementos|ingredients|elements)$/i,
    },
    menuLabels: {
      download: /download|baixar/i,
      rename: /renomear|rename/i,
      favorite: /favorit/i,
      includeInPrompt: /incluir no comando|add to prompt/i,
      trash: /lixeira|trash/i,
    },
    refSuffix: " _",
  };
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const S2 = NS.S2;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  function rotulo(el) {
    if (!el) return "";
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        out += node.textContent;
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      const cls = String((node.className && node.className.baseVal) || node.className || "");
      if (tag === "mat-icon" || tag === "i" || /symbols|mat-icon|material-icons/i.test(cls))
        continue;
      out += rotulo(node);
    }
    return out.replace(/\s+/g, " ").trim();
  }
  const getEditor = () => $(S2.editor);
  const getScroller = () =>
    $(S2.scroller) || document.querySelector("main") || document.scrollingElement;
  const getProjectId = () => {
    const m = S2.re.projectUuid.exec(location.pathname);
    return m ? m[1].toLowerCase() : null;
  };
  const isProjectEmpty = () => !!$(S2.emptyProject) && listTiles().length === 0;

  function lerTile(el) {
    const pend = $(S2.tilePending, el);
    const img = $(S2.tileImg, el);
    const vid = $(S2.tileVideoEl, el);
    let mediaId = null,
      url = null,
      kind = null;
    const midia = vid || img;
    if (midia) {
      url =
        midia.currentSrc ||
        midia.src ||
        midia.getAttribute("src") ||
        midia.getAttribute("data-src") ||
        (midia.querySelector &&
          midia.querySelector("source") &&
          midia.querySelector("source").src) ||
        null;
      const m = url && S2.re.mediaUrl.exec(url);

      mediaId =
        midia.id && NS.rpc2.UUID_RE.test(midia.id)
          ? midia.id
          : m
            ? m[2]
            : midia.dataset && midia.dataset.mediaId && NS.rpc2.UUID_RE.test(midia.dataset.mediaId)
              ? midia.dataset.mediaId
              : null;
      mediaId = mediaId ? mediaId.toLowerCase() : null;

      kind =
        $(S2.tileVideo, el) || vid ? "video" : m ? (m[1] === "video" ? "video" : "image") : "image";
    }
    const foot = $(S2.tileFooter, el);
    const nome = foot ? rotulo(foot) : "";
    let progresso = null;
    if (pend) {
      const mp = /(\d{1,3})\s*%/.exec(pend.textContent || "");
      progresso = mp ? Number(mp[1]) : 0;
    }
    const erro = !pend && !midia && /erro|error|falh|failed/i.test(el.textContent || "");

    const poster = kind === "video" && !!url && !/\/video\//.test(url);
    return {
      el,
      mediaId,
      url,
      kind,
      nome,
      poster,
      estado: pend ? "pending" : midia && mediaId ? "loaded" : erro ? "error" : "unknown",
      progresso,
    };
  }
  const listTiles = () => $$(S2.tile).map(lerTile);
  const snapshotIds = () =>
    new Set(
      listTiles()
        .map((t) => t.mediaId)
        .filter(Boolean),
    );
  const findTileByMediaId = (mediaId) => {
    const id = String(mediaId || "").toLowerCase();
    return listTiles().find((t) => t.mediaId === id) || null;
  };
  const findTileByName = (nome) => {
    const n = String(nome || "")
      .trim()
      .toLowerCase();
    return listTiles().find((t) => t.nome.toLowerCase() === n) || null;
  };

  function clicar(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    try {
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          ...base,
          pointerType: "mouse",
          pointerId: 1,
          isPrimary: true,
          button: 0,
          buttons: 1,
        }),
      );
    } catch {}
    el.dispatchEvent(new MouseEvent("mousedown", { ...base, button: 0, buttons: 1 }));
    try {
      el.dispatchEvent(
        new PointerEvent("pointerup", {
          ...base,
          pointerType: "mouse",
          pointerId: 1,
          isPrimary: true,
          button: 0,
          buttons: 0,
        }),
      );
    } catch {}
    el.dispatchEvent(new MouseEvent("mouseup", { ...base, button: 0, buttons: 0 }));
    el.click();
    return true;
  }
  async function esperar(cond, ms = 3000, passo = 100) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        const v = cond();
        if (v) return v;
      } catch {}
      await NS.sleep(passo);
    }
    try {
      return cond() || null;
    } catch {
      return null;
    }
  }

  async function fecharOverlays() {
    const ov = $(S2.overlay);
    if (!ov || !ov.children.length) return true;
    for (const tentativa of ["escape", "backdrop", "fora"]) {
      if (tentativa === "escape") {
        const alvo =
          document.activeElement && document.activeElement !== document.body
            ? document.activeElement
            : document.body;
        alvo.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            bubbles: true,
          }),
        );
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            bubbles: true,
          }),
        );
      } else if (tentativa === "backdrop") {
        const bd = $(S2.backdrop);
        if (bd) clicar(bd);
      } else {
        const alvo = document.querySelector("main") || document.body;
        clicar(alvo);
      }
      const fechou = await esperar(() => !$(S2.overlay).children.length, 600);
      if (fechou) return true;
    }
    return !$(S2.overlay).children.length;
  }

  const RE_SOBRECARGA =
    /high demand|alta demanda|sobrecarreg|retried at a later time|tente novamente mais tarde|be refunded|serão reembolsados/i;
  function sobrecargaDoFlow() {
    try {
      for (const b of document.querySelectorAll('flow-banner, [role="alert"], [role="status"]')) {
        const txt = (b.textContent || "").replace(/\s+/g, " ").trim();
        if (txt && RE_SOBRECARGA.test(txt)) return txt.slice(0, 200);
      }
    } catch (_) {}
    return null;
  }
  NS.dom2 = {
    $,
    $$,
    rotulo,
    getEditor,
    getScroller,
    getProjectId,
    isProjectEmpty,
    lerTile,
    listTiles,
    snapshotIds,
    findTileByMediaId,
    findTileByName,
    clicar,
    esperar,
    fecharOverlays,
    sobrecargaDoFlow,
  };
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const S2 = NS.S2,
    D2 = NS.dom2;
  const log = NS.log;
  const getPromptText = () => {
    const ed = D2.getEditor();
    if (!ed) return "";
    const t = ed.textContent || "";
    return ed.querySelector(".prosemirror-placeholder") &&
      t === ed.querySelector(".prosemirror-placeholder").textContent
      ? ""
      : t.replace(/\s+$/, "");
  };
  function findAgentButton() {
    return D2.$(S2.agentChip);
  }
  function isAgentActive() {
    const b = findAgentButton();
    return !!(b && b.getAttribute("aria-pressed") === "true");
  }
  async function ensureAgentOff() {
    const b = findAgentButton();
    if (!b || b.getAttribute("aria-pressed") !== "true") return false;
    D2.clicar(b);
    const off = await D2.esperar(
      () => findAgentButton() && findAgentButton().getAttribute("aria-pressed") !== "true",
      2000,
    );
    if (!off) log.warn("flow2: não consegui desligar o modo Agente");
    return true;
  }

  async function setPrompt(text) {
    const ed = D2.getEditor();
    if (!ed) throw new Error("editor de prompt não encontrado (flow2)");
    ed.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ed);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    await NS.sleep(120);
    if (getPromptText().trim() !== String(text).trim()) {
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        await clearEditor();
        ed.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
        );
        await NS.sleep(150);
      } catch {}
    }
    if (getPromptText().trim() !== String(text).trim()) {
      try {
        ed.dispatchEvent(
          new InputEvent("beforeinput", {
            inputType: "insertText",
            data: text,
            bubbles: true,
            cancelable: true,
          }),
        );
        await NS.sleep(120);
      } catch {}
    }
    const final = getPromptText().trim() === String(text).trim();
    if (!final)
      log.warn(
        'flow2: prompt não bateu depois de escrever: "' + getPromptText().slice(0, 40) + '"',
      );
    return final;
  }
  async function clearEditor() {
    const ed = D2.getEditor();
    if (!ed) return false;
    ed.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ed);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
    try {
      document.execCommand("delete");
    } catch {}
    await NS.sleep(80);
    if (getPromptText()) {
      try {
        ed.textContent = "";
        ed.dispatchEvent(new InputEvent("input", { bubbles: true }));
      } catch {}
    }
    return !getPromptText();
  }

  async function limparIngredientes() {
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const chip = D2.$(S2.ingredientChip);
      if (!chip) break;
      const x =
        [...chip.querySelectorAll("button")].find((b) =>
          /remov|fechar|close|delete/i.test(
            (b.getAttribute("aria-label") || "") + " " + b.textContent,
          ),
        ) || chip.querySelector("button");
      if (!x) break;
      D2.clicar(x);
      n++;
      await NS.sleep(150);
    }
    return n;
  }
  async function resetEditor() {
    await limparIngredientes();
    return clearEditor();
  }
  function findSubmitButton() {
    return D2.$(S2.generateButton);
  }

  async function clickSubmit() {
    const antesPend = D2.$$(S2.tilePending).length;
    const antesTexto = getPromptText();
    const enviado = () =>
      D2.$$(S2.tilePending).length > antesPend || (antesTexto && !getPromptText());
    const btn = findSubmitButton();
    if (!btn) throw new Error("botão de gerar não encontrado (flow2)");
    if (btn.disabled) throw new Error("botão de gerar desabilitado (prompt vazio?)");
    btn.click();
    if (await D2.esperar(enviado, 2500)) return { ok: true, via: "click" };
    D2.clicar(btn);
    if (await D2.esperar(enviado, 2500)) return { ok: true, via: "pointer" };
    const ed = D2.getEditor();
    if (ed) {
      ed.focus();
      ed.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
      );
    }
    if (await D2.esperar(enviado, 2500)) return { ok: true, via: "enter" };
    throw new Error("o Flow não aceitou o envio (nem clique, nem ponteiro, nem Enter)");
  }
  NS.editor2 = {
    getPromptText,
    findAgentButton,
    isAgentActive,
    ensureAgentOff,
    setPrompt,
    clearEditor,
    limparIngredientes,
    resetEditor,
    findSubmitButton,
    clickSubmit,
  };
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const S2 = NS.S2,
    D2 = NS.dom2,
    E2 = NS.editor2;
  const log = NS.log;
  const trigger = () => D2.$(S2.settingsTrigger);
  const painel = () => D2.$(S2.settingsPanel);

  function readCurrentConfig() {
    const t = trigger();
    const txt = t ? (t.textContent || "").replace(/\s+/g, " ").trim() : "";
    const type = /v[íi]deo/i.test(txt) ? "video" : "image";
    const am = S2.re.aspectIcon.exec(txt);
    const aspect = am ? S2.aspectByIcon[am[1].toLowerCase()] || null : null;
    const vm = /\bx([1-4])\b/.exec(txt);
    const variants = vm ? Number(vm[1]) : null;
    const dm = /(\d+)\s*s\b/.exec(txt);
    const duration = dm ? Number(dm[1]) : null;
    const rm = /(\d{3,4})p\b/.exec(txt);
    const resolution = rm ? Number(rm[1]) : null;
    let model = null;
    if (type === "image")
      model =
        txt
          .split(/crop_/i)[0]
          .replace(/[^0-9A-Za-zÀ-ÿ .\-]/g, "")
          .replace(/\s+/g, " ")
          .trim() || null;
    return { type, aspect, variants, duration, resolution, model, raw: txt };
  }
  async function abrir() {
    if (painel()) return painel();
    const t = trigger();
    if (!t) throw new Error("gatilho de configurações não encontrado (flow2)");

    t.click();
    let p = await D2.esperar(painel, 2500);
    if (!p) {
      D2.clicar(t);
      p = await D2.esperar(painel, 2500);
    }
    if (!p) throw new Error("o menu de configurações não abriu (flow2)");
    return p;
  }
  async function fechar() {
    await D2.fecharOverlays();
  }
  const radios = (p) => D2.$$(S2.radio, p);
  const radioPor = (p, re) => radios(p).find((b) => re.test(D2.rotulo(b)));
  async function marcar(p, re, nome) {
    const b = radioPor(p, re);
    if (!b) {
      log.warn('flow2/menu: opção "' + nome + '" não encontrada');
      return false;
    }
    if (b.getAttribute("aria-checked") === "true") return false;
    D2.clicar(b);
    await D2.esperar(() => b.getAttribute("aria-checked") === "true", 1500);
    await NS.sleep(120);
    return true;
  }
  const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  async function setMediaType(type) {
    const p = await abrir();
    return marcar(p, S2.tipoLabels[type === "video" ? "video" : "image"], type);
  }
  async function setVideoMode(mode) {
    const p = await abrir();
    return marcar(p, S2.videoModeLabels[mode === "frames" ? "frames" : "elements"], mode);
  }
  async function setAspectRatio(r) {
    const p = await abrir();
    return marcar(p, new RegExp("^" + escapar(r) + "$"), r);
  }
  async function setVariantCount(n) {
    const p = await abrir();
    return marcar(p, new RegExp("^x" + Number(n) + "$", "i"), "x" + n);
  }
  async function setDuration(s) {
    const p = await abrir();
    return marcar(p, new RegExp("^" + Number(s) + "\\s*s$", "i"), s + "s");
  }
  async function setResolution(r) {
    const p = await abrir();
    return marcar(p, new RegExp("^" + Number(r) + "p$", "i"), r + "p");
  }
  function itensDeMenu() {
    return D2.$$(S2.menuItem).filter((e) => e.offsetParent !== null || true);
  }
  async function abrirMenuDeModelos() {
    await abrir();
    const b =
      D2.$(S2.modelButton) ||
      D2.$$(".cdk-overlay-container button").find((x) =>
        /arrow_drop_down/.test(x.textContent || ""),
      );
    if (!b) throw new Error("botão de modelo não encontrado (flow2)");
    const antes = itensDeMenu().length;
    D2.clicar(b);
    await D2.esperar(() => itensDeMenu().length > antes, 2000);
    return itensDeMenu().filter(
      (it) =>
        !S2.menuLabels.download.test(it.textContent) && !S2.menuLabels.rename.test(it.textContent),
    );
  }
  const nomeDoModelo = (it) =>
    D2.rotulo(it)
      .replace(/^[^\wÀ-ÿ]+/, "")
      .trim();
  async function listModels(type) {
    const cfg = readCurrentConfig();
    if (type && cfg.type !== type) await setMediaType(type);
    const itens = await abrirMenuDeModelos();
    const nomes = itens.map(nomeDoModelo).filter(Boolean);
    await fechar();
    return nomes;
  }
  async function setModel(name) {
    if (!name) return false;
    const itens = await abrirMenuDeModelos();
    const alvo = String(name).toLowerCase();
    const it =
      itens.find((x) => nomeDoModelo(x).toLowerCase() === alvo) ||
      itens.find((x) => nomeDoModelo(x).toLowerCase().includes(alvo));
    if (!it) {
      log.warn(
        'flow2/menu: modelo "' +
          name +
          '" não está no menu [' +
          itens.map(nomeDoModelo).join(" · ") +
          "]",
      );
      await D2.fecharOverlays();
      return false;
    }
    D2.clicar(it);
    await NS.sleep(200);
    return true;
  }

  async function configureGeneration(cfg = {}) {
    try {
      if (await E2.ensureAgentOff()) await NS.sleep(300);
    } catch (e) {
      log.warn("flow2: ensureAgentOff falhou: " + (e && e.message));
    }
    const cur = readCurrentConfig();
    const wantType = cfg.type || cur.type;
    const precisa =
      (cfg.type && cfg.type !== cur.type) ||
      (cfg.aspectRatio && cfg.aspectRatio !== cur.aspect) ||
      (cfg.variants && cfg.variants !== cur.variants) ||
      (cfg.duration && cfg.duration !== cur.duration) ||
      (cfg.resolution && cfg.resolution !== cur.resolution) ||
      (cfg.model &&
        (cur.type !== "image" ||
          !cur.model ||
          cur.model.toLowerCase() !== String(cfg.model).toLowerCase())) ||
      cfg.videoMode;
    if (!precisa) return { ok: true, mudou: false, config: cur };
    const p = await abrir();
    const mudancas = [];
    if (cfg.type && cfg.type !== cur.type) {
      if (await marcar(p, S2.tipoLabels[cfg.type === "video" ? "video" : "image"], cfg.type))
        mudancas.push("type");
    }
    if (wantType === "video" && cfg.videoMode) {
      if (
        await marcar(
          p,
          S2.videoModeLabels[cfg.videoMode === "frames" ? "frames" : "elements"],
          cfg.videoMode,
        )
      )
        mudancas.push("videoMode");
    }
    if (cfg.aspectRatio) {
      if (await marcar(p, new RegExp("^" + escapar(cfg.aspectRatio) + "$"), cfg.aspectRatio))
        mudancas.push("aspect");
    }
    if (cfg.model) {
      const antes = readCurrentConfig().model;
      if (await setModel(cfg.model)) {
        mudancas.push("model");
      }
      await NS.sleep(150);
      if (!painel()) await abrir();
      void antes;
    }
    if (wantType === "video" && cfg.resolution) {
      if (
        await marcar(
          painel() || p,
          new RegExp("^" + Number(cfg.resolution) + "p$", "i"),
          cfg.resolution + "p",
        )
      )
        mudancas.push("resolution");
    }
    if (wantType === "video" && cfg.duration) {
      if (
        await marcar(
          painel() || p,
          new RegExp("^" + Number(cfg.duration) + "\\s*s$", "i"),
          cfg.duration + "s",
        )
      )
        mudancas.push("duration");
    }
    if (cfg.variants) {
      if (
        await marcar(
          painel() || p,
          new RegExp("^x" + Number(cfg.variants) + "$", "i"),
          "x" + cfg.variants,
        )
      )
        mudancas.push("variants");
    }
    await fechar();
    const depois = readCurrentConfig();
    log.info(
      "flow2/menu: config " +
        (mudancas.length ? mudancas.join(",") : "sem mudança") +
        " → " +
        depois.raw,
    );
    return { ok: true, mudou: mudancas.length > 0, mudancas, config: depois };
  }
  NS.menu2 = {
    readCurrentConfig,
    abrir,
    fechar,
    setMediaType,
    setVideoMode,
    setAspectRatio,
    setVariantCount,
    setDuration,
    setResolution,
    setModel,
    listModels,
    configureGeneration,
  };
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const S2 = NS.S2,
    D2 = NS.dom2,
    RPC = NS.rpc2;
  const log = NS.log;
  const GENERATION_TIMEOUT = 8 * 60 * 1000;
  const bilhetes = new Map();
  let seq = 0;
  const chegadas = [];
  const consumidas = new Set();
  const ehUrlDeVideo = (u) => /\/video\//.test(String(u || ""));

  const ehVideoSemBytes = (m) =>
    !!m && (m.kind === "video" || m.poster ? !ehUrlDeVideo(m.url) : false);
  const _semUrlPeloMais = new Set();

  async function garantirUrlDeVideo(mediaId, urlAtual, desdeMs) {
    if (ehUrlDeVideo(urlAtual)) return urlAtual;
    const ja = chegadas.find((x) => x.mediaId === mediaId && ehUrlDeVideo(x.url));
    if (ja) return ja.url;
    if (Date.now() - desdeMs < 20000) return null;
    if (_semUrlPeloMais.has(mediaId)) return null;
    const tile = D2.findTileByMediaId(mediaId);
    if (!tile) return null;
    try {
      const u = await NS.refs2.urlDoVideoPeloMais(tile);
      if (ehUrlDeVideo(u)) return u;
    } catch (e) {
      log.warn("flow2/media: URL do vídeo pelo + falhou: " + e.message);
    }
    _semUrlPeloMais.add(mediaId);
    return null;
  }
  const norm = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  if (RPC && RPC.ativo) {
    RPC.on("*", (ev) => {
      for (const m of ev.midias || []) {
        const ja = chegadas.find((x) => x.mediaId === m.mediaId);
        if (ja) {
          if (ehUrlDeVideo(m.url) && !ehUrlDeVideo(ja.url)) {
            ja.poster = ja.url;
            ja.url = m.url;
            ja.kind = "video";
            if (!ja.workflowId && m.workflowId) ja.workflowId = m.workflowId;
            if (!ja.nome && m.nome) ja.nome = m.nome;
            log.info(
              "flow2/media: " +
                m.mediaId.slice(0, 8) +
                "… promovido a vídeo (URL /video/ chegou por " +
                ev.rpcid +
                ")",
            );
          }
          continue;
        }
        if (consumidas.has(m.mediaId)) continue;
        chegadas.push({ ...m, t: ev.t, rpcid: ev.rpcid });
        if (chegadas.length > 200) chegadas.shift();
      }
    });
  }
  function novoBilhete(prompt, expected, kind) {
    const id = "pend:" + ++seq + ":" + Date.now().toString(36);
    bilhetes.set(id, {
      id,
      prompt: norm(prompt),
      t: Date.now(),
      expected: Math.max(1, expected || 1),
      midias: [],
      kind: kind === "video" ? "video" : "image",
    });
    return id;
  }

  function casar(b) {
    const cand = chegadas.filter((m) => m.t >= b.t - 1500 && !consumidas.has(m.mediaId));
    const bate = (m) =>
      (m.prompts && m.prompts.some((p) => norm(p) === b.prompt)) ||
      (m.prompt && norm(m.prompt) === b.prompt);
    const doPrompt = cand.filter(bate);
    const deOutro = (m) =>
      [...bilhetes.values()].some(
        (o) =>
          o !== b &&
          o.prompt &&
          ((m.prompts || []).some((p) => norm(p) === o.prompt) ||
            (m.prompt && norm(m.prompt) === o.prompt)),
      );

    const semPrompt = (m) => !(m.prompts && m.prompts.length) && !m.prompt;
    const lista = doPrompt.length
      ? doPrompt
      : cand.filter((m) => !deOutro(m) && (!b.prompt || semPrompt(m)));
    return lista.slice(0, b.expected);
  }
  function resultadoDe(m, index, tileId) {
    return {
      index,
      kind: m.kind || "image",
      url: m.url,
      workflowId: m.workflowId || m.mediaId,
      mediaUuid: m.mediaId,
      tileId: tileId || m.mediaId,
      durationMs: m.durationMs || null,
      width: m.largura || null,
      height: m.altura || null,
      nome: m.nome || null,
      failed: false,
      failedReason: null,
      errorType: null,
    };
  }
  function falha(index, motivo, tipo) {
    return {
      index,
      kind: null,
      url: null,
      workflowId: null,
      mediaUuid: null,
      tileId: null,
      durationMs: null,
      failed: true,
      failedReason: motivo,
      errorType: tipo || "other",
    };
  }

  async function waitForTileIds({
    tileIds,
    expected,
    timeoutMs = GENERATION_TIMEOUT,
    onProgress = null,
  }) {
    const ids = [...(tileIds || [])];
    const bilhetesAqui = ids.filter((i) => bilhetes.has(i)).map((i) => bilhetes.get(i));
    const idsDiretos = ids.filter((i) => !bilhetes.has(i));
    const total =
      expected || bilhetesAqui.reduce((s, b) => s + b.expected, 0) + idsDiretos.length || 1;
    const start = Date.now();
    const antesDom = new Set([...chegadas.map((m) => m.mediaId)]);
    const snapshotDom = bilhetesAqui.length ? new Set(D2.snapshotIds()) : new Set();
    let lastState = "";
    const results = [];
    const resolvidos = new Map();
    while (Date.now() - start < timeoutMs) {
      for (const b of bilhetesAqui) {
        if (b.midias.length >= b.expected) continue;
        for (const m of casar(b)) {
          if (b.midias.length >= b.expected) break;
          if (consumidas.has(m.mediaId)) continue;

          const tileDoDom = D2.findTileByMediaId(m.mediaId);
          const ehVideo =
            b.kind === "video" || m.kind === "video" || !!(tileDoDom && tileDoDom.kind === "video");
          let url = m.url;
          if (ehVideo && !ehUrlDeVideo(url)) {
            url = await garantirUrlDeVideo(m.mediaId, url, m.t || start);
            if (!url) continue;
          }
          consumidas.add(m.mediaId);
          b.midias.push(m);
          resolvidos.set(
            m.mediaId,
            resultadoDe({ ...m, url, kind: ehVideo ? "video" : m.kind }, resolvidos.size + 1),
          );
        }
      }
      for (const id of idsDiretos) {
        if (resolvidos.has(id)) continue;
        const m = chegadas.find((x) => x.mediaId === id);
        const t = D2.findTileByMediaId(id);
        const ehVideo = !!(m && m.kind === "video") || !!(t && t.kind === "video");
        if (m) {
          let url = m.url;
          if (ehVideo && !ehUrlDeVideo(url)) {
            url = await garantirUrlDeVideo(id, url, m.t || start);
            if (!url) continue;
          }
          resolvidos.set(
            id,
            resultadoDe({ ...m, url, kind: ehVideo ? "video" : m.kind }, resolvidos.size + 1),
          );
          continue;
        }
        if (t && t.estado === "loaded") {
          let url = t.url;
          if (ehVideo && !ehUrlDeVideo(url)) {
            url = await garantirUrlDeVideo(id, url, start);
            if (!url) continue;
          }
          resolvidos.set(
            id,
            resultadoDe({ mediaId: id, url, kind: t.kind, nome: t.nome }, resolvidos.size + 1),
          );
        }
      }

      if (bilhetesAqui.some((b) => b.midias.length < b.expected) && Date.now() - start > 5000) {
        for (const t of D2.listTiles()) {
          if (
            t.estado !== "loaded" ||
            !t.mediaId ||
            snapshotDom.has(t.mediaId) ||
            consumidas.has(t.mediaId) ||
            antesDom.has(t.mediaId)
          )
            continue;
          const b = bilhetesAqui.find((x) => x.midias.length < x.expected);
          if (!b) break;
          let url = t.url;
          if (t.poster) {
            const viaRpc = chegadas.find(
              (m) => m.mediaId === t.mediaId && m.kind === "video" && /\/video\//.test(m.url || ""),
            );
            if (viaRpc) url = viaRpc.url;
            else if (Date.now() - start < 20000) continue;
            else {
              try {
                url = await NS.refs2.urlDoVideoPeloMais(t);
              } catch (e) {
                log.warn("flow2/media: URL do vídeo pelo + falhou: " + e.message);
              }
              if (!url || !/\/video\//.test(url)) continue;
            }
          }
          consumidas.add(t.mediaId);
          b.midias.push({ mediaId: t.mediaId, url, kind: t.kind, nome: t.nome, viaDom: true });
          resolvidos.set(
            t.mediaId,
            resultadoDe(
              { mediaId: t.mediaId, url, kind: t.kind, nome: t.nome },
              resolvidos.size + 1,
            ),
          );
          log.info(
            "flow2/media: tile " +
              t.mediaId.slice(0, 8) +
              "… casado pelo DOM (reserva" +
              (t.poster ? ", vídeo com URL de " + (url === t.url ? "poster?!" : "bytes") : "") +
              ")",
          );
        }
      }
      const pend = D2.$$(S2.tilePending).length;
      const loaded = resolvidos.size;
      const state = loaded + "-" + pend;
      if (state !== lastState) {
        lastState = state;
        log.info("flow2/media: " + loaded + "/" + total + " pronto(s), " + pend + " pendente(s)");
        if (onProgress) {
          try {
            onProgress({
              loaded,
              error: 0,
              notResolved: Math.max(0, total - loaded - pend),
              pending: pend,
              slots: total,
            });
          } catch {}
        }
      }
      if (loaded >= total) break;

      if (pend === 0 && Date.now() - start > 25000) {
        const ultima = chegadas.length ? chegadas[chegadas.length - 1].t : 0;
        if (Date.now() - ultima > 20000) break;
      }
      await NS.sleep(700);
    }
    const lista = [...resolvidos.values()].map((r, i) => ({ ...r, index: i + 1 }));
    while (lista.length < total) {
      const pageText = document.body ? document.body.innerText : "";
      let falhaTipo = Date.now() - start >= timeoutMs ? "timeout" : "other";
      let falhaMotivo = lista.length
        ? "lote estável mas a variante não chegou"
        : "o Flow não devolveu mídia (recusa, cota ou timeout)";
      if (
        /limite de uso|cota|quota|daily limit|limite di[áa]rio|n[ãa]o houve cobran[çc]a|voc[êe] chegou ao limite/i.test(
          pageText,
        )
      ) {
        falhaTipo = "model_limit";
        falhaMotivo = "Você chegou ao limite de uso do modelo.";
      } else if (
        /atividade incomum|unusual activity|unusual traffic|suspicious activity/i.test(pageText)
      ) {
        falhaTipo = "unusual_activity";
        falhaMotivo = "Atividade incomum detectada.";
      } else if (
        /muito r[áa]pido|aguarde um instante|too quickly|too fast|rate limit|slow down/i.test(
          pageText,
        )
      ) {
        falhaTipo = "rate_limit";
        falhaMotivo = "Limite de taxa excedido.";
      }
      lista.push(falha(lista.length + 1, falhaMotivo, falhaTipo));
    }
    for (const b of bilhetesAqui) bilhetes.delete(b.id);
    const completed = lista.filter((r) => !r.failed).length >= total;
    return { completed, slots: total, results: lista.slice(0, Math.max(total, lista.length)) };
  }
  async function waitForResults({ slots, beforeTileIds, timeoutMs, onProgress, bilhete }) {
    const ids = bilhete ? [bilhete] : [];
    if (!ids.length) {
      const b = novoBilhete("", slots || 1);
      ids.push(b);
    }
    return waitForTileIds({ tileIds: ids, expected: slots, timeoutMs, onProgress });
  }
  function listLoadedResults() {
    return D2.listTiles()
      .filter((t) => t.estado === "loaded")
      .map((t, i) => {
        const ch = chegadas.find((m) => m.mediaId === t.mediaId) || {};

        const url =
          t.kind === "video" && !ehUrlDeVideo(t.url) && ehUrlDeVideo(ch.url) ? ch.url : t.url;
        return resultadoDe(
          { mediaId: t.mediaId, url, kind: t.kind, nome: t.nome, workflowId: ch.workflowId },
          i + 1,
        );
      });
  }

  async function resolveVideoUrl(ref) {
    const mediaId = String(
      (ref && (ref.mediaUuid || ref.mediaId || ref.tileId || ref.id)) || "",
    ).toLowerCase();
    if (!mediaId) return null;
    const atual = ref && ref.url;
    if (ehUrlDeVideo(atual)) return atual;
    _semUrlPeloMais.delete(mediaId);
    return garantirUrlDeVideo(mediaId, atual, 0);
  }
  NS.media2 = {
    novoBilhete,
    waitForTileIds,
    waitForResults,
    listLoadedResults,
    resolveVideoUrl,
    ehVideoSemBytes,
    chegadas: () => chegadas.slice(),
    _bilhetes: bilhetes,
    GENERATION_TIMEOUT,
  };
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const S2 = NS.S2,
    D2 = NS.dom2,
    RPC = NS.rpc2;
  const log = NS.log;
  const parsePromptSegments = (text) => {
    const out = [];
    const re = /\[([^\]]+)\]/g;
    let last = 0,
      m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
      out.push({ type: "ref", label: m[1].trim() });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ type: "text", value: text.slice(last) });
    return out;
  };
  const extractRefLabelsFromPrompt = (text) => [
    ...new Set(
      parsePromptSegments(text)
        .filter((s) => s.type === "ref")
        .map((s) => s.label),
    ),
  ];
  const nameToLabel = (nome) =>
    String(nome || "")
      .replace(new RegExp(S2.refSuffix.replace(/\s/g, "\\s") + "$"), "")
      .trim();

  function listAvailableRefs() {
    const map = new Map();
    for (const t of D2.listTiles())
      if (t.nome && t.nome.endsWith(S2.refSuffix)) map.set(nameToLabel(t.nome), t);
    return map;
  }
  async function hoverTile(t) {
    t.el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    t.el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await NS.sleep(250);
  }
  async function abrirMenuDoTile(t) {
    await hoverTile(t);
    const btn = D2.$(S2.tileMoreButton, t.el) || [...t.el.querySelectorAll("button")].pop();
    if (!btn) throw new Error('botão "Mais opções" do tile não encontrado');
    D2.clicar(btn);
    const ok = await D2.esperar(() => D2.$$(S2.menuItem).length > 0, 2000);
    if (!ok) throw new Error("menu do tile não abriu");
    return D2.$$(S2.menuItem);
  }
  async function acharTile({ workflowId, mediaUuid, nome }) {
    let t = mediaUuid ? D2.findTileByMediaId(mediaUuid) : null;
    if (!t && workflowId) {
      const m = NS.media2.chegadas().find((x) => x.workflowId === workflowId);
      if (m) t = D2.findTileByMediaId(m.mediaId);
    }
    if (!t && nome) t = D2.findTileByName(nome);
    if (!t) {
      const sc = D2.getScroller();
      if (sc) {
        sc.scrollTop = 0;
        await NS.sleep(400);
      }
      t = mediaUuid ? D2.findTileByMediaId(mediaUuid) : nome ? D2.findTileByName(nome) : null;
    }
    return t;
  }

  async function uiRenameTile(ref, newName) {
    const t = await acharTile(ref);
    if (!t)
      return {
        ok: false,
        error:
          "tile não encontrado na galeria (" +
          (ref.mediaUuid || ref.workflowId || "").slice(0, 12) +
          "…)",
      };
    if (t.nome === newName) return { ok: true, idempotent: true };
    let rpcOk = false;
    const off =
      RPC && RPC.ativo
        ? RPC.on("*", (ev) => {
            if (JSON.stringify(ev.payload || "").includes(newName)) rpcOk = true;
          })
        : () => {};
    try {
      const itens = await abrirMenuDoTile(t);
      const ren = itens.find((e) => S2.menuLabels.rename.test(e.textContent || ""));
      if (!ren) {
        await D2.fecharOverlays();
        return { ok: false, error: "item Renomear não está no menu" };
      }
      D2.clicar(ren);
      const inp = await D2.esperar(() => D2.$(S2.tileRenameInput), 2500);
      if (!inp) return { ok: false, error: "campo de renomear não apareceu" };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(inp, newName);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      await NS.sleep(120);
      inp.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
      );
      const ok = await D2.esperar(
        () => rpcOk || (D2.findTileByMediaId(t.mediaId) || {}).nome === newName,
        4000,
      );
      if (!ok) {
        const done = [...document.querySelectorAll("button")].find(
          (b) => /^done$/.test((b.textContent || "").trim()) && b.offsetParent,
        );
        if (done) {
          D2.clicar(done);
          await D2.esperar(
            () => rpcOk || (D2.findTileByMediaId(t.mediaId) || {}).nome === newName,
            3000,
          );
        }
      }
      const final = rpcOk || (D2.findTileByMediaId(t.mediaId) || {}).nome === newName;
      return final
        ? { ok: true, via: rpcOk ? "rpc" : "dom" }
        : { ok: false, error: "rename não confirmou" };
    } finally {
      off();
      await D2.fecharOverlays();
    }
  }
  async function uiFavoriteTile(ref, favorited = true) {
    const t = await acharTile(ref);
    if (!t) return { ok: false, error: "tile não encontrado" };
    try {
      const itens = await abrirMenuDoTile(t);
      const fav = itens.find((e) => S2.menuLabels.favorite.test(e.textContent || ""));
      if (!fav) return { ok: false, error: "item Favorito não está no menu" };
      D2.clicar(fav);
      await NS.sleep(300);
      return { ok: true };
    } finally {
      await D2.fecharOverlays();
    }
  }

  async function promoteToReference({ workflowId, mediaUuid }, label) {
    const flowName = label + S2.refSuffix;
    const r = await uiRenameTile({ workflowId, mediaUuid }, flowName);
    if (!r.ok) throw new Error("promoteToReference: " + r.error);
    try {
      await uiFavoriteTile({ workflowId, mediaUuid }, true);
    } catch {}
    return { flowName, via: r.via || "ui" };
  }
  async function validateReferences(labels) {
    const disp = listAvailableRefs();
    const faltando = (labels || []).filter((l) => !disp.has(l));
    return { ok: faltando.length === 0, missing: faltando, available: [...disp.keys()] };
  }

  async function anexarPeloMais(nome) {
    if (!D2.$(S2.addMenuPopover)) {
      const b = D2.$(S2.addMenuButton);
      if (!b) throw new Error("botão + não encontrado (e o painel não estava aberto)");
      D2.clicar(b);
      await D2.esperar(() => D2.$(S2.addMenuPopover), 2500);
    }
    const pop = D2.$(S2.addMenuPopover);
    if (!pop) throw new Error("painel do + não abriu");
    const inp = D2.$(S2.addMenuSearch);
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      inp.focus();
      setter.call(inp, nome);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      await NS.sleep(500);
    }
    const alvo = String(nome).trim().toLowerCase();

    const textoDe = (it) => D2.rotulo(it).replace(/\s+/g, " ").trim().toLowerCase();
    const item = await D2.esperar(() => {
      const todos = D2.$$(S2.addMenuItem);
      return (
        todos.find((it) => textoDe(it) === alvo) ||
        todos.find((it) => {
          const t = (it.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          return t.startsWith(alvo) || t.includes(alvo);
        })
      );
    }, 15000);
    if (!item) {
      await D2.fecharOverlays();
      throw new Error('"' + nome + '" não apareceu na lista do +');
    }
    const contar = () => D2.$$(S2.qualquerChip).length;
    const antes = contar();
    D2.clicar(item.querySelector("button") || item);
    let ok = await D2.esperar(() => contar() > antes, 2500);
    if (!ok) {
      const inc = D2.$$(".cdk-overlay-container button").find((x) =>
        S2.menuLabels.includeInPrompt.test(x.textContent || ""),
      );
      if (inc) {
        D2.clicar(inc);
        ok = await D2.esperar(() => contar() > antes, 2500);
      }
    }
    await D2.fecharOverlays();
    if (!ok) throw new Error('"' + nome + '" não virou chip na caixa de comando');
    return true;
  }
  async function searchAndSelectRef(label) {
    return anexarPeloMais(label + S2.refSuffix).catch(() => anexarPeloMais(label));
  }
  async function attachImageRefViaAddPanel(workflowId, name = null, mediaUuid = null) {
    let nome = name;
    if (!nome) {
      const t = await acharTile({ workflowId, mediaUuid });
      nome = t && t.nome;
    }
    if (!nome) throw new Error("não sei o nome da imagem pra anexar pelo +");
    return anexarPeloMais(nome);
  }

  async function attachFrameByWorkflowId(
    workflowId,
    position = "inicial",
    name = null,
    mediaUuid = null,
  ) {
    await NS.menu2.configureGeneration({ type: "video", videoMode: "frames" });
    const slot = D2.$$('flow-base-prompt-box button, flow-base-prompt-box [role="button"]').find(
      (x) => (position === "final" ? /^fim$|^end$/i : /^in[íi]cio$|^start$/i).test(D2.rotulo(x)),
    );
    if (slot) {
      D2.clicar(slot);
      await D2.esperar(() => D2.$(S2.addMenuPopover), 2000);
    }
    return attachImageRefViaAddPanel(workflowId, name, mediaUuid);
  }

  async function abrirAbaDoMais(nomeDoIcone) {
    const nav = D2.$(S2.addMenuSideNav);
    if (!nav) return false;
    const ico = D2.$$("mat-icon", nav).find((i) => (i.textContent || "").trim() === nomeDoIcone);
    if (!ico) {
      log.warn('flow2: aba "' + nomeDoIcone + '" não está no menu do +');
      return false;
    }

    D2.clicar(ico.closest('mat-list-item,button,[role="button"],a,li') || ico.parentElement || ico);
    await NS.sleep(400);
    return true;
  }

  async function selectVoiceConsistent(voiceName) {
    if (!voiceName) return { ok: false, error: "sem nome de voz" };
    if (!D2.$(S2.addMenuPopover)) {
      const b = D2.$(S2.addMenuButton);

      if (!b) {
        const emFrames = D2.$$(S2.frameSlots).length > 0;
        return {
          ok: false,
          error: emFrames
            ? "voz não existe no modo Frames (use Elementos)"
            : "botão + não encontrado",
        };
      }
      D2.clicar(b);
      await D2.esperar(() => D2.$(S2.addMenuPopover), 2500);
    }
    if (!D2.$(S2.addMenuPopover)) return { ok: false, error: "painel do + não abriu" };
    await abrirAbaDoMais(S2.addMenuNavIcons.vozes);
    try {
      await anexarPeloMais(voiceName);
    } catch (e) {
      await D2.fecharOverlays();
      return { ok: false, error: e.message };
    }
    const chip = D2.$(S2.audioChip);
    if (!chip) return { ok: false, error: 'voz "' + voiceName + '" não virou chip de áudio' };
    const comErro = D2.$$("mat-icon", chip).some((i) => (i.textContent || "").trim() === "error");
    if (comErro) {
      log.warn(
        'flow2: voz "' +
          voiceName +
          '" anexada MAS em erro (voz sozinha não gera; falta outro elemento)',
      );
      return {
        ok: false,
        error: "voz precisa de outro elemento junto (imagem, referência ou personagem)",
        chipEmErro: true,
      };
    }
    log.info('flow2: voz "' + voiceName + '" anexada');
    return { ok: true };
  }

  async function urlDoVideoPeloMais(t) {
    const nome = t && t.nome;
    if (!nome) throw new Error("vídeo sem nome no tile");
    if (!D2.$(S2.addMenuPopover)) {
      const b = D2.$(S2.addMenuButton);
      if (!b) throw new Error("botão + não encontrado");
      D2.clicar(b);
      await D2.esperar(() => D2.$(S2.addMenuPopover), 2500);
    }
    await abrirAbaDoMais(S2.addMenuNavIcons.videos);
    const inp = D2.$(S2.addMenuSearch);
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      inp.focus();
      setter.call(inp, nome);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      await NS.sleep(500);
    }
    const alvo = String(nome).trim().toLowerCase();
    const item = await D2.esperar(
      () =>
        D2.$$(S2.addMenuItem).find((it) =>
          (it.textContent || "").replace(/\s+/g, " ").trim().toLowerCase().includes(alvo),
        ),
      15000,
    );
    if (!item) {
      await D2.fecharOverlays();
      throw new Error('"' + nome + '" não apareceu na aba Vídeos do +');
    }

    const acharVideo = () => {
      const x = D2.$(
        ".cdk-overlay-container flow-add-menu-detail-pane video, .cdk-overlay-container video",
      );
      return x && /\/video\//.test(x.currentSrc || x.src || "") ? x : null;
    };
    const chipsAntes = D2.$$(S2.ingredientChip).length;
    let v = await D2.esperar(acharVideo, 4000);
    if (!v) {
      D2.clicar(item);
      v = await D2.esperar(acharVideo, 8000);
    }
    const url = v ? v.currentSrc || v.src : null;
    await D2.fecharOverlays();
    const sobrou = D2.$$(S2.ingredientChip).slice(chipsAntes);
    for (const chip of sobrou) {
      const x =
        D2.$$("button", chip).find((b) =>
          D2.$$("mat-icon", b).some((i) => (i.textContent || "").trim() === "cancel"),
        ) ||
        D2.$$("button", chip).find((b) =>
          /remov|fechar|close/i.test(b.getAttribute("aria-label") || ""),
        );
      if (x) D2.clicar(x);
    }
    if (!url) throw new Error('o painel do + não montou o <video> de "' + nome + '"');
    return url;
  }

  async function renameTilePreferUi(ref, newName) {
    const r = await uiRenameTile(ref, newName);
    if (r.ok) {
      log.info('flow2: rename "' + newName + '" via UI');
      return { via: "ui" };
    }
    throw new Error("rename pela interface do Flow falhou: " + (r.error || "sem motivo"));
  }
  async function favoriteTilePreferUi(ref, favorited = true) {
    const r = await uiFavoriteTile(ref, favorited);
    if (r.ok) return { via: "ui" };
    throw new Error("favoritar pela interface do Flow falhou: " + (r.error || "sem motivo"));
  }
  async function uiDownloadTile(ref, sizeKey = "1K") {
    const t = await acharTile(ref);
    if (!t) return { ok: false, error: "tile não encontrado" };
    try {
      const itens = await abrirMenuDoTile(t);
      const dl = itens.find((e) => S2.menuLabels.download.test(e.textContent || ""));
      if (!dl) return { ok: false, error: "item de download não está no menu" };
      D2.clicar(dl);
      const want = String(sizeKey).toUpperCase();
      const sub = await D2.esperar(
        () =>
          D2.$$(S2.menuItem).find((e) =>
            (e.textContent || "").trim().toUpperCase().startsWith(want),
          ),
        2500,
      );
      if (!sub) return { ok: false, error: 'tamanho "' + sizeKey + '" não apareceu' };
      D2.clicar(sub);
      await NS.sleep(600);
      return { ok: true };
    } finally {
      await D2.fecharOverlays();
    }
  }
  function findProjectTitleInput() {
    return D2.$(S2.projectTitleInput);
  }
  async function uiRenameProjectTitle(title) {
    const inp = findProjectTitleInput();
    if (!inp) return { ok: false, error: "campo do título do projeto não encontrado" };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    inp.focus();
    setter.call(inp, title);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
    );
    inp.blur();
    await NS.sleep(400);
    return { ok: (findProjectTitleInput() || {}).value === title };
  }
  NS.refs2 = {
    parsePromptSegments,
    extractRefLabelsFromPrompt,
    nameToLabel,
    listAvailableRefs,
    validateReferences,
    searchAndSelectRef,
    uiRenameTile,
    uiFavoriteTile,
    promoteToReference,
    attachImageRefViaAddPanel,
    attachFrameByWorkflowId,
    selectVoiceConsistent,
    abrirAbaDoMais,
    urlDoVideoPeloMais,
    renameTilePreferUi,
    favoriteTilePreferUi,
    uiDownloadTile,
    findProjectTitleInput,
    uiRenameProjectTitle,
    anexarPeloMais,
    acharTile,
  };
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  if (!NS.FLOW_NOVO) return;
  const S2 = NS.S2,
    D2 = NS.dom2,
    E2 = NS.editor2,
    M2 = NS.menu2,
    R2 = NS.refs2,
    MED2 = NS.media2;
  const log = NS.log;
  const DRIVER_VERSION = (NS.adapter && NS.adapter.version) || "0";
  function diagnose() {
    const tiles = D2.listTiles();
    return {
      version: DRIVER_VERSION,
      flowNovo: true,
      url: location.href,
      projectId: D2.getProjectId(),
      editorPresent: !!D2.getEditor(),
      scrollerPresent: !!D2.getScroller(),
      tokenCaptured: true,
      promptText: E2.getPromptText(),
      tilesTotal: tiles.length,
      tilesLoaded: tiles.filter((t) => t.estado === "loaded").length,
      tilesPending: tiles.filter((t) => t.estado === "pending").length,
      refsAvailable: [...R2.listAvailableRefs().keys()],
      rpcs: NS.rpc2.historico().length,
      ts: new Date().toISOString(),
    };
  }
  const normText = (t) =>
    String(t || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  function findNewProjectButton() {
    const cands = [...document.querySelectorAll('button, a, [role="button"]')];
    return (
      cands.find((b) => S2.newProjectLabels.includes(normText(D2.rotulo(b)))) ||
      cands.find((b) =>
        S2.newProjectLabels.some((l) => normText(b.getAttribute("aria-label") || "").includes(l)),
      ) ||
      cands.find((b) => S2.newProjectLabels.some((l) => normText(b.textContent).includes(l))) ||
      null
    );
  }
  async function createProject({ timeoutMs = 25000 } = {}) {
    const before = D2.getProjectId();
    const btn = findNewProjectButton();
    if (!btn) return { ok: false, error: 'botão "Novo projeto" não encontrado' };
    D2.clicar(btn);
    const pid = await D2.esperar(
      () => {
        const p = D2.getProjectId();
        return p && p !== before ? p : null;
      },
      timeoutMs,
      250,
    );
    if (!pid) return { ok: false, error: "projeto novo não abriu a tempo" };
    await D2.esperar(() => D2.getEditor(), 10000, 250);
    return { ok: true, projectId: pid, url: location.href };
  }
  async function renameProject(title) {
    return R2.uiRenameProjectTitle(title);
  }
  function dataUrlToFile(dataUrl, name) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
    if (!m) throw new Error("dataUrl inválida");
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name || "imagem", { type: m[1] });
  }

  async function insertPromptContent(prompt, labels) {
    const segs = R2.parsePromptSegments(prompt);
    const texto = segs
      .map((s) => (s.type === "text" ? s.value : s.label))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const refs = labels || R2.extractRefLabelsFromPrompt(prompt);
    for (const l of refs) {
      try {
        await R2.searchAndSelectRef(l);
      } catch (e) {
        log.warn('flow2: referência "' + l + '": ' + e.message);
      }
    }
    await E2.setPrompt(texto);
  }
  async function prepareAndSubmit({ prompt, refLabels = null, expectedCount = 1, kind = "image" }) {
    await insertPromptContent(prompt, refLabels);
    const bilhete = MED2.novoBilhete(prompt, expectedCount, kind);
    await NS.sleep(300);
    await E2.clickSubmit();
    return { beforeTileIds: new Set(), bilhete };
  }
  async function submitAndCapture({ prompt, refLabels = null, expectedCount = 1 }) {
    if (!prompt || !prompt.trim()) throw new Error("prompt vazio");
    const { bilhete } = await prepareAndSubmit({ prompt, refLabels, expectedCount });
    return { tileIds: [bilhete], expected: expectedCount };
  }
  async function submitVideoAndCapture({
    prompt,
    refLabels = null,
    expectedCount = 1,
    videoMode = "elements",
    voiceName = null,
    imageRefWorkflowId = null,
    imageRefName = null,
    imageRefMediaUuid = null,
  }) {
    if (!prompt || !prompt.trim()) throw new Error("prompt vazio");
    if (voiceName && videoMode === "frames") {
      log.warn("flow2: voz com modo Frames — trocando pra Elementos");
      videoMode = "elements";
    }
    if (imageRefWorkflowId || imageRefMediaUuid) {
      if (videoMode === "frames")
        await R2.attachFrameByWorkflowId(
          imageRefWorkflowId,
          "inicial",
          imageRefName,
          imageRefMediaUuid,
        );
      else await R2.attachImageRefViaAddPanel(imageRefWorkflowId, imageRefName, imageRefMediaUuid);
    }
    if (voiceName) {
      try {
        const v = await R2.selectVoiceConsistent(voiceName);
        if (v && !v.ok) log.warn('flow2: voz "' + voiceName + '" NÃO entrou: ' + v.error);
      } catch (e) {
        log.warn("flow2: voz: " + e.message);
      }
    }
    const { bilhete } = await prepareAndSubmit({ prompt, refLabels, expectedCount, kind: "video" });
    return { tileIds: [bilhete], expected: expectedCount };
  }

  async function soltarArquivo(file) {
    const alvo = D2.getScroller() || document.querySelector("main") || document.body;
    const dt = new DataTransfer();
    dt.items.add(file);
    const r = alvo.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: dt,
      clientX: Math.round(r.left + r.width / 2),
      clientY: Math.round(r.top + r.height / 2),
    };
    for (const tipo of ["dragenter", "dragover", "drop"]) {
      alvo.dispatchEvent(new DragEvent(tipo, base));
      await new Promise((r2) => setTimeout(r2, 60));
    }
    return alvo;
  }
  async function uploadSubmitId(file) {
    const input =
      D2.$(S2.addMenuUpload) ||
      (await (async () => {
        const b = D2.$(S2.addMenuButton);
        if (b) {
          D2.clicar(b);
          await D2.esperar(() => D2.$(S2.addMenuPopover), 2000);
        }
        return D2.$(S2.addMenuUpload);
      })());
    const antes = D2.snapshotIds();
    if (input) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      log.info("flow2/upload: sem input[type=file] — soltando o arquivo na galeria");
      await soltarArquivo(file);
    }
    await D2.fecharOverlays();
    const t0 = Date.now();
    const novo = await D2.esperar(
      () =>
        D2.listTiles().find((t) => t.mediaId && !antes.has(t.mediaId)) ||
        MED2.chegadas().find((m) => m.t >= t0 && !antes.has(m.mediaId)) ||
        null,
      30000,
      400,
    );
    if (!novo) throw new Error("upload não criou mídia (timeout)");
    return { tileId: novo.mediaId };
  }
  async function uploadImageAndCapture(file, opts) {
    const { tileId } = await uploadSubmitId(file, opts);
    const t = await D2.esperar(
      () => {
        const x = D2.findTileByMediaId(tileId);
        return x && x.estado === "loaded" ? x : null;
      },
      30000,
      400,
    );
    const m = MED2.chegadas().find((x) => x.mediaId === tileId);
    return {
      tileId,
      workflowId: (m && m.workflowId) || tileId,
      mediaUuid: tileId,
      url: (t && t.url) || (m && m.url) || null,
    };
  }
  async function generate(o) {
    let {
      type = "image",
      prompt,
      variants = 1,
      refLabels = null,
      videoMode = "elements",
      voiceName = null,
      imageRefWorkflowId = null,
      imageRefName = null,
      imageRefMediaUuid = null,
      aspectRatio = null,
      duration = null,
      model = null,
      onProgress = null,
    } = o;

    if (type === "video" && voiceName && videoMode === "frames") {
      log.warn(
        'flow2: voz "' +
          voiceName +
          '" pedida com modo Frames — trocando pra Elementos (o Flow novo não tem voz em Frames)',
      );
      videoMode = "elements";
    }
    log.info(
      "flow2/generate: " + type + " x" + variants + ' "' + String(prompt || "").slice(0, 50) + '…"',
    );
    try {
      await M2.configureGeneration({
        type,
        variants,
        aspectRatio,
        model,
        videoMode: type === "video" ? videoMode : null,
        duration: type === "video" ? duration : null,
      });
    } catch (e) {
      log.warn("flow2: configureGeneration falhou: " + e.message);
    }
    if (type === "video" && (imageRefWorkflowId || imageRefMediaUuid)) {
      if (videoMode === "frames")
        await R2.attachFrameByWorkflowId(
          imageRefWorkflowId,
          "inicial",
          imageRefName,
          imageRefMediaUuid,
        );
      else await R2.attachImageRefViaAddPanel(imageRefWorkflowId, imageRefName, imageRefMediaUuid);
    }
    if (type === "video" && voiceName) {
      try {
        const v = await R2.selectVoiceConsistent(voiceName);
        if (v && !v.ok) log.warn('flow2: voz "' + voiceName + '" NÃO entrou: ' + v.error);
      } catch (e) {
        log.warn("flow2: voz: " + e.message);
      }
    }
    const { bilhete } = await prepareAndSubmit({ prompt, refLabels, expectedCount: variants });
    const res = await MED2.waitForResults({ slots: variants, bilhete, onProgress });
    log.info(
      "flow2/generate: " + res.results.filter((r) => !r.failed).length + "/" + variants + " ok",
    );
    return res;
  }
  async function renameMediaUi(ref, name) {
    return R2.uiRenameTile(ref, name);
  }
  async function renameMediaApiImpl(ref, name) {
    const r = await R2.uiRenameTile(ref, name);
    return r.ok ? { ok: true, via: "ui" } : { ok: false, error: r.error };
  }
  NS.adapter2 = {
    version: DRIVER_VERSION,
    flowNovo: true,
    diagnose,
    getToken: () => "cookie",
    listLoaded: () => MED2.listLoadedResults(),
    listRefs: () => [...R2.listAvailableRefs().keys()],
    captureAtDom: async () => ({ ok: false, error: "não se aplica ao Flow novo" }),
    isProjectEmpty: () => D2.isProjectEmpty(),
    createProject,
    findNewProjectButton,
    renameProject,
    setPrompt: (t) => E2.setPrompt(t),
    clearPrompt: () => E2.clearEditor(),
    resetEditor: () => E2.resetEditor(),
    getPromptText: () => E2.getPromptText(),
    submit: () => E2.clickSubmit(),
    isAgentActive: () => E2.isAgentActive(),
    ensureAgentOff: () => E2.ensureAgentOff(),
    configureGeneration: (cfg) => M2.configureGeneration(cfg),
    readConfig: () => M2.readCurrentConfig(),
    setMediaType: (t) => M2.setMediaType(t),
    setVideoMode: (m) => M2.setVideoMode(m),
    setAspectRatio: (r) => M2.setAspectRatio(r),
    setVariantCount: (n) => M2.setVariantCount(n),
    setModel: (n) => M2.setModel(n),
    setDuration: (s) => M2.setDuration(s),
    listModels: (t) => M2.listModels(t),
    insertRef: (label) => R2.searchAndSelectRef(label),
    validateRefs: (labels) => R2.validateReferences(labels),
    promoteToReference: (ids, label) => R2.promoteToReference(ids, label),
    renameMedia: (ids, name) => renameMediaUi(ids, name),
    renameMediaApi: (ids, name) => renameMediaApiImpl(ids, name),
    downloadSized: (ids, size) => R2.uiDownloadTile(ids, size),
    attachFrame: (id, pos) => R2.attachFrameByWorkflowId(id, pos),
    attachImageRef: (id) => R2.attachImageRefViaAddPanel(id),
    selectVoice: (name) => R2.selectVoiceConsistent(name),
    snapshot: () => D2.snapshotIds(),
    waitForResults: (a) => MED2.waitForResults(a),
    prepareAndSubmit,
    generate,
    submitAndCapture: (a) => submitAndCapture(a),
    submitVideoAndCapture: (a) => submitVideoAndCapture(a),
    waitForTileIds: (a) => MED2.waitForTileIds(a),
    resolveVideoUrl: (ref) => MED2.resolveVideoUrl(ref),
    sobrecarga: () => D2.sobrecargaDoFlow(),
    uploadImage: (file, opts) => uploadImageAndCapture(file, opts),
    uploadSubmit: (file, opts) => uploadSubmitId(file, opts),
    uploadImageAndCapture,
    dataUrlToFile,
  };
  NS.adapterAntigo = NS.adapter;
  NS.adapter = NS.adapter2;
  log.info("adapter2 (Flow novo) v" + DRIVER_VERSION + " assumiu em " + location.hostname);
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const { dynamicSleep, log } = NS;
  const A = () => NS.adapter;
  const VERSION = "0.2.0";

  let _running = false;
  let _cancel = false;
  const _subs = {};

  function on(event, cb) {
    (_subs[event] = _subs[event] || new Set()).add(cb);
    return () => _subs[event]?.delete(cb);
  }
  function emit(event, payload) {
    _subs[event]?.forEach((cb) => {
      try {
        cb(payload);
      } catch {}
    });
  }

  function normalizeSpec(spec) {
    if (!spec || typeof spec !== "object") throw new Error("spec inválido");
    const prompt = (spec.prompt || "").trim();
    if (!prompt) throw new Error("prompt vazio");
    let variants = Number(spec.variants || 1);
    if (!Number.isInteger(variants)) variants = Math.round(variants) || 1;
    variants = Math.max(1, Math.min(4, variants));
    return {
      type: spec.type === "video" ? "video" : "image",
      prompt,
      variants,
      refs: Array.isArray(spec.refs) ? spec.refs : null,
      aspectRatio: spec.aspectRatio || null,
      model: spec.model || null,
      retries: Number.isInteger(spec.retries) ? Math.max(1, spec.retries) : 3,
      video: spec.video || {},
      onProgress: typeof spec.onProgress === "function" ? spec.onProgress : null,
    };
  }

  function buildResult(res, spec, attempts) {
    const results = (res && res.results) || [];
    const okCount = results.filter((r) => !r.failed).length;
    return {
      ok: okCount > 0,
      type: spec.type,
      prompt: spec.prompt,
      variants: spec.variants,
      attempts,
      completed: !!(res && res.completed),
      okCount,
      failCount: results.length - okCount,
      results,
    };
  }

  async function generate(rawSpec) {
    const spec = normalizeSpec(rawSpec);
    if (_running) throw new Error("já existe uma geração em andamento (service ocupado)");
    _running = true;
    _cancel = false;
    log.info(
      `service.generate: ${spec.type} × ${spec.variants} (até ${spec.retries} tentativa(s))`,
    );

    try {
      let last = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= spec.retries; attempt++) {
        if (_cancel) {
          log.warn("service.generate: cancelado");
          break;
        }
        emit("attempt", { attempt, retries: spec.retries });

        try {
          const res = await A().generate({
            type: spec.type,
            prompt: spec.prompt,
            variants: spec.variants,
            refLabels: spec.refs,
            aspectRatio: spec.aspectRatio,
            model: spec.model,
            videoMode: spec.video.mode || "elements",
            voiceName: spec.video.voice || null,
            imageRefWorkflowId: spec.video.frameImageId || null,
            imageRefName: spec.video.frameImageName || null,
            imageRefMediaUuid: spec.video.frameImageUuid || null,
            duration: spec.video.duration || null,
            onProgress: (p) => {
              const prog = { ...p, attempt };
              emit("progress", prog);
              spec.onProgress?.(prog);
            },
          });
          last = res;
          const okCount = (res.results || []).filter((r) => !r.failed).length;
          if (okCount > 0) {
            const out = buildResult(res, spec, attempt);
            if (attempt > 1) log.info(`service.generate: OK na tentativa ${attempt}`);
            emit("done", out);
            return out;
          }
          log.warn(`service.generate: tentativa ${attempt} sem variantes OK`);
        } catch (e) {
          lastErr = e;
          log.error(`service.generate: tentativa ${attempt} erro: ${e?.message || e}`);
        }

        if (attempt < spec.retries && !_cancel) {
          try {
            await A().resetEditor();
          } catch (e) {
            log.warn("resetEditor entre tentativas falhou:", e.message);
          }
          await dynamicSleep([1200, 2000]);
        }
      }

      if (last) {
        const out = buildResult(last, spec, spec.retries);
        emit("done", out);
        return out;
      }
      const err = lastErr || new Error("geração falhou sem produzir resultado");
      emit("error", { error: err.message });
      throw err;
    } finally {
      _running = false;
    }
  }

  async function promoteReference(tile, name) {
    const label = (name || "").trim();
    if (!label) return { ok: false, error: "nome da referência vazio" };
    try {
      const r = await A().promoteToReference(tile, label);
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function uploadReference(file, name) {
    const label = (name || "").trim();
    if (!file) return { ok: false, error: "arquivo ausente" };
    if (!label) return { ok: false, error: "nome da referência vazio" };
    try {
      const tile = await A().uploadImage(file);
      const r = await A().promoteToReference(
        { workflowId: tile.workflowId, mediaUuid: tile.mediaUuid },
        label,
      );
      log.info(`uploadReference: "${file.name}" → "${r.flowName}"`);
      return { ok: true, name: label, tile, ...r };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function uploadSubmit(file) {
    if (!file) throw new Error("arquivo ausente");
    const r = await A().uploadSubmit(file);
    return { tileId: r.tileId };
  }

  async function uploadAwait(ticket, name) {
    try {
      const res = await A().waitForTileIds({ tileIds: [ticket.tileId], expected: 1 });
      const r = (res.results || [])[0];
      if (!r || r.failed)
        return {
          ok: false,
          error: r?.failedReason || "upload não carregou",
          errorType: r?.errorType || "other",
        };
      return {
        ok: true,
        name: (name || "").trim(),
        url: r.url,
        workflowId: r.workflowId,
        mediaUuid: r.mediaUuid,
      };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function renameMedia(ref, name) {
    try {
      return await A().renameMedia(ref, name);
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function renameMediaApi(ref, name) {
    try {
      return await A().renameMediaApi(ref, name);
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function downloadSized(ref, size) {
    try {
      return await A().downloadSized(ref, size);
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function listModels(type) {
    try {
      return (await A().listModels(type)) || [];
    } catch (e) {
      return [];
    }
  }

  async function applyConfig(cfg) {
    return A().configureGeneration(cfg);
  }

  async function submit({ prompt, refLabels = null, expectedCount = 1 }) {
    const r = await A().submitAndCapture({ prompt, refLabels, expectedCount });
    return { tileIds: r.tileIds, expected: r.expected };
  }

  async function submitVideo(rawSpec) {
    const spec = normalizeSpec(rawSpec);
    const r = await A().submitVideoAndCapture({
      prompt: spec.prompt,
      refLabels: spec.refs,
      expectedCount: spec.variants || 1,
      videoMode: spec.video.mode || "elements",
      voiceName: spec.video.voice || null,
      imageRefWorkflowId: spec.video.frameImageId || null,
      imageRefName: spec.video.frameImageName || null,
      imageRefMediaUuid: spec.video.frameImageUuid || null,
    });
    return { tileIds: r.tileIds, expected: r.expected };
  }

  async function awaitTiles(ticket, opts = {}) {
    const res = await A().waitForTileIds({
      tileIds: ticket.tileIds,
      expected: ticket.expected,
      onProgress: opts.onProgress,
    });
    const results = res.results || [];
    const okCount = results.filter((r) => !r.failed).length;
    let errorType = null;
    if (results.some((r) => r.errorType === "unusual_activity")) errorType = "unusual_activity";
    else if (results.some((r) => r.errorType === "rate_limit")) errorType = "rate_limit";
    else if (results.some((r) => r.failed))
      errorType = results.find((r) => r.failed && r.errorType)?.errorType || "other";
    return {
      ok: okCount > 0,
      okCount,
      failCount: results.length - okCount,
      completed: res.completed,
      results,
      errorType,
    };
  }

  NS.service = {
    version: VERSION,
    generate,
    promoteReference,
    uploadReference,
    uploadSubmit,
    uploadAwait,
    renameMedia,
    renameMediaApi,
    downloadSized,
    listModels,
    applyConfig,
    submit,
    submitVideo,
    awaitTiles,
    cancel: () => {
      _cancel = true;
    },
    isRunning: () => _running,
    on,
  };

  log.info("service v" + VERSION + " pronto");
})();

(() => {
  const NS = (window.FlowAuto = window.FlowAuto || {});
  const { dynamicSleep, sleep, log } = NS;
  const S = () => NS.service;
  const VERSION = "0.15.0";

  const MAX_RATE_RETRIES = 8;
  const MAX_ATTEMPTS = 3;

  const AUTO_RETRY_MIN = [2, 4, 8, 15, 15, 15, 15, 15, 15, 15, 15, 15];
  let _autoRetryDelays = AUTO_RETRY_MIN.map((m) => m * 60000);

  let _sobrecargaEsperaMs = 60000;
  const sobrecargaDoFlow = () => {
    try {
      return !!(NS.dom2 && NS.dom2.sobrecargaDoFlow && NS.dom2.sobrecargaDoFlow());
    } catch (_) {
      return false;
    }
  };
  const RESTORE_AFTER = 2;
  const THROTTLE_MULT = 1.5;
  const MAX_INTERVAL = 45000;
  const MAX_UPLOAD_CONC = 15;
  const MAX_RENAME_LAG = 10;
  const MAX_RENAME_ATTEMPTS = 3;

  const RELOAD_PRE_DELAY = 6000;

  const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
  const pickMs = (r) => {
    const [a, b] = Array.isArray(r) ? r : [r, r];
    return Math.round(a + Math.random() * Math.max(0, b - a));
  };

  const docFocused = () => {
    try {
      return document.hasFocus();
    } catch {
      return true;
    }
  };

  let _seq = 0;
  const jobs = [];
  let _paused = false;
  let _pumping = false;
  let inFlight = 0;
  let successStreak = 0;
  const renameQueue = [];
  let _renaming = false;

  let _renameFallback = "api";

  let _renameEager = false;
  function setRenameEager(on) {
    _renameEager = !!on;
  }
  const _apiRenamedNames = new Set();
  let _reloading = false;
  let submitCount = 0;

  const canRenameNow = () => docFocused() || _renameFallback === "api";

  let _pendingWorkFn = null;
  const hasPendingWork = () => {
    try {
      return !!(_pendingWorkFn && _pendingWorkFn());
    } catch {
      return false;
    }
  };
  function setPendingWork(fn) {
    _pendingWorkFn = typeof fn === "function" ? fn : null;
  }

  let targetConcurrency = 2;
  let effConcurrency = 2;

  let baseInterval = [1500, 2500];
  let effInterval = [1500, 2500];

  let uploadConcurrency = 5;
  let uploadInterval = [800, 1800];

  const _subs = {};
  const on = (ev, cb) => {
    (_subs[ev] = _subs[ev] || new Set()).add(cb);
    return () => _subs[ev]?.delete(cb);
  };
  const emit = (ev, payload) => {
    _subs[ev]?.forEach((cb) => {
      try {
        cb(payload);
      } catch {}
    });
    _subs["*"]?.forEach((cb) => {
      try {
        cb(ev, payload);
      } catch {}
    });
  };

  let _lastFailure = null;
  function status() {
    return {
      lastFailure: _lastFailure,
      target: targetConcurrency,
      effective: effConcurrency,
      baseInterval: baseInterval.slice(),
      effInterval: effInterval.slice(),
      uploadConcurrency,
      uploadInterval: uploadInterval.slice(),
      inFlight,
      pending: jobs.filter((j) => j.status === "queued").length,
      renames: renameQueue.length,
      renaming: _renaming,
      renameFallback: _renameFallback,
      apiRenames: _apiRenamedNames.size,
      reloading: _reloading,

      paused: _paused,
      pumping: _pumping,

      autoRetrying: jobs.filter((j) => j.status === "failed" && j.retryAt).length,
      esperandoSobrecarga: jobs.filter(
        (j) => j.status === "queued" && j.retryAt && j.retryAt > Date.now(),
      ).length,
      proximaTentativaEm: (() => {
        const ts = jobs.filter((j) => j.retryAt && j.retryAt > Date.now()).map((j) => j.retryAt);
        return ts.length ? Math.min(...ts) - Date.now() : null;
      })(),
    };
  }

  function makeJob(input) {
    const id = "job_" + ++_seq;
    const o =
      input && (input.spec || input.kind || input.tile || input.file) ? input : { spec: input };
    const kind = o.kind || (o.file ? "upload" : o.tile ? "promote" : "generate");
    const job = {
      id,
      kind,
      status: "queued",
      attempts: 0,
      rateRetries: 0,
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      onDone: typeof o.onDone === "function" ? o.onDone : null,
    };
    if (kind === "promote") {
      job.tile = o.tile;
      job.name = o.name;
      job.label = o.label || "promover " + (o.name || "");
    } else if (kind === "upload") {
      job.file = o.file;
      job.name = o.name;
      job.graphNodeId = o.graphNodeId || null;
      job.sceneUpload = !!o.sceneUpload;
      job.sceneNumber = o.sceneNumber != null ? o.sceneNumber : null;
      job.label = o.label || "upload: " + (o.name || o.file?.name || "");
    } else {
      job.spec = o.spec;
      job.label = o.label || ((o.spec && o.spec.prompt) || "").slice(0, 48);
      job.priority = !!(o.spec && o.spec.priority);
    }
    return job;
  }
  function enqueue(input) {
    const job = makeJob(input);
    jobs.push(job);
    log.info(`fila: + ${job.id} (${job.kind}) "${job.label}"`);
    emit("enqueued", { job });
    emit("change");
    kick();
    return job;
  }
  function enqueueMany(arr) {
    return (arr || []).map(enqueue);
  }

  const prontoPraIr = (j) => j.status === "queued" && (!j.retryAt || j.retryAt <= Date.now());
  const nextQueued = () => jobs.find((j) => prontoPraIr(j) && j.priority) || jobs.find(prontoPraIr);
  function list() {
    return jobs.map((j) => {
      const { onDone, ...rest } = j;
      return rest;
    });
  }

  function jobConfig(job) {
    const s = job.spec || {};
    const cfg = { type: s.type || "image", variants: s.variants || 1 };
    if (s.aspectRatio) cfg.aspectRatio = s.aspectRatio;
    if (s.model) cfg.model = s.model;
    if ((s.type || "image") === "video") {
      if (s.video?.mode) cfg.videoMode = s.video.mode;
      if (s.video?.duration) cfg.duration = s.video.duration;
    }
    return cfg;
  }

  function throttleDown() {
    const bc = effConcurrency,
      bi = effInterval.slice();
    effConcurrency = Math.max(1, effConcurrency - 1);
    effInterval = [
      Math.min(MAX_INTERVAL, Math.round(effInterval[0] * THROTTLE_MULT)),
      Math.min(MAX_INTERVAL, Math.round(effInterval[1] * THROTTLE_MULT)),
    ];
    if (effConcurrency !== bc || effInterval[0] !== bi[0]) {
      log.warn(
        `throttle (rate-limit): simult ${bc}→${effConcurrency}, intervalo ${effInterval[0]}-${effInterval[1]}ms`,
      );
      emit("throttle", status());
      emit("change");
    }
  }
  function maybeRestore() {
    if (successStreak <= 0 || successStreak % RESTORE_AFTER !== 0) return;
    let changed = false;
    if (effConcurrency < targetConcurrency) {
      effConcurrency++;
      changed = true;
    }
    if (effInterval[0] > baseInterval[0] || effInterval[1] > baseInterval[1]) {
      effInterval = [
        Math.max(baseInterval[0], Math.round(effInterval[0] / THROTTLE_MULT)),
        Math.max(baseInterval[1], Math.round(effInterval[1] / THROTTLE_MULT)),
      ];
      changed = true;
    }
    if (changed) {
      log.info(
        `restore: simult ${effConcurrency}, intervalo ${effInterval[0]}-${effInterval[1]}ms`,
      );
      emit("throttle", status());
      emit("change");
      kick();
    }
  }

  function agendarNovaRodada(job, motivo) {
    job.autoRound = (job.autoRound || 0) + 1;
    const delay = _autoRetryDelays[job.autoRound - 1];
    job.status = "failed";
    if (delay == null) {
      job.retryAt = null;
      job.error =
        motivo +
        " (desisti depois de " +
        MAX_ATTEMPTS * (_autoRetryDelays.length + 1) +
        " tentativas; clique em tentar de novo quando quiser)";
      log.info(`fila: ✗ ${job.id} (${job.error})`);
      _lastFailure = { id: job.id, error: job.error, at: Date.now() };
      emit("job:failed", { job });
      return;
    }
    job.error = motivo;
    job.retryAt = Date.now() + delay;
    job.attempts = 0;
    _lastFailure = { id: job.id, error: job.error, at: Date.now() };
    log.warn(
      `fila: ✗ ${job.id} falhou ${MAX_ATTEMPTS}x (${motivo}); tento de novo em ${Math.round(delay / 60000)} min (rodada ${job.autoRound}/${_autoRetryDelays.length}) — continuo tentando`,
    );
    emit("job:failed", {
      job,
      retryAt: job.retryAt,
      autoRound: job.autoRound,
      autoMax: _autoRetryDelays.length,
    });
    setTimeout(() => retryNow(job.id, true), delay);
  }
  function retryNow(id, auto) {
    const j = jobs.find((x) => x.id === id);
    if (!j || j.status !== "failed") return false;
    j.status = "queued";
    j.retryAt = null;
    j.attempts = 0;
    log.info(
      `fila: ↻ ${j.id} ${auto ? "nova rodada automática (" + j.autoRound + ")" : "tentar de novo (pedido)"}`,
    );
    emit("job:requeued", { job: j, auto: !!auto });
    emit("change");
    kick();
    return true;
  }

  function onJobResolved(job, res) {
    inFlight = Math.max(0, inFlight - 1);
    if (job.status === "cancelled") {
      emit("change");
      kick();
      return;
    }
    job.result = res;
    job.finishedAt = Date.now();

    if (res && res.ok) {
      job.status = "done";
      job.attempts = (job.attempts || 0) + 1;
      successStreak++;
      log.info(`fila: ✓ ${job.id} (${res.okCount}/${job.spec?.variants ?? "?"} ok)`);
      emit("job:done", { job });
      maybeRestore();
    } else if (res && (res.errorType === "rate_limit" || res.errorType === "unusual_activity")) {
      successStreak = 0;
      throttleDown();
      job.rateRetries = (job.rateRetries || 0) + 1;
      if (job.rateRetries <= MAX_RATE_RETRIES) {
        job.status = "queued";
        log.warn(
          `fila: ⏳ ${job.id} ${res.errorType} → re-enfileirado (${job.rateRetries}) + throttle`,
        );
        emit("job:requeued", { job });
      } else {
        job.status = "failed";
        job.error = res.errorType + " persistente";
        _lastFailure = { id: job.id, error: job.error, at: Date.now() };
        emit("job:failed", { job });
      }
    } else if (res?.errorType !== "policy" && sobrecargaDoFlow()) {
      successStreak = 0;
      job.rateRetries = (job.rateRetries || 0) + 1;
      job.status = "queued";
      job.retryAt = Date.now() + _sobrecargaEsperaMs;
      job.sobrecarga = true;
      log.warn(
        `fila: ⏳ ${job.id} o Flow está sobrecarregado (aviso do Google) → tento de novo em ${Math.round(_sobrecargaEsperaMs / 1000)} s (${job.rateRetries})`,
      );
      emit("job:requeued", { job, sobrecarga: true, retryAt: job.retryAt });
      setTimeout(kick, _sobrecargaEsperaMs + 50);
    } else {
      job.attempts = (job.attempts || 0) + 1;
      if (job.attempts < MAX_ATTEMPTS) {
        job.status = "queued";
        log.warn(
          `fila: ↻ ${job.id} tentativa ${job.attempts}/${MAX_ATTEMPTS} (${res?.errorType || "erro"})`,
        );
        emit("job:requeued", { job });
      } else if (res?.errorType === "policy") {
        job.status = "failed";
        job.retryAt = null;
        job.error = `bloqueio de política (após ${MAX_ATTEMPTS} tentativas)`;
        log.info(`fila: ✗ ${job.id} (${job.error})`);
        _lastFailure = { id: job.id, error: job.error, at: Date.now() };
        emit("job:failed", { job });
      } else {
        agendarNovaRodada(job, (res && res.error) || res?.errorType || "falhou");
      }
    }
    emit("change");
    kick();
  }

  function enqueueRename(task) {
    if (!task || !task.ref || !task.name) return null;

    const t = {
      ...task,
      attempts: 0,
      submitSeq: task.submitSeq != null ? task.submitSeq : submitCount,
    };
    renameQueue.push(t);
    emit("change");
    kick();
    return t;
  }
  function clearRenames() {
    renameQueue.length = 0;
    emit("change");
  }

  async function requestWindowFocus() {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) return;
      await new Promise((res) => {
        try {
          chrome.runtime.sendMessage({ type: "fa-focus-window" }, () => {
            void chrome.runtime.lastError;
            res();
          });
        } catch {
          res();
        }
      });
    } catch {}
  }
  async function drainOneRename() {
    if (_paused || !renameQueue.length) return false;
    if (!docFocused()) {
      if (_renameFallback === "focus") {
        await requestWindowFocus();
        await sleep(350);
        if (!docFocused()) return false;
      }

      if (_renameFallback === "wait" && renameQueue[0] && renameQueue[0]._triedNoFocus)
        return false;
    }
    const t = renameQueue.shift();
    _renaming = true;
    emit("rename:start", { task: t });
    emit("change");
    let res = null,
      via = null;
    try {
      if (docFocused() || _renameFallback === "wait") {
        res = await S().renameMedia(t.ref, t.name);
        if (res && res.ok) via = "ui";
      }
      if ((!res || !res.ok) && _renameFallback === "api") {
        res = await S().renameMediaApi(t.ref, t.name);
        if (res && res.ok) via = "api";
      }
    } catch (e) {
      res = { ok: false, error: e.message };
    }
    _renaming = false;
    if (res && res.ok) {
      if (via === "api") _apiRenamedNames.add(t.name);
      t._triedNoFocus = false;
      log.info(`rename ✓ "${t.name}" (${via})`);
      emit("rename:done", { task: t });
    } else if (_renameFallback === "wait" && !docFocused()) {
      t._triedNoFocus = true;
      renameQueue.unshift(t);
      log.info(`rename ⏳ "${t.name}" — tentou sem foco e não comitou; aguardando foco da aba`);
      emit("change");
      return false;
    } else {
      t.attempts = (t.attempts || 0) + 1;
      if (t.attempts < MAX_RENAME_ATTEMPTS) {
        renameQueue.push(t);
        log.warn(`rename ↻ "${t.name}" (${res?.error || "falhou"})`);
      } else {
        log.warn(`rename ✗ "${t.name}" (${res?.error || "falhou"})`);
        emit("rename:failed", { task: t, error: res?.error });
      }
    }
    emit("change");
    return true;
  }

  async function drainOverdueRenames() {
    while (
      !_paused &&
      canRenameNow() &&
      renameQueue.length &&
      submitCount + 1 - (renameQueue[0].submitSeq || 0) >= MAX_RENAME_LAG
    ) {
      await drainOneRename();
    }
  }

  async function interSubmitDelay(interval) {
    const budget = pickMs(interval);
    let spent = 0;
    while (!_paused && canRenameNow() && renameQueue.length && spent < budget) {
      const t0 = Date.now();
      await drainOneRename();
      spent += Date.now() - t0;
    }
    const rem = budget - spent;
    if (rem > 0) await sleep(rem);
  }

  function jobHasRefDeps(job) {
    if (!job || job.kind !== "generate") return false;
    const s = job.spec || {};
    return /\[[^\]]+\]/.test(s.prompt || "") || !!(s.video && s.video.frameImageId);
  }

  function jobUsesApiRenamedName(job) {
    if (!_apiRenamedNames.size || !job || job.kind !== "generate") return false;
    const s = job.spec || {};
    const text = s.prompt || "";
    for (const name of _apiRenamedNames) {
      if (text.includes("[" + name + "]")) return true;
      if (s.video && s.video.frameImageName === name) return true;
    }
    return false;
  }

  let _reloadGen = 0;

  async function reloadAndContinue() {
    if (_reloading) return;
    _reloading = true;

    const gen = ++_reloadGen;
    const cancelado = () => !_reloading || gen !== _reloadGen;

    _armarWatchdogReload();
    log.info("reload: aguardando em-voo + drenando renames antes de recarregar…");
    emit("reloading");
    emit("change");
    let g = 0;
    while (inFlight > 0 && g++ < 600) {
      if (cancelado()) return;
      await sleep(500);
    }
    g = 0;
    while (renameQueue.length && g++ < 300) {
      if (cancelado()) return;
      if (!(await drainOneRename())) break;
    }
    if (cancelado()) {
      log.info("reload: cancelado pelo watchdog — não recarrego");
      return;
    }

    log.info(`reload: aguardando ${RELOAD_PRE_DELAY}ms p/ o servidor propagar os renames…`);
    await sleep(RELOAD_PRE_DELAY);

    let late = 0;
    g = 0;
    while (renameQueue.length && g++ < 300) {
      if (cancelado()) return;
      if (!(await drainOneRename())) break;
      late++;
    }
    if (late) {
      log.info(`reload: ${late} rename(s) retardatário(s) drenado(s) — aguardando propagar…`);
      await sleep(RELOAD_PRE_DELAY);
    }
    if (cancelado()) {
      log.info("reload: cancelado pelo watchdog — não recarrego");
      return;
    }
    _apiRenamedNames.clear();
    if (NS.store && typeof NS.store.reloadAndResume === "function")
      await NS.store.reloadAndResume();
    else {
      try {
        location.reload();
      } catch {}
    }
  }

  async function submitPump() {
    if (_pumping || _reloading) return;
    _pumping = true;
    emit("start");
    emit("change");
    try {
      while (!_paused) {
        if (_renameEager) {
          while (!_paused && renameQueue.length && canRenameNow()) {
            if (!(await drainOneRename())) break;
          }
        }
        const job = nextQueued();
        if (!job) {
          if (await drainOneRename()) continue;
          break;
        }

        const isUpload = job.kind === "upload";
        const limit = isUpload ? uploadConcurrency : effConcurrency;
        const interval = isUpload ? uploadInterval : effInterval;
        if (inFlight >= limit) {
          if (await drainOneRename()) continue;
          break;
        }

        const s = job.spec || {};

        const complex = job.kind === "promote";

        if (!docFocused() && _renameFallback === "api" && jobHasRefDeps(job)) {
          let gg = 0;
          while (renameQueue.length && gg++ < 100) {
            if (!(await drainOneRename())) break;
          }
          if (_apiRenamedNames.size && jobUsesApiRenamedName(job)) {
            await reloadAndContinue();
            return;
          }
        }

        while (!_paused && renameQueue.length && canRenameNow()) {
          if (!(await drainOneRename())) break;
        }

        await drainOverdueRenames();

        job.status = "running";
        job.startedAt = Date.now();
        emit("job:start", { job });
        emit("change");

        if (complex) {
          inFlight++;
          if (job.kind === "generate") job.submitSeq = ++submitCount;
          let res;
          try {
            if (job.kind === "promote") res = await S().promoteReference(job.tile, job.name);
            else
              res = await S().generate({
                ...s,
                onProgress: (p) => emit("job:progress", { job, progress: p }),
              });
          } catch (e) {
            res = { ok: false, error: e.message };
          }
          onJobResolved(job, res);
          await interSubmitDelay(interval);
          continue;
        }

        let ticket = null;
        try {
          if (isUpload) {
            ticket = await S().uploadSubmit(job.file);
          } else if (s.type === "video") {
            await S().applyConfig(jobConfig(job));
            ticket = await S().submitVideo(s);
          } else {
            await S().applyConfig(jobConfig(job));
            ticket = await S().submit({
              prompt: s.prompt,
              refLabels: s.refs,
              expectedCount: s.variants || 1,
            });
          }
        } catch (e) {
          onJobResolved(job, { ok: false, error: e.message });
          continue;
        }

        const captured = isUpload
          ? !!(ticket && ticket.tileId)
          : !!(ticket && ticket.tileIds && ticket.tileIds.length);
        if (!captured) {
          onJobResolved(
            job,
            isUpload
              ? { ok: false, error: "upload não criou tile" }
              : { ok: false, errorType: "rate_limit", error: "nenhum tile criado após envio" },
          );
          continue;
        }

        inFlight++;
        if (job.kind === "generate") job.submitSeq = ++submitCount;
        const awaitP = isUpload
          ? S().uploadAwait(ticket, job.name)
          : S().awaitTiles(ticket, {
              onProgress: (p) => emit("job:progress", { job, progress: p }),
            });
        awaitP
          .then((res) => onJobResolved(job, res))
          .catch((e) => onJobResolved(job, { ok: false, error: e.message }));

        await interSubmitDelay(interval);
      }
    } finally {
      _pumping = false;
      if (_paused) emit("paused");
      else if (inFlight === 0 && !nextQueued() && !renameQueue.length) {
        log.info("fila: ociosa");
        emit("idle");

        if (_apiRenamedNames.size && !_reloading && !hasPendingWork()) {
          log.info("reload final (validar nomes via API)");
          reloadAndContinue();
        }
      }
      emit("change");
    }
  }
  function kick() {
    if (!_paused) submitPump();
  }

  const RELOAD_WATCHDOG_MS = 45000;
  const HEARTBEAT_MS = 20000;
  let _reloadWatchdog = null;

  function _armarWatchdogReload() {
    clearTimeout(_reloadWatchdog);
    _reloadWatchdog = setTimeout(() => {
      if (!_reloading) return;
      log.warn(
        "fila: o reload não aconteceu em " +
          RELOAD_WATCHDOG_MS / 1000 +
          "s — desarmando e voltando a enviar",
      );
      _reloading = false;
      _reloadGen++;
      _apiRenamedNames.clear();
      emit("change");
      kick();
    }, RELOAD_WATCHDOG_MS);
  }

  try {
    setInterval(() => {
      if (_paused || _pumping || inFlight > 0) return;
      if (!nextQueued() && !renameQueue.length) return;
      if (_reloading) return;
      log.warn("fila: parada com trabalho pendente — religando (heartbeat)");
      kick();
    }, HEARTBEAT_MS);
  } catch {}

  try {
    window.addEventListener("focus", () => {
      if (renameQueue.length)
        renameQueue.forEach((x) => {
          x._triedNoFocus = false;
        });
      if (!_paused && renameQueue.length) kick();
    });
  } catch {}

  function start() {
    _paused = false;
    emit("resumed");
    emit("change");
    kick();
  }
  function pause() {
    _paused = true;
    log.info("fila: pausada (em voo terminam)");
  }
  function stop() {
    try {
      S().cancel();
    } catch {}
    for (const j of jobs)
      if (j.status === "queued") {
        j.status = "cancelled";
        j.error = "cancelado";
      }
    _paused = false;
    log.info("fila: parada (cancelou pendentes)");
    emit("stopped");
    emit("change");
  }
  function clearQueued() {
    for (const j of jobs)
      if (j.status === "queued") {
        j.status = "cancelled";
        j.error = "removido";
      }
    emit("change");
  }

  function cancelJob(id) {
    const j = jobs.find((x) => x.id === id);

    if (!j || !(j.status === "queued" || (j.status === "failed" && j.retryAt))) return false;
    j.retryAt = null;
    j.status = "cancelled";
    j.error = "removido";
    log.info(`fila: job ${id} cancelado (cena excluída)`);
    emit("change");
    return true;
  }
  function clearFinished() {
    for (let i = jobs.length - 1; i >= 0; i--) {
      const st = jobs[i].status;
      if (st === "done" || st === "failed" || st === "cancelled") jobs.splice(i, 1);
    }
    emit("change");
  }

  function pendingSnapshot() {
    return jobs
      .filter((j) => j.status === "queued" && j.kind === "generate" && j.spec)
      .map((j) => ({ spec: j.spec, label: j.label }));
  }

  function restorePending(arr) {
    if (!Array.isArray(arr) || !arr.length) return 0;
    _paused = true;
    let n = 0;
    for (const it of arr) {
      if (!it || !it.spec) continue;
      const job = makeJob({ spec: it.spec, label: it.label });
      jobs.push(job);
      emit("enqueued", { job });
      n++;
    }
    if (n) {
      log.info(`fila: ${n} pendente(s) restaurada(s) — PAUSADA`);
      emit("paused");
      emit("change");
    }
    return n;
  }

  function setConcurrency(n) {
    targetConcurrency = clamp(1, 5, Math.round(Number(n) || 1));
    effConcurrency = targetConcurrency;
    log.info(`concorrência → ${effConcurrency}`);
    emit("throttle", status());
    emit("change");
    kick();
  }
  function setInterval_(minMs, maxMs) {
    const a = Math.max(0, Math.round(Number(minMs) || 0));
    const b = Math.max(a, Math.round(Number(maxMs) || a));
    baseInterval = [a, b];
    effInterval = [a, b];
    log.info(`intervalo → ${a}-${b}ms`);
    emit("throttle", status());
    emit("change");
  }
  function setUploadConcurrency(n) {
    uploadConcurrency = clamp(1, MAX_UPLOAD_CONC, Math.round(Number(n) || 1));
    log.info(`uploads simultâneos → ${uploadConcurrency}`);
    emit("throttle", status());
    emit("change");
    kick();
  }
  function setUploadInterval(minMs, maxMs) {
    const a = Math.max(0, Math.round(Number(minMs) || 0));
    const b = Math.max(a, Math.round(Number(maxMs) || a));
    uploadInterval = [a, b];
    log.info(`intervalo de upload → ${a}-${b}ms`);
    emit("throttle", status());
    emit("change");
  }

  function setRenameFallback(mode) {
    if (["api", "focus", "wait"].includes(mode)) {
      _renameFallback = mode;
      log.info("rename: estratégia sem foco → " + mode);
      emit("change");
    }
  }
  const getRenameFallback = () => _renameFallback;

  NS.orchestrator = {
    version: VERSION,
    enqueue,
    enqueueMany,
    start,
    pause,
    stop,
    clearQueued,
    cancelJob,
    clearFinished,
    retryNow,

    _setAutoRetryDelaysForTest: (arr) => {
      _autoRetryDelays = arr.slice();
    },
    _setSobrecargaEsperaForTest: (ms) => {
      _sobrecargaEsperaMs = ms;
    },
    enqueueRename,
    clearRenames,
    setConcurrency,
    setInterval: setInterval_,
    setUploadConcurrency,
    setUploadInterval,
    setRenameFallback,
    getRenameFallback,
    reloadAndContinue,
    setPendingWork,
    setRenameEager,
    pendingSnapshot,
    restorePending,
    status,
    list,
    on,
    isProcessing: () => _pumping || inFlight > 0,
    isPaused: () => _paused,
  };

  log.info("orchestrator v" + VERSION + " pronto (concorrência dinâmica)");
})();

(() => {
  const NS = window.FlowAuto;
  if (!NS || !NS.adapter) {
    console.error(
      "[flow-auto] FlowAuto.adapter não carregou — confira a ordem dos scripts no manifest",
    );
    return;
  }

  window.FA = NS;
  NS.log.info(`bootstrap OK em ${location.hostname} — use FA.adapter.* no console`);
})();
