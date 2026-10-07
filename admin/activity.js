/* Activity tab: who changed what, newest first. */
(function () {
  "use strict";

  const { esc } = GW;

  function when(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  async function render(panel) {
    panel.innerHTML = `
      <div class="admin-head">
        <div>
          <h1 class="section-title">Activity</h1>
          <p class="section-note">The last 100 changes made in the admin.</p>
        </div>
        <button class="btn-secondary" data-activity-refresh><i class="fas fa-rotate" aria-hidden="true"></i> Refresh</button>
      </div>
      <ul class="admin-list activity-list"><li class="admin-row empty-row"><span class="muted">Loading…</span></li></ul>`;
    try {
      const { entries } = await GW.api("audit");
      panel.querySelector(".activity-list").innerHTML = entries.length
        ? entries
            .map(
              (e) => `
          <li class="activity-row">
            <time datetime="${esc(e.at)}">${esc(when(e.at))}</time>
            <div><b>${esc(e.by)}</b> ${esc(e.action.charAt(0).toLowerCase() + e.action.slice(1))}${e.detail ? `<div class="muted">${esc(e.detail)}</div>` : ""}</div>
          </li>`
            )
            .join("")
        : `<li class="admin-row empty-row"><span class="muted">No changes yet.</span></li>`;
    } catch (err) {
      panel.querySelector(".activity-list").innerHTML = `<li class="admin-row empty-row"><span class="warn">${esc(err.message)}</span></li>`;
    }
  }

  function init() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-activity-refresh]")) GW.refresh();
    });
  }

  GW.registerTab({ id: "activity", label: "Activity", icon: "fa-clock-rotate-left", init, render });
})();
