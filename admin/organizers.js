/* Organizers tab (owner only): add organizers, reset passwords, remove access. */
(function () {
  "use strict";

  const { esc } = GW;
  let users = [];

  // A readable temporary password: 4 groups of 4 letters/digits (no look-alikes).
  function tempPassword() {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
  }

  async function render(panel) {
    panel.innerHTML = `
      <div class="admin-head">
        <div>
          <h1 class="section-title">Organizers</h1>
          <p class="section-note">People who can sign in to this admin. Organizers can edit guilds, bladers, the schedule and scores. Only owners can manage accounts and backups.</p>
        </div>
        <button class="btn-primary admin-add" data-org-add><i class="fas fa-user-plus" aria-hidden="true"></i> Add organizer</button>
      </div>
      <ul class="admin-list" id="org-list"><li class="admin-row empty-row"><span class="muted">Loading…</span></li></ul>`;
    try {
      ({ users } = await GW.api("accounts"));
      drawList();
    } catch (err) {
      panel.querySelector("#org-list").innerHTML = `<li class="admin-row empty-row"><span class="warn">${esc(err.message)}</span></li>`;
    }
  }

  function drawList() {
    const me = GW.data.user.username;
    document.getElementById("org-list").innerHTML = users
      .map(
        (u) => `
        <li class="admin-row">
          <span class="avatar" aria-hidden="true">${esc(GW.initials(u.displayName))}</span>
          <div>
            <div class="name">${esc(u.displayName)}${u.username === me ? ' <span class="muted">(you)</span>' : ""}</div>
            <div class="meta"><span>${esc(u.username)}</span><span>${u.role === "owner" ? "Owner" : "Organizer"}</span>${u.mustChangePassword ? '<span class="warn">Hasn\'t set their own password yet</span>' : ""}</div>
          </div>
          <div class="actions">
            ${u.role === "owner"
              ? ""
              : `<button class="btn-secondary" data-org-reset="${esc(u.username)}"><i class="fas fa-key" aria-hidden="true"></i> Reset password</button>
                 <button class="btn-secondary danger" data-org-remove="${esc(u.username)}"><i class="fas fa-user-minus" aria-hidden="true"></i> Remove</button>`}
          </div>
        </li>`
      )
      .join("");
  }

  // Shows the temporary password once so the owner can pass it on.
  function showTempPassword(title, name, username, password) {
    GW.modal({
      title,
      body: `
        <div class="editor-form">
          <p>Send these details to ${esc(name)}. They'll be asked to choose their own password when they first sign in.</p>
          <dl class="credential">
            <dt>Sign-in page</dt><dd><code>${esc(location.origin)}/admin</code></dd>
            <dt>Username</dt><dd><code>${esc(username)}</code></dd>
            <dt>Temporary password</dt><dd><code>${esc(password)}</code></dd>
          </dl>
          <p class="hint">This password isn't shown again. If it's lost, reset it.</p>
          <div class="editor-actions"><span class="spacer"></span><button class="btn-primary" data-modal-close>Done</button></div>
        </div>`,
    });
  }

  function openAdd() {
    const password = tempPassword();
    const { el, close } = GW.modal({
      title: "Add organizer",
      body: `
        <form class="editor-form" novalidate>
          <div class="field"><label for="o-name">Their name</label><input id="o-name" class="form-control" maxlength="40" required></div>
          <div class="field"><label for="o-user">Username</label><input id="o-user" class="form-control" maxlength="24" autocapitalize="none" spellcheck="false" required>
            <p class="hint">3–24 characters: letters, numbers, - and _.</p></div>
          <div class="field"><label for="o-pass">Temporary password</label><input id="o-pass" class="form-control" value="${esc(password)}" spellcheck="false" required>
            <p class="hint">They'll replace it with their own when they first sign in.</p></div>
          <p class="form-msg err" data-msg role="alert"></p>
          <div class="editor-actions"><span class="spacer"></span><button type="button" class="btn-secondary" data-modal-close>Cancel</button><button type="submit" class="btn-primary">Add organizer</button></div>
        </form>`,
    });
    const q = (s) => el.querySelector(s);
    setTimeout(() => q("#o-name").focus(), 30);
    q("#o-name").addEventListener("input", () => {
      if (!q("#o-user").dataset.touched) q("#o-user").value = q("#o-name").value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 24);
    });
    q("#o-user").addEventListener("input", () => (q("#o-user").dataset.touched = "1"));
    q("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = { action: "add", displayName: q("#o-name").value, username: q("#o-user").value, password: q("#o-pass").value };
      try {
        ({ users } = await GW.api("accounts", { method: "POST", body }));
        close();
        drawList();
        showTempPassword("Organizer added", body.displayName || body.username, body.username.trim().toLowerCase(), body.password);
      } catch (err) {
        q("[data-msg]").textContent = err.message;
      }
    });
  }

  async function reset(username) {
    const u = users.find((x) => x.username === username);
    if (!window.confirm(`Reset ${u.displayName}'s password? They'll be signed out and need the new temporary password.`)) return;
    const password = tempPassword();
    try {
      ({ users } = await GW.api("accounts", { method: "POST", body: { action: "reset", username, password } }));
      drawList();
      showTempPassword("Password reset", u.displayName, username, password);
    } catch (err) {
      GW.toast(err.message);
    }
  }

  async function remove(username) {
    const u = users.find((x) => x.username === username);
    if (!window.confirm(`Remove ${u.displayName}? They're signed out straight away and can't sign in again.`)) return;
    try {
      ({ users } = await GW.api("accounts", { method: "POST", body: { action: "remove", username } }));
      drawList();
      GW.toast(`${u.displayName} removed.`);
    } catch (err) {
      GW.toast(err.message);
    }
  }

  function init() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-org-add]")) return openAdd();
      const r = e.target.closest("[data-org-reset]");
      if (r) return reset(r.dataset.orgReset);
      const d = e.target.closest("[data-org-remove]");
      if (d) remove(d.dataset.orgRemove);
    });
  }

  GW.registerTab({ id: "organizers", label: "Organizers", icon: "fa-users-gear", ownerOnly: true, init, render });
})();
