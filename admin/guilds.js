/* Guilds tab: list, editor with map picker, logo upload. */
(function () {
  "use strict";

  const { $, $$, esc } = GW;
  const DEFAULT_COLOR = "#0EA3AE";
  const ed = { index: null, original: null, draft: null, map: null, marker: null, others: null };

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  function render(panel) {
    const { teams, fromDefaults } = GW.data.guilds;
    const n = teams.length;
    panel.innerHTML = `
      <div class="admin-head">
        <div>
          <h1 class="section-title">Guilds</h1>
          <p class="section-note">${n} ${n === 1 ? "guild" : "guilds"}. Changes go live on the dashboard as soon as you save.</p>
        </div>
        <button class="btn-primary admin-add" data-guild-add><i class="fas fa-plus" aria-hidden="true"></i> Add guild</button>
      </div>
      ${fromDefaults
        ? `<div class="admin-banner">
            <i class="fas fa-circle-info" aria-hidden="true"></i>
            <span>These are the starting guilds from <code>js/data.js</code>. Publish them (or save any guild) to store them in the database. Bladers and the schedule need published guilds.</span>
            <button class="btn-secondary" data-guild-publish>Publish these guilds</button>
          </div>`
        : ""}
      <ul class="admin-list">
        ${teams
          .map((t, i) => {
            const where = [t.location, GW.BRACKETS.length > 1 ? `Bracket ${t.bracket}` : ""].filter(Boolean);
            const bladers = GW.data.players.players.filter((p) => p.team === t.name).length;
            const onMap = Number.isFinite(t.lat) ? "On the map" : '<span class="warn">Not on the map yet</span>';
            return `
              <li class="admin-row">
                ${GW.guildBadge(t)}
                <div>
                  <div class="name">${esc(t.name)}</div>
                  <div class="meta">${where.map((w) => `<span>${esc(w)}</span>`).join("")}<span>${bladers} ${bladers === 1 ? "blader" : "bladers"}</span><span>${onMap}</span>${t.logo ? "<span>Has logo</span>" : ""}</div>
                </div>
                <div class="actions"><button class="btn-secondary" data-guild-edit="${i}"><i class="fas fa-pen" aria-hidden="true"></i> Edit</button></div>
              </li>`;
          })
          .join("") || `<li class="empty-state"><i class="fas fa-shield-halved" aria-hidden="true"></i><h4>No guilds yet</h4><p>Add the first guild to get started.</p></li>`}
      </ul>`;
  }

  // Saves the whole list. Returns true on success.
  async function publish(teams, message, renames) {
    try {
      const doc = await GW.api("teams", { method: "PUT", body: { baseVersion: GW.data.guilds.version, teams, renames } });
      GW.setGuilds(doc);
      if (renames && Object.keys(renames).length) {
        const [players, season] = await Promise.all([GW.api("players"), GW.api("season")]);
        GW.data.players = players;
        GW.data.season = season;
      }
      GW.toast(message);
      GW.refresh();
      return true;
    } catch (err) {
      const msg = $("#editor-msg");
      if ($("#editor-modal").classList.contains("open")) msg.textContent = err.message;
      else GW.toast(err.message);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  function openEditor(index) {
    const teams = GW.data.guilds.teams;
    ed.index = index;
    const base = index >= 0 ? teams[index] : { name: "", colors: [DEFAULT_COLOR], bracket: GW.BRACKETS[0], location: "", address: "", lat: null, lng: null, logo: "" };
    ed.original = index >= 0 ? base.name : null;
    ed.draft = { ...GW.cleanTeam(base), colors: [...(base.colors || [])] };

    $("#editor-title").textContent = index >= 0 ? `Edit ${base.name}` : "Add guild";
    $("#delete-guild").classList.toggle("hidden", index < 0);
    $("#editor-msg").textContent = "";
    $$("#editor-form [aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));

    $("#f-bracket").innerHTML = GW.BRACKETS.map((b) => `<option value="${esc(b)}">Bracket ${esc(b)}</option>`).join("");
    $("#f-bracket").closest(".field").classList.toggle("hidden", GW.BRACKETS.length < 2);

    const d = ed.draft;
    $("#f-name").value = d.name;
    $("#f-bracket").value = GW.BRACKETS.includes(d.bracket) ? d.bracket : GW.BRACKETS[0];
    $("#f-fill").value = d.colors[0] || DEFAULT_COLOR;
    $("#f-border").value = d.colors[1] || "";
    $("#f-location").value = d.location;
    $("#f-address").value = d.address;
    $("#f-logo-file").value = "";
    syncPickers();
    setCoords(d.lat, d.lng, { pan: false });
    updatePreview();

    $("#editor-modal").classList.add("open");
    document.body.classList.add("scroll-locked");
    setTimeout(() => {
      initMap();
      $("#f-name").focus();
    }, 30);
  }

  function closeEditor() {
    $("#editor-modal").classList.remove("open");
    if (!$$(".modal-overlay.open").length) document.body.classList.remove("scroll-locked");
    ed.index = null;
  }

  function syncPickers() {
    const fill = $("#f-fill").value.trim();
    const border = $("#f-border").value.trim();
    if (GW.HEX.test(fill)) $("#f-fill-picker").value = fill.toLowerCase();
    $("#f-border-picker").value = (GW.HEX.test(border) ? border : GW.HEX.test(fill) ? fill : DEFAULT_COLOR).toLowerCase();
  }

  function readColors() {
    return [$("#f-fill").value.trim(), $("#f-border").value.trim()].filter(Boolean);
  }

  function updatePreview() {
    const d = ed.draft;
    d.name = $("#f-name").value.trim();
    d.colors = readColors().filter((c) => GW.HEX.test(c));
    const vars = (prefix) => GW.colorVars(d.colors.length ? d.colors : [DEFAULT_COLOR], prefix);
    const inner = d.logo ? `<img src="${esc(d.logo)}" alt="">` : esc(GW.initials(d.name || "Guild"));
    $("#preview-badge").setAttribute("style", vars("av"));
    $("#preview-badge").innerHTML = inner;
    $("#preview-pin").setAttribute("style", vars("pin"));
    $("#preview-pin").innerHTML = inner;
    $("#remove-logo").classList.toggle("hidden", !d.logo);
    if (ed.marker) ed.marker.setIcon(pinIcon(d));
  }

  // ----- Map picker -----

  function pinIcon(team, opacity = 1) {
    const inner = team.logo ? `<img src="${esc(team.logo)}" alt="">` : esc(GW.initials(team.name || "Guild"));
    return L.divIcon({
      className: "guild-pin-wrap",
      html: `<span class="guild-pin" style="${GW.colorVars(team.colors.length ? team.colors : [DEFAULT_COLOR], "pin")};opacity:${opacity}">${inner}</span>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }

  function initMap() {
    if (!window.L) {
      $("#editor-map").innerHTML = `<p class="hint" style="padding:16px">The map couldn't load. You can still paste coordinates above.</p>`;
      return;
    }
    if (!ed.map) {
      ed.map = L.map("editor-map", { scrollWheelZoom: true, wheelPxPerZoomLevel: 90, zoomSnap: 0.5 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(ed.map);
      ed.map.on("click", (e) => setCoords(e.latlng.lat, e.latlng.lng, { pan: false }));
    }
    if (ed.others) ed.others.remove();
    ed.others = L.layerGroup(
      GW.data.guilds.teams
        .filter((t, i) => i !== ed.index && Number.isFinite(t.lat))
        .map((t) => L.marker([t.lat, t.lng], { icon: pinIcon(t, 0.4), interactive: false, keyboard: false }))
    ).addTo(ed.map);

    ed.map.invalidateSize();
    const d = ed.draft;
    if (Number.isFinite(d.lat)) ed.map.setView([d.lat, d.lng], 15);
    else ed.map.setView(GW.CFG.map.center, GW.CFG.map.zoom);
    placeMarker();
  }

  function placeMarker() {
    if (!ed.map) return;
    const d = ed.draft;
    if (!Number.isFinite(d.lat)) {
      if (ed.marker) ed.marker.remove();
      ed.marker = null;
      return;
    }
    if (!ed.marker) {
      ed.marker = L.marker([d.lat, d.lng], { icon: pinIcon(d), draggable: true, keyboard: false }).addTo(ed.map);
      ed.marker.on("dragend", () => {
        const p = ed.marker.getLatLng();
        setCoords(p.lat, p.lng, { pan: false });
      });
    } else {
      ed.marker.setLatLng([d.lat, d.lng]);
    }
  }

  function setCoords(lat, lng, { pan = true } = {}) {
    const d = ed.draft;
    const valid = Number.isFinite(lat) && Number.isFinite(lng);
    d.lat = valid ? Math.round(lat * 1e6) / 1e6 : null;
    d.lng = valid ? Math.round(lng * 1e6) / 1e6 : null;
    $("#f-coords").value = valid ? `${d.lat}, ${d.lng}` : "";
    $("#f-coords").removeAttribute("aria-invalid");
    placeMarker();
    if (valid && pan && ed.map) ed.map.setView([d.lat, d.lng], Math.max(ed.map.getZoom(), 15));
  }

  function parseCoords(text) {
    const m = String(text).match(/(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? [lat, lng] : null;
  }

  // ----- Logo -----

  async function uploadLogo() {
    const file = $("#f-logo-file").files[0];
    if (!file) return;
    $("#editor-msg").textContent = "";
    $("#editor-save").disabled = true;
    try {
      ed.draft.logo = await GW.uploadImage(file, 256, "contain");
      updatePreview();
      GW.toast("Logo uploaded. Save the guild to keep it.");
    } catch (err) {
      $("#editor-msg").textContent = err.message;
    } finally {
      $("#editor-save").disabled = false;
    }
  }

  // ----- Save & delete -----

  function validateDraft() {
    const problems = [];
    const mark = (sel, bad) => (bad ? $(sel).setAttribute("aria-invalid", "true") : $(sel).removeAttribute("aria-invalid"));

    const name = $("#f-name").value.trim();
    const taken = GW.data.guilds.teams.some((t, i) => i !== ed.index && t.name.toLowerCase() === name.toLowerCase());
    mark("#f-name", !name || taken);
    if (!name) problems.push("Give the guild a name.");
    else if (taken) problems.push(`There's already a guild called ${name}.`);

    const fill = $("#f-fill").value.trim();
    const border = $("#f-border").value.trim();
    mark("#f-fill", !GW.HEX.test(fill));
    mark("#f-border", border && !GW.HEX.test(border));
    if (!GW.HEX.test(fill)) problems.push("The main colour must be a hex code like #1E4FB8.");
    if (border && !GW.HEX.test(border)) problems.push("The border colour must be a hex code, or left empty.");

    const coordsText = $("#f-coords").value.trim();
    const coords = coordsText ? parseCoords(coordsText) : null;
    mark("#f-coords", coordsText && !coords);
    if (coordsText && !coords) problems.push("The map location should look like 13.785969, 121.073925.");

    if (problems.length) {
      $("#editor-msg").textContent = problems.join(" ");
      return null;
    }
    return {
      ...ed.draft,
      name,
      bracket: $("#f-bracket").value || GW.BRACKETS[0],
      colors: [fill, border].filter(Boolean),
      location: $("#f-location").value.trim(),
      address: $("#f-address").value.trim(),
      lat: coords ? coords[0] : null,
      lng: coords ? coords[1] : null,
    };
  }

  async function saveGuild(e) {
    e.preventDefault();
    const guild = validateDraft();
    if (!guild) return;
    const teams = GW.data.guilds.teams.slice();
    if (ed.index >= 0) teams[ed.index] = guild;
    else teams.push(guild);
    const renames = ed.original && ed.original !== guild.name ? { [ed.original]: guild.name } : undefined;

    $("#editor-save").disabled = true;
    const ok = await publish(teams, ed.index >= 0 ? `${guild.name} saved. The dashboard shows the change now.` : `${guild.name} added to the dashboard.`, renames);
    $("#editor-save").disabled = false;
    if (ok) closeEditor();
  }

  async function deleteGuild() {
    const team = GW.data.guilds.teams[ed.index];
    if (!team) return;
    if (!window.confirm(`Delete ${team.name}? They'll disappear from the dashboard and the map.`)) return;
    $("#delete-guild").disabled = true;
    const ok = await publish(GW.data.guilds.teams.filter((_, i) => i !== ed.index), `${team.name} deleted.`);
    $("#delete-guild").disabled = false;
    if (ok) closeEditor();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function init() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-guild-add]")) return openEditor(-1);
      const edit = e.target.closest("[data-guild-edit]");
      if (edit) return openEditor(Number(edit.dataset.guildEdit));
      const pub = e.target.closest("[data-guild-publish]");
      if (pub) {
        pub.disabled = true;
        publish(GW.data.guilds.teams, "Guilds published. Bladers and the schedule are ready to use.").finally(() => (pub.disabled = false));
      }
    });

    $("#editor-form").addEventListener("submit", saveGuild);
    $("#editor-close").addEventListener("click", closeEditor);
    $("#editor-cancel").addEventListener("click", closeEditor);
    $("#delete-guild").addEventListener("click", deleteGuild);
    $("#editor-modal").addEventListener("click", (e) => {
      if (e.target.id === "editor-modal") closeEditor();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("#editor-modal").classList.contains("open")) closeEditor();
    });

    $("#f-name").addEventListener("input", updatePreview);
    ["#f-fill", "#f-border"].forEach((sel) =>
      $(sel).addEventListener("input", () => {
        syncPickers();
        updatePreview();
      })
    );
    $("#f-fill-picker").addEventListener("input", (e) => {
      $("#f-fill").value = e.target.value.toUpperCase();
      updatePreview();
    });
    $("#f-border-picker").addEventListener("input", (e) => {
      $("#f-border").value = e.target.value.toUpperCase();
      updatePreview();
    });
    $("#f-coords").addEventListener("change", (e) => {
      const coords = parseCoords(e.target.value);
      if (coords) setCoords(coords[0], coords[1]);
      else if (!e.target.value.trim()) setCoords(null, null);
      else e.target.setAttribute("aria-invalid", "true");
    });
    $("#clear-coords").addEventListener("click", () => setCoords(null, null));
    $("#f-logo-file").addEventListener("change", uploadLogo);
    $("#remove-logo").addEventListener("click", () => {
      ed.draft.logo = "";
      $("#f-logo-file").value = "";
      updatePreview();
    });
  }

  GW.registerTab({ id: "guilds", label: "Guilds", icon: "fa-shield-halved", init, render });
})();
