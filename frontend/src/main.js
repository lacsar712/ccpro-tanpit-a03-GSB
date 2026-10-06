import { LitElement, css, html, nothing } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const ROUTES = [
  { path: "/", label: "坑位场地图", match: (p) => p === "/" || p === "/index.html" },
  { path: "/compare", label: "同行对照台", match: (p) => p.startsWith("/compare") },
];

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.detail || "请求失败", res.status);
  return data;
}

function currentRoute() {
  return ROUTES.find((r) => r.match(window.location.pathname)) || ROUTES[0];
}

function currentYardId() {
  const v = Number(new URLSearchParams(window.location.search).get("yard"));
  return Number.isInteger(v) && v > 0 ? v : null;
}

function goto(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function selectYard(yardId) {
  const url = new URL(window.location.href);
  if (yardId) url.searchParams.set("yard", String(yardId));
  else url.searchParams.delete("yard");
  window.history.replaceState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function fmt2(v) {
  return v === null || v === undefined ? "—" : v.toFixed(2);
}
function fmtPh(v) {
  if (v === null || v === undefined) return "—";
  return String(Math.round(v * 100) / 100);
}

/* ---------------- 外壳：顶栏 + 路由 + 登录 ---------------- */

class TanShell extends LitElement {
  static properties = {
    ready: { type: Boolean },
    route: { type: Object },
    username: { type: String },
    password: { type: String },
    err: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      font-family: "KaiTi", "STKaiti", serif;
      color: #2b2118;
      background: #f4efe6;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 10px 22px;
      background: #3a2d20;
      color: #f4efe6;
      border-bottom: 3px solid #8a5a2b;
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .brand { font-size: 1.25em; font-weight: bold; letter-spacing: 2px; }
    .nav { display: flex; gap: 8px; margin-left: 12px; }
    a.navlink {
      color: #e8dcc8;
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid transparent;
    }
    a.navlink:hover { background: #4d3c2b; }
    a.navlink.active { background: #8a5a2b; color: #fff; border-color: #c08a4f; }
    .spacer { flex: 1; }
    .user { color: #cbb99c; font-size: 0.9em; }
    button.logout {
      background: none;
      border: 1px solid #8a7a64;
      color: #e8dcc8;
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
    }
    main.login-card {
      max-width: 380px;
      margin: 70px auto;
      padding: 28px 30px;
      background: #fffdf7;
      border: 1px solid #d8c8ac;
      border-radius: 12px;
      box-shadow: 0 6px 22px rgba(58, 45, 32, 0.12);
    }
    main.login-card h2 { margin-top: 0; }
    main.login-card label { display: block; margin: 12px 0; }
    main.login-card input {
      width: 100%; box-sizing: border-box; margin-top: 6px;
      padding: 8px 10px; border: 1px solid #b9a98e; border-radius: 6px;
      background: #fff; font-family: inherit;
    }
    main.login-card button.primary {
      width: 100%; margin-top: 8px; padding: 9px;
      background: #8a5a2b; color: #fff; border-color: #8a5a2b;
    }
    main.login-card .err {
      color: #9b1c1c; background: #f7e2e0; border: 1px solid #d89a95;
      padding: 8px 12px; border-radius: 6px;
    }
    main.login-card .hint { color: #6b5a48; font-size: 0.9em; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.route = currentRoute();
    this.username = "admin";
    this.password = "123456";
    this.err = "";
    this._onPop = () => (this.route = currentRoute());
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("popstate", this._onPop);
    this._onDenied = () => {
      localStorage.removeItem(TOKEN_KEY);
      this.ready = false;
    };
    window.addEventListener("tanpit-unauthorized", this._onDenied);
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this._onPop);
    window.removeEventListener("tanpit-unauthorized", this._onDenied);
    super.disconnectedCallback();
  }

  nav(path, e) {
    e.preventDefault();
    goto(path);
  }

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      this.ready = true;
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.ready = false;
  }

  render() {
    return html`
      <header class="topbar">
        <span class="brand">南冈鞣场</span>
        <nav class="nav">
          ${ROUTES.map(
            (r) => html`
              <a
                class="navlink ${this.route.path === r.path ? "active" : ""}"
                href="${r.path}"
                @click=${(e) => this.nav(r.path, e)}
                >${r.label}</a
              >
            `
          )}
        </nav>
        <span class="spacer"></span>
        ${this.ready
          ? html`<span class="user">账房：admin / worker</span>
              <button class="logout" @click=${() => this.logout()}>退出</button>`
          : nothing}
      </header>
      ${this.ready
        ? this.route.path === "/compare"
          ? html`<tan-compare></tan-compare>`
          : html`<tan-map></tan-map>`
        : html`
            <main class="login-card">
              <h2>登录鞣场作业台</h2>
              <form @submit=${this.login} autocomplete="off">
                <label>用户名
                  <input
                    name="username"
                    autocomplete="off"
                    .value=${this.username}
                    @input=${(e) => (this.username = e.target.value)}
                  />
                </label>
                <label>密码
                  <input
                    name="password"
                    type="password"
                    autocomplete="off"
                    .value=${this.password}
                    @input=${(e) => (this.password = e.target.value)}
                  />
                </label>
                <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
                <button class="primary">登录</button>
              </form>
              ${this.err ? html`<p class="err">${this.err}</p>` : nothing}
            </main>
          `}
    `;
  }
}

/* ---------------- 共用片段：场次筛选 ---------------- */

const yardSelect = (yards, yardId, onPick) => html`
  <label class="yard-filter">
    鞣场：
    <select @change=${(e) => onPick(Number(e.target.value) || null)}>
      ${yards.map(
        (y) =>
          html`<option value=${y.id} ?selected=${y.id === yardId}>${y.name}（${y.village || "—"}）</option>`
      )}
    </select>
  </label>
`;

const sharedStyles = css`
  .wrap { max-width: 960px; margin: 0 auto; padding: 24px 16px 56px; }
  .toolbar { display: flex; align-items: center; gap: 16px; margin: 6px 0 18px; flex-wrap: wrap; }
  .yard-filter { font-size: 1.05em; }
  select, input, button { font-family: inherit; font-size: 1em; }
  select, input { padding: 6px 10px; border: 1px solid #b9a98e; border-radius: 6px; background: #fffdf7; }
  button {
    padding: 7px 14px; border-radius: 6px; border: 1px solid #8a5a2b;
    background: #f0e6d4; color: #3a2d20; cursor: pointer; margin-right: 8px;
  }
  button:hover { background: #e6d6ba; }
  button.primary { background: #8a5a2b; color: #fff; }
  button.primary:hover { background: #74491f; }
  .err { color: #9b1c1c; background: #f7e2e0; border: 1px solid #d89a95; padding: 8px 12px; border-radius: 6px; }
  .hint { color: #6b5a48; font-size: 0.92em; }
  h2 { margin: 4px 0 2px; }
`;

async function guard(fn) {
  try {
    return await fn();
  } catch (ex) {
    if (ex instanceof ApiError && ex.status === 401) {
      window.dispatchEvent(new Event("tanpit-unauthorized"));
    }
    throw ex;
  }
}

/* ---------------- 坑位场地图（可操作） ---------------- */

class TanMap extends LitElement {
  static properties = {
    yards: { type: Array },
    yardId: { type: Number },
    board: { type: Object },
    pickedId: { type: Number },
    ph: { type: String },
    err: { type: String },
  };

  static styles = [
    sharedStyles,
    css`
      .grid { display: grid; gap: 12px; }
      .pit {
        min-height: 104px; border-radius: 10px; color: #fff; cursor: pointer;
        border: 2px solid transparent; text-align: left; padding: 10px 12px; margin: 0;
      }
      .pit:hover { transform: translateY(-1px); }
      .pit.fill { background: #5f8294; }
      .pit.tanning { background: #8a5a2b; }
      .pit.drained { background: #667a4f; }
      .pit.picked { border-color: #2b2118; box-shadow: 0 0 0 3px rgba(138, 90, 43, 0.35); }
      .pit code { font-size: 1.15em; font-weight: bold; }
      .pit .ph { font-size: 0.9em; opacity: 0.92; margin-top: 6px; }
      .panel {
        margin-top: 22px; padding: 16px 18px; background: #fffdf7;
        border: 1px solid #d8c8ac; border-radius: 10px;
      }
      .panel h3 { margin: 0 0 6px; }
      .statusline { margin: 10px 0 4px; display: flex; gap: 8px; flex-wrap: wrap; }
    `,
  ];

  constructor() {
    super();
    this.yards = [];
    this.yardId = currentYardId();
    this.board = null;
    this.pickedId = null;
    this.ph = "4.2";
    this.err = "";
    this._onPop = () => {
      this.yardId = currentYardId();
      this.refresh();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("popstate", this._onPop);
    this.refresh();
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this._onPop);
    super.disconnectedCallback();
  }

  get picked() {
    return this.board ? this.board.pits.find((p) => p.id === this.pickedId) : null;
  }

  async refresh(keepPicked = true) {
    this.err = "";
    try {
      const qs = this.yardId ? `?yard_id=${this.yardId}` : "";
      const data = await guard(() => api(`/api/board${qs}`));
      this.board = data;
      this.yards = data.yards;
      this.yardId = data.yard.id;
      if (keepPicked && this.pickedId && !data.pits.some((p) => p.id === this.pickedId)) {
        this.pickedId = null;
      }
    } catch (ex) {
      if (!(ex instanceof ApiError && ex.status === 401)) this.err = ex.message;
    }
  }

  async writePh() {
    if (!this.picked) return;
    this.err = "";
    try {
      await guard(() =>
        api(`/api/pits/${this.picked.id}/samples`, {
          method: "POST",
          body: JSON.stringify({ ph: Number(this.ph) }),
        })
      );
      await this.refresh();
    } catch (ex) {
      if (!(ex instanceof ApiError && ex.status === 401)) this.err = ex.message;
    }
  }

  async setStatus(status) {
    if (!this.picked) return;
    this.err = "";
    try {
      await guard(() =>
        api(`/api/pits/${this.picked.id}/status`, {
          method: "POST",
          body: JSON.stringify({ status }),
        })
      );
      await this.refresh();
    } catch (ex) {
      if (!(ex instanceof ApiError && ex.status === 401)) {
        this.err = ex.message;
        await this.refresh();
      }
    }
  }

  render() {
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    const colCount = Math.max(...this.board.pits.map((p) => p.col)) + 1;
    return html`
      <div class="wrap">
        <h2>${this.board.yard.name} · 坑位场地图</h2>
        <p class="hint">${this.board.yard.village || ""} · 点坑登记浸液酸碱度并改状态；放液须最近读数 3.5～5.0，入鞣须与本行鞣制中坑均值差不超过 0.6。同行数字请看顶栏「同行对照台」。</p>
        <div class="toolbar">
          ${yardSelect(this.yards, this.yardId, (id) => {
            this.pickedId = null;
            selectYard(id);
          })}
        </div>
        <div class="grid" style="grid-template-columns: repeat(${colCount}, 1fr)">
          ${this.board.pits.map(
            (p) => html`
              <button
                class="pit ${p.status} ${p.id === this.pickedId ? "picked" : ""}"
                @click=${() => (this.pickedId = p.id)}
              >
                <code>${p.code}</code><br />
                ${LABELS[p.status]}
                <div class="ph">最近酸碱：${fmtPh(p.latestPh)}</div>
              </button>
            `
          )}
        </div>
        ${this.renderPanel()}
        ${this.err ? html`<p class="err" style="margin-top:14px">${this.err}</p>` : nothing}
      </div>
    `;
  }

  // 操作面板只含本坑信息与操作，绝不塞同行对照表。
  renderPanel() {
    const p = this.picked;
    if (!p) return nothing;
    return html`
      <section class="panel">
        <h3>${p.code} · ${LABELS[p.status]}</h3>
        <p class="hint" style="margin: 4px 0">
          最近酸碱度：<strong>${fmtPh(p.latestPh)}</strong> · 共 ${p.sampleCount} 次记录
        </p>
        <label>
          本次浸液酸碱：
          <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
        </label>
        <button class="primary" @click=${() => this.writePh()}>登记酸碱度</button>
        <div class="statusline">
          <button @click=${() => this.setStatus("fill")} ?disabled=${p.status === "fill"}>改回注液</button>
          <button @click=${() => this.setStatus("tanning")} ?disabled=${p.status === "tanning"}>改为鞣制中</button>
          <button @click=${() => this.setStatus("drained")} ?disabled=${p.status === "drained"}>改为已放液</button>
        </div>
      </section>
    `;
  }
}

/* ---------------- 同行对照台（独立专页 · 纯只读） ---------------- */

class TanCompare extends LitElement {
  static properties = {
    yards: { type: Array },
    yardId: { type: Number },
    data: { type: Object },
    err: { type: String },
  };

  static styles = [
    sharedStyles,
    css`
      table {
        width: 100%; border-collapse: collapse; background: #fffdf7;
        border: 1px solid #d8c8ac; border-radius: 8px; overflow: hidden;
      }
      th, td { padding: 8px 12px; border-bottom: 1px solid #e7dcc7; text-align: center; }
      th { background: #ece0c9; font-weight: bold; }
      tr:last-child td { border-bottom: none; }
      .rowtitle { margin: 22px 0 8px; font-size: 1.1em; }
      .pill {
        display: inline-block; padding: 2px 10px; border-radius: 999px;
        color: #fff; font-size: 0.9em;
      }
      .pill.fill { background: #5f8294; }
      .pill.tanning { background: #8a5a2b; }
      .pill.drained { background: #667a4f; }
      td.over { color: #9b1c1c; font-weight: bold; background: #f8e7e3; }
      .tag-over {
        margin-left: 6px; padding: 1px 8px; border-radius: 4px;
        background: #9b1c1c; color: #fff; font-size: 0.82em;
      }
      .tag-ok { color: #4a6b38; font-size: 0.88em; }
      .note { margin-top: 18px; }
    `,
  ];

  constructor() {
    super();
    this.yards = [];
    this.yardId = currentYardId();
    this.data = null;
    this.err = "";
    this._onPop = () => {
      this.yardId = currentYardId();
      this.refresh();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("popstate", this._onPop);
    this.refresh();
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this._onPop);
    super.disconnectedCallback();
  }

  async refresh() {
    this.err = "";
    try {
      const qs = this.yardId ? `?yard_id=${this.yardId}` : "";
      const data = await guard(() => api(`/api/compare${qs}`));
      this.data = data;
      this.yards = data.yards;
      this.yardId = data.yard.id;
    } catch (ex) {
      if (!(ex instanceof ApiError && ex.status === 401)) this.err = ex.message;
    }
  }

  render() {
    if (!this.data) return html`<div class="wrap">${this.err || "装载对照台…"}</div>`;
    return html`
      <div class="wrap">
        <h2>${this.data.yard.name} · 同行对照台</h2>
        <p class="hint">只读台：按场筛选，按行列出各坑最近浸液酸碱、本行鞣制中坑均值（不含本坑）与二者差值；差值超过 0.6 即挡住入鞣。</p>
        <div class="toolbar">
          ${yardSelect(this.yards, this.yardId, (id) => selectYard(id))}
        </div>
        ${this.data.rows.map(
          (row) => html`
            <h3 class="rowtitle">第 ${row.row + 1} 排</h3>
            <table>
              <thead>
                <tr>
                  <th>坑位</th><th>状态</th><th>最近酸碱</th>
                  <th>同行鞣制中均值</th><th>差值（绝对值）</th>
                </tr>
              </thead>
              <tbody>
                ${row.pits.map((p) => {
                  const over = Boolean(p.overLimit);
                  return html`
                    <tr>
                      <td><strong>${p.code}</strong></td>
                      <td><span class="pill ${p.status}">${LABELS[p.status]}</span></td>
                      <td>${fmtPh(p.latestPh)}</td>
                      <td>${fmt2(p.peerMean)}</td>
                      <td class=${over ? "over" : ""}>
                        ${fmt2(p.diff)}
                        ${p.diff === null
                          ? html`<span class="tag-ok"> 无需对照</span>`
                          : over
                            ? html`<span class="tag-over">超 0.6 · 挡入鞣</span>`
                            : html`<span class="tag-ok"> 可入鞣</span>`}
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          `
        )}
        <p class="hint note">
          说明：差值仅用于「注液 → 鞣制中」校验；「已放液」始终只看本坑最近读数是否在
          ${this.data.drainedRange[0]}～${this.data.drainedRange[1]}，均值差不拦放液。本行没有鞣制中坑时不比较。
        </p>
        ${this.err ? html`<p class="err">${this.err}</p>` : nothing}
      </div>
    `;
  }
}

customElements.define("tan-shell", TanShell);
customElements.define("tan-map", TanMap);
customElements.define("tan-compare", TanCompare);
