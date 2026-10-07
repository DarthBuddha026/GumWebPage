/* Backup tab (owner only): download everything as one file, or restore it. */
(function () {
  "use strict";

  const { esc } = GW;

  function render(panel) {
    panel.innerHTML = `
      <h1 class="section-title">Backup</h1>
      <p class="section-note">A backup holds the guilds, bladers, schedule, every result and every uploaded logo and photo. Organizer accounts aren't included.</p>

      <div class="backup-grid">
        <div class="panel">
          <h2 class="panel-title">Download a backup</h2>
          <p class="muted">Keep a copy somewhere safe, for example before each week of matches.</p>
          <a class="btn-primary" href="/api/export" download><i class="fas fa-download" aria-hidden="true"></i> Download backup</a>
        </div>
        <div class="panel">
          <h2 class="panel-title">Restore a backup</h2>
          <p class="muted">Replaces everything on the dashboard with the backup's contents. Organizer accounts stay as they are.</p>
          <label class="btn-secondary file-btn"><i class="fas fa-upload" aria-hidden="true"></i> Choose backup file<input type="file" accept="application/json,.json" data-import hidden></label>
          <p class="form-msg" data-import-msg role="status"></p>
        </div>
      </div>`;
  }

  async function restore(input) {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const msg = document.querySelector("[data-import-msg]");
    msg.className = "form-msg";
    msg.textContent = "Reading the file…";
    try {
      const backup = JSON.parse(await file.text());
      if (backup.format !== "gum-guild-wars-backup") throw new Error("That file isn't a GUM Guild Wars backup.");
      const counts = `${(backup.guilds || []).length} guilds, ${(backup.players || []).length} bladers and ${(backup.season?.matches || []).length} fixtures`;
      if (!window.confirm(`Restore the backup from ${new Date(backup.exportedAt).toLocaleString()}? It has ${counts}, and replaces everything on the dashboard now.`)) {
        msg.textContent = "";
        return;
      }
      msg.textContent = "Restoring…";
      const done = await GW.api("import", { method: "POST", body: { backup } });
      await GW.loadAll();
      msg.className = "form-msg ok";
      msg.textContent = `Restored ${done.guilds} guilds, ${done.players} bladers, ${done.fixtures} fixtures and ${done.results} results.`;
    } catch (err) {
      msg.className = "form-msg err";
      msg.textContent = err instanceof SyntaxError ? "That file isn't valid JSON." : esc(err.message);
    }
  }

  function init() {
    document.addEventListener("change", (e) => {
      if (e.target.matches("[data-import]")) restore(e.target);
    });
  }

  GW.registerTab({ id: "backup", label: "Backup", icon: "fa-box-archive", ownerOnly: true, init, render });
})();
