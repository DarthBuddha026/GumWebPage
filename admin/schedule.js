/* Schedule tab: season details, weeks, fixtures and the round-robin generator. */
(function () {
  "use strict";

  const { esc } = GW;
  const season = () => GW.data.season;

  const hasResult = (matchId) => Boolean(GW.data.results[matchId]);

  // Saves the whole schedule. Returns true on success.
  async function save(next, message) {
    try {
      const s = season();
      GW.data.season = await GW.api("season", {
        method: "PUT",
        body: { baseVersion: s.version, season: next.season || s.season, weeks: next.weeks || s.weeks, matches: next.matches || s.matches },
      });
      await GW.refreshResults();
      GW.toast(message);
      GW.refresh();
      return true;
    } catch (err) {
      GW.toast(err.message);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------

  function render(panel) {
    if (GW.data.guilds.fromDefaults) {
      panel.innerHTML = `
        <h1 class="section-title">Schedule</h1>
        <div class="admin-banner">
          <i class="fas fa-circle-info" aria-hidden="true"></i>
          <span>Publish the guilds first, then you can build the schedule.</span>
          <button class="btn-secondary" data-goto-tab="guilds">Go to Guilds</button>
        </div>`;
      return;
    }

    const s = season();
    const weeks = GW.sortedWeeks();
    panel.innerHTML = `
      <div class="admin-head">
        <div>
          <h1 class="section-title">Schedule</h1>
          <p class="section-note">${weeks.length} weeks, ${s.matches.length} fixtures. The dashboard's season path and schedule follow this.</p>
        </div>
        <div class="head-actions">
          <button class="btn-secondary" data-sched-generate><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i> Generate round robin</button>
          <button class="btn-primary admin-add" data-sched-week="new"><i class="fas fa-plus" aria-hidden="true"></i> Add week</button>
        </div>
      </div>

      <form class="panel season-form" data-season-form>
        <div class="field">
          <label for="s-number">Season number</label>
          <input id="s-number" type="number" min="1" max="99" class="form-control" value="${s.season.number}">
        </div>
        <div class="field grow">
          <label for="s-venue">Venue</label>
          <input id="s-venue" class="form-control" maxlength="120" value="${esc(s.season.venue)}" placeholder="Shown in the opening popup, e.g. Main Event Hall, doors open 9:00 AM">
        </div>
        <button type="submit" class="btn-secondary">Save season details</button>
      </form>

      ${weeks.length
        ? weeks.map(weekCard).join("")
        : `<div class="empty-state"><i class="fas fa-calendar-plus" aria-hidden="true"></i><h4>No schedule yet</h4>
            <p>Use <b>Generate round robin</b> to have every guild play every other guild once, or add weeks and fixtures yourself.</p></div>`}`;
  }

  function weekCard(w) {
    const fixtures = season().matches.filter((m) => m.weekId === w.id);
    return `
      <div class="week-card">
        <div class="week-head">
          <div>
            <h2 class="week-title">${esc(w.label)}</h2>
            <span class="muted">${esc(GW.formatDate(w.date))}</span>
          </div>
          <button class="btn-secondary small" data-sched-week="${esc(w.id)}"><i class="fas fa-pen" aria-hidden="true"></i> Edit week</button>
        </div>
        <ul class="fixture-list">
          ${fixtures.map(fixtureRow).join("") || `<li class="fixture-row empty-row"><span class="muted">No fixtures this week.</span></li>`}
        </ul>
        <button class="btn-secondary small add-fixture" data-sched-fixture="new" data-week="${esc(w.id)}"><i class="fas fa-plus" aria-hidden="true"></i> Add fixture</button>
      </div>`;
  }

  function fixtureRow(m) {
    const t1 = GW.guildByName(m.team1);
    const t2 = GW.guildByName(m.team2);
    return `
      <li class="fixture-row">
        <span class="fixture-side">${t1 ? GW.guildBadge(t1) : ""}<span>${esc(m.team1)}</span></span>
        <span class="vs">vs</span>
        <span class="fixture-side">${t2 ? GW.guildBadge(t2) : ""}<span>${esc(m.team2)}</span></span>
        ${GW.resultChip(m)}
        <button class="icon-btn" data-sched-fixture="${esc(m.id)}" aria-label="Edit ${esc(m.team1)} vs ${esc(m.team2)}"><i class="fas fa-pen" aria-hidden="true"></i></button>
      </li>`;
  }

  // ---------------------------------------------------------------------------
  // Editors
  // ---------------------------------------------------------------------------

  function openWeek(id) {
    const s = season();
    const existing = s.weeks.find((w) => w.id === id);
    const fixtures = existing ? s.matches.filter((m) => m.weekId === id) : [];
    const lastDate = GW.sortedWeeks().filter((w) => w.date).at(-1)?.date;
    const nextDate = lastDate ? new Date(Date.parse(`${lastDate}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10) : "";
    const w = existing || { id: GW.uid("w"), label: `Week ${s.weeks.length + 1}`, date: nextDate };

    const { el, close } = GW.modal({
      title: existing ? `Edit ${existing.label}` : "Add week",
      body: `
        <form class="editor-form" novalidate>
          <div class="editor-grid">
            <div class="field"><label for="w-label">Name</label><input id="w-label" class="form-control" maxlength="24" value="${esc(w.label)}" required></div>
            <div class="field"><label for="w-date">Date</label><input id="w-date" type="date" class="form-control" value="${esc(w.date)}"></div>
          </div>
          <p class="form-msg err" data-msg role="alert"></p>
          <div class="editor-actions">
            ${existing ? '<button type="button" class="btn-secondary danger" data-delete><i class="fas fa-trash" aria-hidden="true"></i> Delete week</button>' : ""}
            <span class="spacer"></span>
            <button type="button" class="btn-secondary" data-modal-close>Cancel</button>
            <button type="submit" class="btn-primary">Save week</button>
          </div>
        </form>`,
    });
    const q = (sel) => el.querySelector(sel);

    q("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = q("#w-label").value.trim();
      if (!label) return (q("[data-msg]").textContent = "Give the week a name.");
      if (s.weeks.some((x) => x.id !== w.id && x.label.toLowerCase() === label.toLowerCase())) return (q("[data-msg]").textContent = `There's already a week called ${label}.`);
      const week = { id: w.id, label, date: q("#w-date").value };
      const weeks = existing ? s.weeks.map((x) => (x.id === w.id ? week : x)) : [...s.weeks, week];
      if (await save({ weeks }, `${label} saved.`)) close();
    });

    q("[data-delete]")?.addEventListener("click", async () => {
      const scored = fixtures.filter((m) => hasResult(m.id)).length;
      const warning = fixtures.length
        ? ` Its ${fixtures.length} fixture${fixtures.length === 1 ? "" : "s"}${scored ? ` and ${scored} result${scored === 1 ? "" : "s"}` : ""} will be deleted too.`
        : "";
      if (!window.confirm(`Delete ${existing.label}?${warning}`)) return;
      if (await save({ weeks: s.weeks.filter((x) => x.id !== id), matches: s.matches.filter((m) => m.weekId !== id) }, `${existing.label} deleted.`)) close();
    });
  }

  function openFixture(id, weekId) {
    const s = season();
    const existing = s.matches.find((m) => m.id === id);
    const m = existing || { id: GW.uid("m"), weekId: weekId || GW.sortedWeeks()[0]?.id, team1: "", team2: "" };
    const scored = existing && hasResult(existing.id);
    const options = (selected) =>
      `<option value="">Choose a guild</option>` + GW.data.guilds.teams.map((t) => `<option value="${esc(t.name)}" ${t.name === selected ? "selected" : ""}>${esc(t.name)}</option>`).join("");

    const { el, close } = GW.modal({
      title: existing ? `${existing.team1} vs ${existing.team2}` : "Add fixture",
      body: `
        <form class="editor-form" novalidate>
          <div class="editor-grid">
            <div class="field span-2"><label for="f-week">Week</label>
              <select id="f-week" class="form-control">${GW.sortedWeeks().map((w) => `<option value="${esc(w.id)}" ${w.id === m.weekId ? "selected" : ""}>${esc(w.label)}, ${esc(GW.formatDate(w.date))}</option>`).join("")}</select></div>
            <div class="field"><label for="f-t1">Guild</label><select id="f-t1" class="form-control">${options(m.team1)}</select></div>
            <div class="field"><label for="f-t2">Against</label><select id="f-t2" class="form-control">${options(m.team2)}</select></div>
          </div>
          ${scored ? '<p class="hint warn-text">This fixture has a result. Changing either guild deletes it; moving it to another week keeps it.</p>' : ""}
          <p class="form-msg err" data-msg role="alert"></p>
          <div class="editor-actions">
            ${existing ? '<button type="button" class="btn-secondary danger" data-delete><i class="fas fa-trash" aria-hidden="true"></i> Delete fixture</button>' : ""}
            <span class="spacer"></span>
            <button type="button" class="btn-secondary" data-modal-close>Cancel</button>
            <button type="submit" class="btn-primary">Save fixture</button>
          </div>
        </form>`,
    });
    const q = (sel) => el.querySelector(sel);

    q("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fixture = { id: m.id, weekId: q("#f-week").value, team1: q("#f-t1").value, team2: q("#f-t2").value };
      if (!fixture.team1 || !fixture.team2) return (q("[data-msg]").textContent = "Choose both guilds.");
      if (fixture.team1 === fixture.team2) return (q("[data-msg]").textContent = "A guild can't play itself.");
      const clash = s.matches.find((x) => x.id !== m.id && x.weekId === fixture.weekId && [x.team1, x.team2].some((t) => t === fixture.team1 || t === fixture.team2));
      if (clash && !window.confirm(`${clash.team1} vs ${clash.team2} is already in this week, so one of these guilds would play twice. Save anyway?`)) return;
      if (scored && (fixture.team1 !== existing.team1 || fixture.team2 !== existing.team2) && !window.confirm("Changing the guilds deletes this fixture's result. Continue?")) return;
      const matches = existing ? s.matches.map((x) => (x.id === m.id ? fixture : x)) : [...s.matches, fixture];
      if (await save({ matches }, `${fixture.team1} vs ${fixture.team2} saved.`)) close();
    });

    q("[data-delete]")?.addEventListener("click", async () => {
      if (!window.confirm(`Delete ${existing.team1} vs ${existing.team2}?${scored ? " Its result will be deleted too." : ""}`)) return;
      if (await save({ matches: s.matches.filter((x) => x.id !== m.id) }, "Fixture deleted.")) close();
    });
  }

  // Every guild plays every other guild in its bracket once.
  function openGenerator() {
    const s = season();
    const firstDate = GW.sortedWeeks().find((w) => w.date)?.date || "";
    const scored = Object.keys(GW.data.results).length;
    const { el, close } = GW.modal({
      title: "Generate round robin",
      body: `
        <form class="editor-form" novalidate>
          <p class="muted">Every guild plays every other guild${GW.BRACKETS.length > 1 ? " in its bracket" : ""} once. With an odd number of guilds, one guild sits out each week.</p>
          <div class="editor-grid">
            <div class="field"><label for="g-start">First match day</label><input id="g-start" type="date" class="form-control" value="${esc(firstDate)}" required></div>
            <div class="field"><label for="g-gap">Days between match days</label><input id="g-gap" type="number" min="1" max="60" class="form-control" value="7"></div>
            <div class="field span-2">
              <label>Guilds taking part</label>
              <div class="check-grid">
                ${GW.data.guilds.teams.map((t) => `<label class="toggle">${GW.guildBadge(t)}<input type="checkbox" value="${esc(t.name)}" checked> ${esc(t.name)}</label>`).join("")}
              </div>
            </div>
          </div>
          ${s.matches.length ? `<p class="hint warn-text">This replaces the current ${s.weeks.length} weeks and ${s.matches.length} fixtures${scored ? `, and deletes ${scored} result${scored === 1 ? "" : "s"}` : ""}.</p>` : ""}
          <p class="form-msg err" data-msg role="alert"></p>
          <div class="editor-actions"><span class="spacer"></span><button type="button" class="btn-secondary" data-modal-close>Cancel</button><button type="submit" class="btn-primary">Generate schedule</button></div>
        </form>`,
    });
    const q = (sel) => el.querySelector(sel);

    q("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const start = q("#g-start").value;
      const gap = Number(q("#g-gap").value);
      const chosen = new Set([...el.querySelectorAll(".check-grid input:checked")].map((i) => i.value));
      if (!start) return (q("[data-msg]").textContent = "Choose the first match day.");
      if (!(gap >= 1 && gap <= 60)) return (q("[data-msg]").textContent = "Days between match days must be from 1 to 60.");

      const byBracket = GW.BRACKETS.map((b) => GW.data.guilds.teams.filter((t) => t.bracket === b && chosen.has(t.name)).map((t) => t.name)).filter((list) => list.length >= 2);
      if (!byBracket.length) return (q("[data-msg]").textContent = "Choose at least two guilds.");
      if (s.matches.length && !window.confirm("Replace the current schedule?")) return;

      const rounds = byBracket.map((names) => window.leagueTools.roundRobin(names));
      const weekCount = Math.max(...rounds.map((r) => r.length));
      const t0 = Date.parse(`${start}T00:00:00Z`);
      const weeks = Array.from({ length: weekCount }, (_, i) => ({
        id: GW.uid("w"),
        label: `Week ${i + 1}`,
        date: new Date(t0 + i * gap * 864e5).toISOString().slice(0, 10),
      }));
      const matches = rounds.flatMap((r) => r.flatMap((pairs, i) => pairs.map(([team1, team2]) => ({ id: GW.uid("m"), weekId: weeks[i].id, team1, team2 }))));

      if (await save({ weeks, matches }, `Schedule generated: ${weeks.length} weeks, ${matches.length} fixtures.`)) close();
    });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function init() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-sched-generate]")) return openGenerator();
      const week = e.target.closest("[data-sched-week]");
      if (week) return openWeek(week.dataset.schedWeek === "new" ? null : week.dataset.schedWeek);
      const fixture = e.target.closest("[data-sched-fixture]");
      if (fixture) openFixture(fixture.dataset.schedFixture === "new" ? null : fixture.dataset.schedFixture, fixture.dataset.week);
    });
    document.addEventListener("submit", async (e) => {
      if (!e.target.matches("[data-season-form]")) return;
      e.preventDefault();
      const number = Number(e.target.querySelector("#s-number").value);
      if (!Number.isInteger(number) || number < 1 || number > 99) return GW.toast("The season number must be from 1 to 99.");
      await save({ season: { number, venue: e.target.querySelector("#s-venue").value.trim() } }, "Season details saved.");
    });
  }

  GW.registerTab({ id: "schedule", label: "Schedule", icon: "fa-calendar-days", init, render });
})();
