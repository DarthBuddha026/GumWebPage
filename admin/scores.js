/* Scores tab: pick a week and a match, then enter it round by round. */
(function () {
  "use strict";

  const { esc } = GW;
  const view = { weekId: null };
  const FINISH_KEYS = Object.keys(GW.FINISHES);

  const playerByKey = (key) => GW.data.players.players.find((p) => p.key === key);
  const shortName = (key, fallback) => playerByKey(key)?.name || fallback;

  function battlePoints(bout) {
    let p1 = 0;
    let p2 = 0;
    bout.rounds.forEach((r) => {
      if (r.winner === 1) p1 += GW.FINISHES[r.finish].points;
      else p2 += GW.FINISHES[r.finish].points;
    });
    return { p1, p2, complete: p1 >= GW.POINTS_TO_WIN || p2 >= GW.POINTS_TO_WIN };
  }

  // ---------------------------------------------------------------------------
  // Week view
  // ---------------------------------------------------------------------------

  function defaultWeek() {
    const weeks = GW.sortedWeeks();
    const open = weeks.find((w) => GW.data.season.matches.some((m) => m.weekId === w.id && !["final", "default"].includes(GW.resultSummary(m).state)));
    return (open || weeks.at(-1))?.id;
  }

  function render(panel) {
    const weeks = GW.sortedWeeks();
    if (GW.data.guilds.fromDefaults || !weeks.length) {
      panel.innerHTML = `
        <h1 class="section-title">Scores</h1>
        <div class="admin-banner">
          <i class="fas fa-circle-info" aria-hidden="true"></i>
          <span>${GW.data.guilds.fromDefaults ? "Publish the guilds and build the schedule first." : "Build the schedule first, then scores can be entered here."}</span>
          <button class="btn-secondary" data-goto-tab="${GW.data.guilds.fromDefaults ? "guilds" : "schedule"}">Go to ${GW.data.guilds.fromDefaults ? "Guilds" : "Schedule"}</button>
        </div>`;
      return;
    }
    if (!weeks.some((w) => w.id === view.weekId)) view.weekId = defaultWeek();
    const fixtures = GW.data.season.matches.filter((m) => m.weekId === view.weekId);
    const week = GW.weekById(view.weekId);

    panel.innerHTML = `
      <div class="admin-head">
        <div>
          <h1 class="section-title">Scores</h1>
          <p class="section-note">Results go live on the dashboard as soon as you save. You can save a match part-way through and finish it later.</p>
        </div>
        <button class="btn-secondary" data-scores-refresh><i class="fas fa-rotate" aria-hidden="true"></i> Refresh</button>
      </div>
      <div class="command-tabs week-tabs" role="tablist" aria-label="Week">
        ${weeks.map((w) => `<button class="command-tab ${w.id === view.weekId ? "active" : ""}" role="tab" aria-selected="${w.id === view.weekId}" data-scores-week="${esc(w.id)}">${esc(w.label)}</button>`).join("")}
      </div>
      <p class="muted week-date">${esc(week.label)}, ${esc(GW.formatDate(week.date, { weekday: "long", month: "long", day: "numeric" }))}</p>
      <ul class="match-cards">
        ${fixtures
          .map((m) => {
            const t1 = GW.guildByName(m.team1);
            const t2 = GW.guildByName(m.team2);
            const s = GW.resultSummary(m);
            return `
              <li class="match-card ${s.state}">
                <div class="match-teams">
                  <span class="fixture-side">${t1 ? GW.guildBadge(t1) : ""}<span>${esc(m.team1)}</span></span>
                  <span class="match-score">${s.state === "none" ? "vs" : s.state === "default" ? "DEF" : `${s.won1}–${s.won2}`}</span>
                  <span class="fixture-side right"><span>${esc(m.team2)}</span>${t2 ? GW.guildBadge(t2) : ""}</span>
                </div>
                <div class="match-foot">
                  ${GW.resultChip(m)}
                  <button class="${s.state === "none" ? "btn-primary" : "btn-secondary"} small" data-score-open="${esc(m.id)}">${s.state === "none" ? "Enter score" : s.state === "live" ? "Continue scoring" : "Edit score"}</button>
                </div>
              </li>`;
          })
          .join("") || `<li class="empty-state"><p>No fixtures this week. Add them in the Schedule tab.</p></li>`}
      </ul>`;
  }

  // ---------------------------------------------------------------------------
  // Score editor
  // ---------------------------------------------------------------------------

  async function openScore(matchId) {
    const match = GW.data.season.matches.find((m) => m.id === matchId);
    if (!match) return;
    let current;
    try {
      current = await GW.api(`result?matchId=${encodeURIComponent(matchId)}`);
    } catch (err) {
      return GW.toast(err.message);
    }

    const st = {
      version: current.version,
      mode: current.status === "default" ? "default" : "battles",
      defaultWinner: current.defaultWinner || 1,
      bouts: current.status === "none" || current.status === "default" || !current.bouts.length
        ? [0, 1, 2].map(() => ({ p1: "", p2: "", rounds: [] }))
        : current.bouts.map((b) => ({ p1: b.p1, p2: b.p2, rounds: b.rounds.map((r) => ({ ...r })) })),
    };
    let dirty = false;

    const t1 = GW.guildByName(match.team1);
    const t2 = GW.guildByName(match.team2);
    const roster = (team, selected) =>
      GW.data.players.players
        .filter((p) => p.team === team && (p.active || p.key === selected))
        .sort((a, b) => a.name.localeCompare(b.name));

    const { el, close } = GW.modal({
      title: `${match.team1} vs ${match.team2}`,
      wide: true,
      full: true,
      body: `
        <div class="score-editor">
          <div class="score-head">
            <span class="fixture-side">${t1 ? GW.guildBadge(t1) : ""}<b>${esc(match.team1)}</b></span>
            <span class="set-score" data-set-score></span>
            <span class="fixture-side right"><b>${esc(match.team2)}</b>${t2 ? GW.guildBadge(t2) : ""}</span>
          </div>
          <div class="command-tabs compact mode-tabs" role="tablist">
            <button class="command-tab" role="tab" data-mode="battles">Battles</button>
            <button class="command-tab" role="tab" data-mode="default">Default win</button>
          </div>
          <div data-battles></div>
          <div data-default class="default-pick hidden">
            <p class="muted">Use this when a guild doesn't show up or is disqualified. No blader stats are recorded.</p>
            <label class="toggle big"><input type="radio" name="def" value="1"> ${esc(match.team1)} wins by default</label>
            <label class="toggle big"><input type="radio" name="def" value="2"> ${esc(match.team2)} wins by default</label>
          </div>
          <p class="hint" data-status></p>
          <p class="form-msg err" data-msg role="alert"></p>
          <div class="editor-actions sticky-actions">
            ${current.status !== "none" ? '<button type="button" class="btn-secondary danger" data-clear><i class="fas fa-eraser" aria-hidden="true"></i> Clear result</button>' : ""}
            <span class="spacer"></span>
            <button type="button" class="btn-secondary" data-modal-close>Cancel</button>
            <button type="button" class="btn-primary" data-save>Save result</button>
          </div>
        </div>`,
    });
    const q = (sel) => el.querySelector(sel);
    const msg = q("[data-msg]");

    // Ask before throwing away unsaved rounds.
    el.addEventListener(
      "click",
      (e) => {
        const closing = e.target === el || e.target.closest("[data-modal-close]");
        if (closing && dirty && !window.confirm("Discard the changes to this match?")) {
          e.stopImmediatePropagation();
          e.stopPropagation();
        }
      },
      true
    );

    function battleCard(b, i) {
      const pts = battlePoints(b);
      const ready = b.p1 && b.p2;
      const opts = (team, selected) =>
        `<option value="">Choose a blader</option>` + roster(team, selected).map((p) => `<option value="${esc(p.key)}" ${p.key === selected ? "selected" : ""}>${esc(p.name)}${p.active ? "" : " (inactive)"}</option>`).join("");
      const winnerName = pts.complete ? (pts.p1 > pts.p2 ? shortName(b.p1, match.team1) : shortName(b.p2, match.team2)) : "";
      const pad = (side) => {
        const name = side === 1 ? shortName(b.p1, match.team1) : shortName(b.p2, match.team2);
        return `
          <div class="pad-side">
            <div class="pad-label">${esc(name)} won the round by</div>
            <div class="pad-buttons">
              ${FINISH_KEYS.map((f) => `<button type="button" class="finish-btn" style="--sw:${GW.FINISHES[f].color}" data-round="${i}" data-side="${side}" data-finish="${f}" ${!ready || pts.complete ? "disabled" : ""}>
                <span class="swatch"></span>${GW.FINISHES[f].label}<b>+${GW.FINISHES[f].points}</b></button>`).join("")}
            </div>
          </div>`;
      };
      return `
        <div class="battle ${pts.complete ? "complete" : ""}" data-battle="${i}">
          <div class="battle-top">
            <span class="battle-title">Battle ${i + 1}</span>
            ${pts.complete ? `<span class="result-chip final">${esc(winnerName)} wins</span>` : b.rounds.length ? '<span class="result-chip live">In progress</span>' : ""}
            <button type="button" class="icon-btn" data-remove-battle="${i}" aria-label="Remove battle ${i + 1}"><i class="fas fa-trash" aria-hidden="true"></i></button>
          </div>
          <div class="battle-players">
            <select class="form-control" data-pick="${i}" data-side="1" aria-label="${esc(match.team1)} blader" ${b.rounds.length ? "disabled" : ""}>${opts(match.team1, b.p1)}</select>
            <div class="battle-score"><b>${pts.p1}</b><span>:</span><b>${pts.p2}</b></div>
            <select class="form-control" data-pick="${i}" data-side="2" aria-label="${esc(match.team2)} blader" ${b.rounds.length ? "disabled" : ""}>${opts(match.team2, b.p2)}</select>
          </div>
          <ol class="round-strip" aria-label="Rounds">
            ${b.rounds.map((r, j) => `<li style="--sw:${GW.FINISHES[r.finish].color}" class="side-${r.winner}" title="Round ${j + 1}: ${esc(r.winner === 1 ? shortName(b.p1, match.team1) : shortName(b.p2, match.team2))}, ${GW.FINISHES[r.finish].label}">${GW.FINISHES[r.finish].label}</li>`).join("") || '<li class="empty">No rounds yet</li>'}
          </ol>
          ${ready ? `<div class="finish-pad">${pad(1)}${pad(2)}</div>` : '<p class="hint">Choose both bladers to start entering rounds. Bladers lock once the first round is in.</p>'}
          ${b.rounds.length ? `<button type="button" class="btn-secondary small" data-undo="${i}"><i class="fas fa-rotate-left" aria-hidden="true"></i> Undo last round</button>` : ""}
        </div>`;
    }

    function draw() {
      $$tabs();
      q("[data-battles]").classList.toggle("hidden", st.mode !== "battles");
      q("[data-default]").classList.toggle("hidden", st.mode !== "default");
      q("[data-battles]").innerHTML =
        st.bouts.map(battleCard).join("") +
        `<button type="button" class="btn-secondary add-battle" data-add-battle><i class="fas fa-plus" aria-hidden="true"></i> Add battle</button>`;
      el.querySelectorAll('input[name="def"]').forEach((r) => (r.checked = Number(r.value) === st.defaultWinner));

      const played = st.bouts.filter((b) => b.p1 || b.p2 || b.rounds.length);
      const pts = played.map(battlePoints);
      const w1 = pts.filter((p) => p.complete && p.p1 > p.p2).length;
      const w2 = pts.filter((p) => p.complete && p.p2 > p.p1).length;
      q("[data-set-score]").textContent = st.mode === "default" ? "DEF" : `${w1}–${w2}`;
      q("[data-status]").textContent =
        st.mode === "default"
          ? "Saves as a default win."
          : !played.length
            ? "Choose bladers and enter rounds, then save."
            : pts.every((p) => p.complete)
              ? `Saves as final: every battle is won (${w1}–${w2}).`
              : "Saves as in progress. The dashboard counts the match once every battle is won.";
    }

    function $$tabs() {
      el.querySelectorAll("[data-mode]").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === st.mode);
        b.setAttribute("aria-selected", b.dataset.mode === st.mode);
      });
    }

    el.addEventListener("click", (e) => {
      const t = e.target;
      const mode = t.closest("[data-mode]");
      if (mode) {
        st.mode = mode.dataset.mode;
        dirty = true;
        return draw();
      }
      const round = t.closest("[data-round]");
      if (round) {
        const b = st.bouts[Number(round.dataset.round)];
        b.rounds.push({ winner: Number(round.dataset.side), finish: round.dataset.finish });
        dirty = true;
        return draw();
      }
      const undo = t.closest("[data-undo]");
      if (undo) {
        st.bouts[Number(undo.dataset.undo)].rounds.pop();
        dirty = true;
        return draw();
      }
      if (t.closest("[data-add-battle]")) {
        if (st.bouts.length >= 9) return GW.toast("A match can have at most 9 battles.");
        st.bouts.push({ p1: "", p2: "", rounds: [] });
        dirty = true;
        return draw();
      }
      const remove = t.closest("[data-remove-battle]");
      if (remove) {
        const i = Number(remove.dataset.removeBattle);
        if (st.bouts[i].rounds.length && !window.confirm(`Remove battle ${i + 1} and its rounds?`)) return;
        st.bouts.splice(i, 1);
        dirty = true;
        return draw();
      }
      if (t.closest("[data-save]")) return saveResult();
      if (t.closest("[data-clear]")) return clearResult();
    });

    el.addEventListener("change", (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) {
        st.bouts[Number(pick.dataset.pick)][pick.dataset.side === "1" ? "p1" : "p2"] = pick.value;
        dirty = true;
        return draw();
      }
      if (e.target.name === "def") {
        st.defaultWinner = Number(e.target.value);
        dirty = true;
        draw();
      }
    });

    async function send(body, done) {
      msg.textContent = "";
      const btn = q("[data-save]");
      btn.disabled = true;
      try {
        const doc = await GW.api("result", { method: "PUT", body: { matchId, baseVersion: st.version, ...body } });
        if (doc.status === "none") delete GW.data.results[matchId];
        else GW.data.results[matchId] = { status: doc.status, defaultWinner: doc.defaultWinner, bouts: doc.bouts, updatedAt: doc.updatedAt };
        dirty = false;
        close();
        GW.toast(done(doc));
        GW.refresh();
      } catch (err) {
        msg.textContent = err.status === 409 ? "Someone else saved this match while you were editing. Close it and open it again to see their version." : err.message;
      } finally {
        btn.disabled = false;
      }
    }

    function saveResult() {
      if (st.mode === "default") {
        return send({ status: "default", defaultWinner: st.defaultWinner }, () => `Saved: default win for ${st.defaultWinner === 1 ? match.team1 : match.team2}.`);
      }
      const bouts = st.bouts.filter((b) => b.p1 || b.p2 || b.rounds.length);
      if (!bouts.length) return (msg.textContent = "Choose the bladers for at least one battle.");
      const missing = bouts.findIndex((b) => !b.p1 || !b.p2);
      if (missing >= 0) return (msg.textContent = `Battle ${st.bouts.indexOf(bouts[missing]) + 1}: choose both bladers, or remove the battle.`);
      send({ status: "played", bouts: bouts.map(({ p1, p2, rounds }) => ({ p1, p2, rounds })) }, (doc) => {
        const s = GW.resultSummary(match);
        return doc.status === "final" ? `Saved. ${match.team1} vs ${match.team2} is final, ${s.won1}–${s.won2}.` : "Saved as in progress.";
      });
    }

    function clearResult() {
      if (!window.confirm(`Clear the result of ${match.team1} vs ${match.team2}? It disappears from the dashboard.`)) return;
      send({ status: "none" }, () => "Result cleared.");
    }

    draw();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function init() {
    document.addEventListener("click", async (e) => {
      const week = e.target.closest("[data-scores-week]");
      if (week) {
        view.weekId = week.dataset.scoresWeek;
        return GW.refresh();
      }
      const open = e.target.closest("[data-score-open]");
      if (open) return openScore(open.dataset.scoreOpen);
      const refresh = e.target.closest("[data-scores-refresh]");
      if (refresh) {
        refresh.disabled = true;
        try {
          await GW.refreshResults();
          GW.refresh();
        } catch (err) {
          GW.toast(err.message);
        }
      }
    });
  }

  GW.registerTab({ id: "scores", label: "Scores", icon: "fa-bullseye", init, render });
})();
