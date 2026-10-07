/* Bladers tab: roster per guild, editor with photo upload. */
(function () {
  "use strict";

  const { $, esc } = GW;
  const view = { search: "", guild: "" };

  const players = () => GW.data.players.players;

  function nextKey() {
    const max = players().reduce((n, p) => Math.max(n, Number(p.key.replace(/\D/g, "")) || 0), 0);
    return `GW-${String(max + 1).padStart(4, "0")}`;
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  function render(panel) {
    if (GW.data.guilds.fromDefaults) {
      panel.innerHTML = `
        <h1 class="section-title">Bladers</h1>
        <div class="admin-banner">
          <i class="fas fa-circle-info" aria-hidden="true"></i>
          <span>Publish the guilds first, then you can add their bladers.</span>
          <button class="btn-secondary" data-goto-tab="guilds">Go to Guilds</button>
        </div>`;
      return;
    }
    const n = players().length;
    panel.innerHTML = `
      <div class="admin-head">
        <div>
          <h1 class="section-title">Bladers</h1>
          <p class="section-note">${n} ${n === 1 ? "blader" : "bladers"} across ${GW.data.guilds.teams.length} guilds.</p>
        </div>
        <button class="btn-primary admin-add" data-blader-add><i class="fas fa-plus" aria-hidden="true"></i> Add blader</button>
      </div>
      <div class="filter-row">
        <input type="search" class="search-input" id="blader-search" placeholder="Search by name or ID" value="${esc(view.search)}" aria-label="Search bladers">
        <select class="form-control" id="blader-guild" aria-label="Filter by guild">
          <option value="">All guilds</option>
          ${GW.data.guilds.teams.map((t) => `<option value="${esc(t.name)}" ${view.guild === t.name ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
        </select>
      </div>
      <div id="blader-groups"></div>`;
    renderGroups();
  }

  function renderGroups() {
    const q = view.search.trim().toLowerCase();
    const match = (p) => (!q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)) && (!view.guild || p.team === view.guild);
    const groups = GW.data.guilds.teams
      .map((t) => ({ team: t, list: players().filter((p) => p.team === t.name && match(p)).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)) }))
      .filter((g) => g.list.length || (!q && (!view.guild || view.guild === g.team.name)));

    $("#blader-groups").innerHTML = groups.length
      ? groups
          .map(
            (g) => `
        <div class="roster-group">
          <h2 class="group-head">${GW.guildBadge(g.team)}<span>${esc(g.team.name)}</span><span class="muted">${g.list.length}</span>
            <button class="btn-secondary small" data-blader-add="${esc(g.team.name)}"><i class="fas fa-plus" aria-hidden="true"></i> Add</button>
          </h2>
          <ul class="admin-list">
            ${g.list
              .map(
                (p) => `
              <li class="admin-row ${p.active ? "" : "inactive"}">
                ${GW.playerBadge(p)}
                <div>
                  <div class="name">${esc(p.name)}</div>
                  <div class="meta"><span>${esc(p.key)}</span><span>${p.beys} beys</span>${p.achievements.length ? `<span>${p.achievements.length} achievement${p.achievements.length === 1 ? "" : "s"}</span>` : ""}${p.active ? "" : '<span class="warn">Inactive</span>'}${p.photo ? "" : "<span>No photo</span>"}</div>
                </div>
                <div class="actions"><button class="btn-secondary" data-blader-edit="${esc(p.key)}"><i class="fas fa-pen" aria-hidden="true"></i> Edit</button></div>
              </li>`
              )
              .join("") || `<li class="admin-row empty-row"><span class="muted">No bladers yet.</span></li>`}
          </ul>
        </div>`
          )
          .join("")
      : `<div class="empty-state"><i class="fas fa-user-slash" aria-hidden="true"></i><h4>No bladers match</h4><p>Try another name, ID or guild.</p></div>`;
  }

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  function openEditor(key, team) {
    const existing = players().find((p) => p.key === key);
    const d = existing
      ? { ...existing, achievements: [...existing.achievements] }
      : { key: nextKey(), name: "", team: team || view.guild || GW.data.guilds.teams[0]?.name || "", photo: "", beys: 0, achievements: [], active: true };

    const { el, close } = GW.modal({
      title: existing ? `Edit ${existing.name}` : "Add blader",
      wide: true,
      body: `
        <form class="editor-form" novalidate>
          <div class="editor-grid">
            <div class="editor-preview">
              <span class="avatar guild preview-badge" data-preview></span>
              <div>
                <div class="name" data-preview-name></div>
                <small class="muted">${esc(d.key)}</small>
              </div>
            </div>
            <div class="field">
              <label for="b-name">Blader name</label>
              <input id="b-name" class="form-control" maxlength="40" value="${esc(d.name)}" required>
            </div>
            <div class="field">
              <label for="b-team">Guild</label>
              <select id="b-team" class="form-control">
                ${GW.data.guilds.teams.map((t) => `<option value="${esc(t.name)}" ${t.name === d.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
              </select>
            </div>
            <div class="field span-2">
              <label for="b-photo">Photo</label>
              <div class="logo-row">
                <input type="file" id="b-photo" accept="image/png,image/jpeg,image/webp">
                <button type="button" class="btn-secondary" data-remove-photo>Remove photo</button>
              </div>
              <p class="hint">It's cropped to a square around the centre and resized to 512×512. Without a photo, the blader shows their initials.</p>
            </div>
            <div class="field">
              <label for="b-beys">Beys used</label>
              <input id="b-beys" type="number" min="0" max="999" step="1" class="form-control" value="${d.beys}">
            </div>
            <div class="field toggle-field">
              <label class="toggle"><input type="checkbox" id="b-active" ${d.active ? "checked" : ""}> Active this season</label>
              <p class="hint">Inactive bladers keep their stats but aren't offered when scoring.</p>
            </div>
            <div class="field span-2">
              <label for="b-ach">Achievements</label>
              <textarea id="b-ach" class="form-control" rows="3" placeholder="One per line, e.g. Season 0 Champion">${esc(d.achievements.join("\n"))}</textarea>
              <p class="hint">Achievements containing "Champion" get a crown on the blader's profile.</p>
            </div>
          </div>
          <p class="form-msg err" data-msg role="alert"></p>
          <div class="editor-actions">
            ${existing ? '<button type="button" class="btn-secondary danger" data-delete><i class="fas fa-trash" aria-hidden="true"></i> Delete blader</button>' : ""}
            <span class="spacer"></span>
            <button type="button" class="btn-secondary" data-modal-close>Cancel</button>
            <button type="submit" class="btn-primary">Save blader</button>
          </div>
        </form>`,
    });

    const q = (sel) => el.querySelector(sel);
    const msg = q("[data-msg]");
    const preview = () => {
      d.name = q("#b-name").value.trim();
      d.team = q("#b-team").value;
      q("[data-preview]").outerHTML = GW.playerBadge(d, "avatar guild preview-badge").replace("<span ", "<span data-preview ");
      q("[data-preview-name]").textContent = d.name || "New blader";
      q("[data-remove-photo]").classList.toggle("hidden", !d.photo);
    };
    preview();
    setTimeout(() => q("#b-name").focus(), 30);

    q("#b-name").addEventListener("input", preview);
    q("#b-team").addEventListener("change", preview);
    q("#b-photo").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      msg.textContent = "";
      const save = q("button[type=submit]");
      save.disabled = true;
      try {
        d.photo = await GW.uploadImage(file, 512, "cover");
        preview();
        GW.toast("Photo uploaded. Save the blader to keep it.");
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        save.disabled = false;
      }
    });
    q("[data-remove-photo]").addEventListener("click", () => {
      d.photo = "";
      q("#b-photo").value = "";
      preview();
    });

    const save = async (list, message) => {
      try {
        GW.data.players = await GW.api("players", { method: "PUT", body: { baseVersion: GW.data.players.version, players: list } });
        GW.toast(message);
        close();
        GW.refresh();
      } catch (err) {
        msg.textContent = err.message;
      }
    };

    q("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = q("#b-name").value.trim();
      const beys = Number(q("#b-beys").value);
      if (!name) return (msg.textContent = "Give the blader a name.");
      if (players().some((p) => p.key !== d.key && p.name.toLowerCase() === name.toLowerCase())) return (msg.textContent = `There's already a blader called ${name}.`);
      if (!Number.isInteger(beys) || beys < 0 || beys > 999) return (msg.textContent = "Beys used must be a whole number from 0 to 999.");

      const blader = {
        key: d.key,
        name,
        team: q("#b-team").value,
        photo: d.photo,
        beys,
        achievements: q("#b-ach").value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10),
        active: q("#b-active").checked,
      };
      const list = existing ? players().map((p) => (p.key === d.key ? blader : p)) : [...players(), blader];
      q("button[type=submit]").disabled = true;
      await save(list, existing ? `${name} saved.` : `${name} added to ${blader.team}.`);
      if (q("button[type=submit]")) q("button[type=submit]").disabled = false;
    });

    q("[data-delete]")?.addEventListener("click", async () => {
      if (!window.confirm(`Delete ${existing.name}? If they've already battled, mark them inactive instead.`)) return;
      await save(players().filter((p) => p.key !== d.key), `${existing.name} deleted.`);
    });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function init() {
    document.addEventListener("click", (e) => {
      const add = e.target.closest("[data-blader-add]");
      if (add) return openEditor(null, add.dataset.bladerAdd || "");
      const edit = e.target.closest("[data-blader-edit]");
      if (edit) return openEditor(edit.dataset.bladerEdit);
      const go = e.target.closest("[data-goto-tab]");
      if (go) GW.showTab(go.dataset.gotoTab);
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "blader-search") {
        view.search = e.target.value;
        renderGroups();
      }
    });
    document.addEventListener("change", (e) => {
      if (e.target.id === "blader-guild") {
        view.guild = e.target.value;
        renderGroups();
      }
    });
  }

  GW.registerTab({ id: "bladers", label: "Bladers", icon: "fa-user-ninja", init, render });
})();
