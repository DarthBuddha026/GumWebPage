/* ==========================================================================
   GUM Guild Wars — league admin core
   Shared helpers, data loading, sign-in flows and tab routing. Each tab lives in
   its own script (guilds.js, bladers.js, …) and registers with GW.registerTab().
   ========================================================================== */

(function () {
  "use strict";

  const CFG = window.LEAGUE_CONFIG;
  const GW = (window.GW = {});

  GW.CFG = CFG;
  GW.BRACKETS = Object.keys(CFG.brackets);
  GW.HEX = /^#[0-9a-f]{6}$/i;
  GW.POINTS_TO_WIN = CFG.pointsToWin;
  GW.FINISHES = {
    spin: { label: "Stamina", points: CFG.finishPoints.spin, color: "var(--f-spin)" },
    over: { label: "Over", points: CFG.finishPoints.over, color: "var(--f-over)" },
    burst: { label: "Burst", points: CFG.finishPoints.burst, color: "var(--f-burst)" },
    extreme: { label: "Extreme", points: CFG.finishPoints.extreme, color: "var(--f-extreme)" },
  };

  GW.data = {
    user: null,
    guilds: { version: 0, teams: [], fromDefaults: false },
    players: { version: 0, players: [] },
    season: { version: 0, season: { number: CFG.season || 1, venue: CFG.venue || "" }, weeks: [], matches: [] },
    results: {},
  };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  const $ = (GW.$ = (sel, root = document) => root.querySelector(sel));
  const $$ = (GW.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel)));

  GW.esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const esc = GW.esc;

  GW.initials = (name) => {
    const parts = String(name).replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase() || "?";
  };

  GW.inkFor = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#000" : "#fff";
  };

  GW.colorVars = (colors, prefix) => {
    const [fill, line] = (colors || []).filter((c) => GW.HEX.test(c));
    if (!fill) return "";
    return `--${prefix}-bg:${fill};--${prefix}-line:${line || fill};--${prefix}-ink:${GW.inkFor(fill)}`;
  };

  GW.guildByName = (name) => GW.data.guilds.teams.find((t) => t.name === name);

  GW.guildBadge = (team, cls = "avatar guild") => {
    const inner = team.logo ? `<img src="${esc(team.logo)}" alt="">` : esc(GW.initials(team.name));
    return `<span class="${cls}" style="${GW.colorVars(team.colors, "av")}" aria-hidden="true">${inner}</span>`;
  };

  GW.playerBadge = (player, cls = "avatar guild") => {
    const guild = GW.guildByName(player.team);
    const inner = player.photo ? `<img src="${esc(player.photo)}" alt="">` : esc(GW.initials(player.name));
    return `<span class="${cls}" style="${GW.colorVars(guild?.colors, "av")}" aria-hidden="true">${inner}</span>`;
  };

  GW.uid = (prefix) => prefix + Math.random().toString(36).slice(2, 10);

  GW.formatDate = (iso, opts = { weekday: "short", month: "short", day: "numeric" }) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts) : "No date yet";

  GW.toast = (msg) => {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(GW.toast.timer);
    GW.toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
  };

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  GW.api = async (path, { method = "GET", body } = {}) => {
    const res = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      // Not JSON: usually means the API isn't running here.
    }
    if (!res.ok || !data) {
      const err = new Error((data && data.error) || `The server answered ${res.status}.`);
      err.status = res.status;
      err.offline = !data;
      if (res.status === 401 && GW.data.user && path !== "login") GW.signedOut(err.message);
      if (res.status === 403 && /temporary password/.test(err.message)) GW.requirePasswordChange();
      throw err;
    }
    return data;
  };

  // ---------------------------------------------------------------------------
  // Images
  // ---------------------------------------------------------------------------

  // mode "contain" keeps the whole image (logos, transparent edges);
  // mode "cover" crops to a centred square (photos).
  GW.resizeImage = (file, size, mode = "contain") =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (mode === "cover") {
          const s = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        } else {
          const scale = Math.min(size / img.width, size / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        }
        URL.revokeObjectURL(img.src);
        const webp = canvas.toDataURL("image/webp", 0.88);
        resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL(mode === "cover" ? "image/jpeg" : "image/png", 0.88));
      };
      img.onerror = () => reject(new Error("That file couldn't be read as an image."));
      img.src = URL.createObjectURL(file);
    });

  GW.uploadImage = async (file, size, mode) => {
    const dataUrl = await GW.resizeImage(file, size, mode);
    const { url } = await GW.api("image", { method: "POST", body: { dataUrl } });
    return url;
  };

  // ---------------------------------------------------------------------------
  // Modals built by the tab scripts
  // ---------------------------------------------------------------------------

  // Opens a modal with the given inner HTML. Returns { el, close }.
  GW.modal = ({ title, body, wide = false, full = false, onClose }) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="modal-card ${wide ? "wide" : ""} ${full ? "full" : "auto"}">
        <div class="modal-header">
          <h3 class="modal-title">${esc(title)}</h3>
          <button class="icon-btn" data-modal-close aria-label="Close"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div class="modal-body scroll-view">${body}</div>
      </div>`;
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      if (!$$(".modal-overlay.open").length) document.body.classList.remove("scroll-locked");
      if (onClose) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape" && overlay === $$("#modal-root .modal-overlay").at(-1)) close();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-modal-close]")) close();
    });
    document.addEventListener("keydown", onKey);
    $("#modal-root").appendChild(overlay);
    document.body.classList.add("scroll-locked");
    return { el: overlay, close };
  };

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  const cleanTeam = (t) => ({
    name: t.name || "",
    colors: (t.colors || []).filter((c) => GW.HEX.test(c)).slice(0, 2),
    bracket: t.bracket || GW.BRACKETS[0],
    location: t.location || "",
    address: t.address || "",
    lat: Number.isFinite(t.lat) ? t.lat : null,
    lng: Number.isFinite(t.lng) ? t.lng : null,
    logo: t.logo || "",
  });
  GW.cleanTeam = cleanTeam;

  GW.setGuilds = (doc) => {
    GW.data.guilds = {
      version: doc.version,
      fromDefaults: doc.teams === null,
      teams: (doc.teams || CFG.teams || []).map(cleanTeam),
    };
  };

  GW.loadAll = async () => {
    const [guilds, players, season, league] = await Promise.all([
      GW.api("teams"),
      GW.api("players"),
      GW.api("season"),
      GW.api(`league?t=${Date.now()}`),
    ]);
    GW.setGuilds(guilds);
    GW.data.players = players;
    GW.data.season = season;
    GW.data.results = league.results || {};
  };

  GW.refreshResults = async () => {
    const league = await GW.api(`league?t=${Date.now()}`);
    GW.data.results = league.results || {};
  };

  // How a fixture stands: { state: none|live|final|default, text, won1, won2 }.
  GW.resultSummary = (match) => {
    const r = GW.data.results[match.id];
    if (!r) return { state: "none", text: "Not played", won1: 0, won2: 0 };
    if (r.status === "default") {
      return { state: "default", text: `Default win for ${r.defaultWinner === 1 ? match.team1 : match.team2}`, won1: 0, won2: 0 };
    }
    const won1 = r.bouts.filter((b) => b.complete && b.p1Pts > b.p2Pts).length;
    const won2 = r.bouts.filter((b) => b.complete && b.p2Pts > b.p1Pts).length;
    return r.status === "final"
      ? { state: "final", text: `Final ${won1}–${won2}`, won1, won2 }
      : { state: "live", text: `In progress ${won1}–${won2}`, won1, won2 };
  };

  GW.resultChip = (match) => {
    const s = GW.resultSummary(match);
    return `<span class="result-chip ${s.state}">${GW.esc(s.text)}</span>`;
  };

  GW.weekById = (id) => GW.data.season.weeks.find((w) => w.id === id);

  // Weeks in calendar order (undated weeks last, in the order they were added).
  GW.sortedWeeks = () =>
    GW.data.season.weeks
      .map((w, i) => ({ w, i }))
      .sort((a, b) => (a.w.date || "9999").localeCompare(b.w.date || "9999") || a.i - b.i)
      .map((x) => x.w);

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  const tabs = [];
  let activeTab = null;

  GW.registerTab = (tab) => tabs.push(tab);

  function visibleTabs() {
    return tabs.filter((t) => !t.ownerOnly || GW.data.user?.role === "owner");
  }

  function buildTabs() {
    const list = visibleTabs();
    $("#admin-tabs").innerHTML = list
      .map((t) => `<button class="command-tab" role="tab" data-tab="${t.id}"><i class="fas ${t.icon}" aria-hidden="true"></i> ${esc(t.label)}</button>`)
      .join("");
    $("#tab-panels").innerHTML = list.map((t) => `<section class="tab-panel hidden" id="tab-${t.id}" role="tabpanel"></section>`).join("");
  }

  GW.showTab = (id) => {
    const list = visibleTabs();
    const tab = list.find((t) => t.id === id) || list[0];
    activeTab = tab.id;
    $$("#admin-tabs .command-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab.id);
      b.setAttribute("aria-selected", b.dataset.tab === tab.id);
    });
    $$(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tab.id}`));
    if (location.hash !== `#${tab.id}`) history.replaceState(null, "", `#${tab.id}`);
    tab.render($(`#tab-${tab.id}`));
  };

  // Re-render the visible tab after data changes.
  GW.refresh = () => {
    if (activeTab) GW.showTab(activeTab);
  };

  // ---------------------------------------------------------------------------
  // Views and sign-in flows
  // ---------------------------------------------------------------------------

  function showView(name) {
    $$(".admin-main > section").forEach((s) => s.classList.toggle("hidden", s.id !== `view-${name}`));
    const signedIn = Boolean(GW.data.user);
    $("#sign-out").classList.toggle("hidden", !signedIn);
    $("#change-password").classList.toggle("hidden", !signedIn || name === "password");
    $("#user-chip").classList.toggle("hidden", !signedIn);
    if (signedIn) {
      const u = GW.data.user;
      $("#user-chip").textContent = `${u.displayName} (${u.role})`;
    }
  }
  GW.showView = showView;

  function showLogin(message = "", ok = false) {
    GW.data.user = null;
    const msg = $("#login-msg");
    msg.textContent = message;
    msg.className = `form-msg ${ok ? "ok" : "err"}`;
    $("#login-password").value = "";
    showView("login");
    setTimeout(() => ($("#login-user").value ? $("#login-password") : $("#login-user")).focus(), 50);
  }

  GW.signedOut = (message) => {
    $$("#modal-root .modal-overlay").forEach((m) => m.remove());
    $("#editor-modal").classList.remove("open");
    document.body.classList.remove("scroll-locked");
    showLogin(message);
  };

  GW.requirePasswordChange = () => {
    $$("#modal-root .modal-overlay").forEach((m) => m.remove());
    showPasswordForm(true);
  };

  function showPasswordForm(required) {
    $("#password-form").reset();
    $("#password-msg").textContent = "";
    $("#password-lead").textContent = required
      ? "You signed in with a temporary password. Choose your own before you continue."
      : "Choose a new password. This signs you out on your other devices.";
    $("#pw-cancel").classList.toggle("hidden", required);
    showView("password");
    setTimeout(() => $("#pw-current").focus(), 50);
  }

  async function enterApp() {
    if (GW.data.user.mustChangePassword) return showPasswordForm(true);
    showView("loading");
    await GW.loadAll();
    buildTabs();
    showView("app");
    GW.showTab(location.hash.slice(1));
  }

  async function submitForm(form, msgEl, work) {
    const button = $("button[type=submit]", form);
    button.disabled = true;
    msgEl.textContent = "";
    msgEl.className = "form-msg err";
    try {
      await work();
    } catch (err) {
      msgEl.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  }

  function bindSessionForms() {
    $("#first-run-form").addEventListener("submit", (e) => {
      e.preventDefault();
      submitForm(e.target, $("#first-run-msg"), async () => {
        const { user } = await GW.api("setup", {
          method: "POST",
          body: { setupKey: $("#fr-key").value, displayName: $("#fr-name").value, username: $("#fr-user").value, password: $("#fr-pass").value },
        });
        GW.data.user = user;
        await enterApp();
        GW.toast("Owner account created. Welcome!");
      });
    });

    $("#login-form").addEventListener("submit", (e) => {
      e.preventDefault();
      submitForm(e.target, $("#login-msg"), async () => {
        const { user } = await GW.api("login", { method: "POST", body: { username: $("#login-user").value, password: $("#login-password").value } });
        GW.data.user = user;
        await enterApp();
      });
    });

    $("#password-form").addEventListener("submit", (e) => {
      e.preventDefault();
      submitForm(e.target, $("#password-msg"), async () => {
        if ($("#pw-new").value !== $("#pw-confirm").value) throw new Error("The two new passwords don't match.");
        const { user } = await GW.api("password", { method: "POST", body: { currentPassword: $("#pw-current").value, newPassword: $("#pw-new").value } });
        GW.data.user = user;
        await enterApp();
        GW.toast("Password changed.");
      });
    });

    $("#pw-cancel").addEventListener("click", () => {
      showView("app");
      GW.refresh();
    });
    $("#change-password").addEventListener("click", () => showPasswordForm(false));
    $("#sign-out").addEventListener("click", async () => {
      try {
        await GW.api("logout", { method: "POST", body: {} });
      } catch {
        // Signing out locally is enough if the request fails.
      }
      showLogin("You're signed out.", true);
    });

    $("#admin-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (btn) GW.showTab(btn.dataset.tab);
    });
  }

  GW.boot = async () => {
    bindSessionForms();
    tabs.forEach((t) => t.init && t.init());

    let session;
    try {
      session = await GW.api("session");
    } catch {
      return showView("offline");
    }

    const { setup, user } = session;
    if (!setup.database || !setup.password) {
      $("#setup-db").classList.toggle("done", setup.database);
      $("#setup-password").classList.toggle("done", setup.password);
      return showView("setup");
    }
    if (!setup.owner) return showView("first-run");
    if (!user) return showLogin();

    GW.data.user = user;
    try {
      await enterApp();
    } catch (err) {
      if (err.status !== 401) showLogin(err.message);
    }
  };
})();
