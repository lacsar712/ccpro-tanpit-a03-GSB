import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const fmt = (v) => Number(v).toFixed(2);

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "请求失败");
  return data;
}

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    view: { type: String },
    me: { type: Object },
    yards: { type: Array },
    yardId: { type: Number },
    board: { type: Object },
    compare: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .topbar {
      display: flex; align-items: center; gap: 18px;
      background: #3a2c1e; color: #f5ead9; padding: 10px 20px;
    }
    .topbar .brand { font-size: 1.15em; font-weight: bold; letter-spacing: 2px; }
    .topbar nav { display: flex; gap: 8px; }
    .topbar nav button {
      font: inherit; color: #e8dcc4; background: transparent;
      border: 1px solid #7a6549; border-radius: 6px; padding: 6px 14px; cursor: pointer;
    }
    .topbar nav button.on { background: #8a5a2b; border-color: #8a5a2b; color: #fff; }
    .topbar .who { margin-left: auto; font-size: 0.92em; }
    .topbar .who button {
      font: inherit; font-size: 0.9em; margin-left: 10px; color: #e8dcc4;
      background: transparent; border: 1px solid #7a6549; border-radius: 6px;
      padding: 3px 10px; cursor: pointer;
    }
    .wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 50px; }
    .bar { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, button, select { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    .drawer { border: 1px solid #cbb894; border-radius: 8px; padding: 4px 18px 18px; margin-top: 18px; background: #fbf7ee; }
    .rowcard { border: 1px solid #cbb894; border-radius: 8px; padding: 4px 18px 16px; margin: 16px 0; background: #fbf7ee; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d8c9a8; padding: 7px 12px; text-align: left; }
    th { background: #efe4cc; }
    td.num { font-variant-numeric: tabular-nums; }
    td.over { color: #9b1c1c; font-weight: bold; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.view = "map";
    this.me = null;
    this.yards = [];
    this.yardId = null;
    this.board = null;
    this.compare = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) this.load();
  }

  async load() {
    try {
      this.me = await api("/api/auth/me");
      this.yards = await api("/api/yards");
      if (this.yards.length && this.yardId === null) this.yardId = this.yards[0].id;
      await this.refresh();
    } catch (e) {
      this.err = e.message;
      if (/401|凭据|认证|token/i.test(e.message)) this.logout();
    }
  }

  async refresh() {
    this.err = "";
    if (this.view === "compare") return this.loadCompare();
    return this.loadBoard();
  }

  async loadBoard() {
    try {
      const q = this.yardId === null ? "" : `?yard_id=${this.yardId}`;
      this.board = await api(`/api/board${q}`);
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || null;
      }
    } catch (e) {
      this.err = e.message;
    }
  }

  async loadCompare() {
    try {
      const q = this.yardId === null ? "" : `?yard_id=${this.yardId}`;
      this.compare = await api(`/api/compare${q}`);
    } catch (e) {
      this.err = e.message;
    }
  }

  async switchView(view) {
    this.view = view;
    this.err = "";
    await this.refresh();
  }

  async selectYard(e) {
    this.yardId = Number(e.target.value);
    this.picked = null;
    this.err = "";
    await this.refresh();
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
      await this.load();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.ready = false;
    this.err = "";
    this.board = null;
    this.compare = null;
    this.picked = null;
    this.me = null;
  }

  async writePh() {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async setStatus(status) {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  renderYardSelect() {
    return html`<label>鞣场
      <select @change=${this.selectYard}>
        ${this.yards.map(
          (y) => html`<option value=${y.id} ?selected=${y.id === this.yardId}>${y.name}</option>`
        )}
      </select>
    </label>`;
  }

  renderMap() {
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`<div class="wrap">
      <div class="bar">
        ${this.renderYardSelect()}
        <span class="hint">${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0；改鞣制中与同行均值差不得过 0.6</span>
      </div>
      <h1>${this.board.yard}</h1>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status}" @click=${() => (this.picked = p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}
          </button>`
        )}
      </div>
      ${this.picked
        ? html`<section class="drawer">
            <h3>${this.picked.code} · ${LABELS[this.picked.status]}</h3>
            <p>最近酸碱度：${this.picked.latestPh ?? "无"} · ${this.picked.sampleCount} 次</p>
            <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
            <button @click=${this.writePh}>登记酸碱度</button>
            <div>
              <button @click=${() => this.setStatus("fill")}>注液</button>
              <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
              <button @click=${() => this.setStatus("drained")}>已放液</button>
            </div>
          </section>`
        : ""}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  renderCompare() {
    if (!this.compare) return html`<div class="wrap">${this.err || "装载对照…"}</div>`;
    return html`<div class="wrap">
      <div class="bar">
        ${this.renderYardSelect()}
        <span class="hint">同行对照台为只读专页：按行列出各坑最近酸碱、同行鞣制中均值与差值</span>
      </div>
      <h1>${this.compare.yard.name} · 同行对照台</h1>
      ${this.compare.rows.map(
        (r) => html`<section class="rowcard">
          <h3>
            第 ${r.row + 1} 行 · 同行鞣制中均值：
            ${r.peerMean === null ? "—（本行无鞣制中坑，不作比对）" : fmt(r.peerMean)}
          </h3>
          <table>
            <thead>
              <tr><th>坑位</th><th>状态</th><th>最近酸碱</th><th>同行均值</th><th>差值</th></tr>
            </thead>
            <tbody>
              ${r.pits.map(
                (p) => html`<tr>
                  <td>${p.code}</td>
                  <td>${LABELS[p.status]}</td>
                  <td class="num">${p.latestPh === null ? "无" : fmt(p.latestPh)}</td>
                  <td class="num">${r.peerMean === null ? "—" : fmt(r.peerMean)}</td>
                  <td class="num ${p.diff !== null && Math.abs(p.diff) > 0.6 ? "over" : ""}">
                    ${p.diff === null ? "—" : fmt(p.diff)}
                  </td>
                </tr>`
              )}
            </tbody>
          </table>
        </section>`
      )}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  render() {
    if (!this.ready) {
      return html`<div class="wrap">
        <h1>南冈鞣场</h1>
        <form @submit=${this.login} autocomplete="off">
          <label>用户名
            <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
          </label>
          <label>密码
            <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
          </label>
          <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
          <button>登录</button>
        </form>
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      </div>`;
    }
    return html`
      <header class="topbar">
        <span class="brand">鞣场作业台</span>
        <nav>
          <button class=${this.view === "map" ? "on" : ""} @click=${() => this.switchView("map")}>坑位场地图</button>
          <button class=${this.view === "compare" ? "on" : ""} @click=${() => this.switchView("compare")}>同行对照台</button>
        </nav>
        <span class="who">${this.me ? this.me.username : ""}<button @click=${this.logout}>退出</button></span>
      </header>
      ${this.view === "compare" ? this.renderCompare() : this.renderMap()}
    `;
  }
}

customElements.define("tan-yard", TanYard);
