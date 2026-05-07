"use strict";
(() => {
  // src-ts/admin.ts
  var TOKEN = sessionStorage.getItem("hermytt-token") || "";
  var CURRENT_USER = null;
  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (TOKEN) h["X-Hermytt-Key"] = TOKEN;
    return h;
  }
  (async () => {
    try {
      const r = await fetch("/auth/me", { credentials: "same-origin" });
      if (r.ok) {
        const d = await r.json();
        if (d.username) {
          CURRENT_USER = d.username;
          const slot = document.getElementById("whoami");
          if (slot) slot.textContent = d.username;
          return;
        }
      }
    } catch (e) {
    }
    if (TOKEN) {
      try {
        const r2 = await fetch("/info", { headers: { "X-Hermytt-Key": TOKEN } });
        if (r2.ok) return;
      } catch (e) {
      }
    }
    location.href = "/login?next=" + encodeURIComponent(location.pathname);
  })();
  var esc = (s) => {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  };
  function banner(msg, cls) {
    const el = document.getElementById("banner-area");
    el.textContent = msg;
    el.className = "banner " + cls;
  }
  function relTime(ts) {
    if (!ts) return "-";
    const secs = Math.floor(Date.now() / 1e3 - ts);
    if (secs < 5) return "now";
    if (secs < 60) return secs + "s ago";
    if (secs < 3600) return Math.floor(secs / 60) + "m ago";
    return Math.floor(secs / 3600) + "h ago";
  }
  async function refreshFamily() {
    try {
      const res = await fetch("/registry", { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const services = data.services || [];
      document.getElementById("s-services").textContent = services.filter((s) => s.status === "connected").length;
      document.getElementById("svc-count").textContent = services.length ? ` (${services.length})` : "";
      const tbody = document.getElementById("family-table");
      if (!services.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row">no family members connected</td></tr>';
        return;
      }
      tbody.innerHTML = services.map((s) => {
        const on = s.status === "connected";
        const dotCls = on ? "dot-on" : "dot-off";
        const role = (s.role || "shell").toLowerCase();
        const configurable = on && s.endpoint.startsWith("http");
        const rowCls = configurable ? "svc-configurable" : "";
        const click = configurable ? `onclick="openServicePanel('${esc(s.name)}')"` : "";
        return `<tr class="${rowCls}" ${click}>
        <td><span class="dot ${dotCls}"></span></td>
        <td>${esc(s.name)}${configurable ? " \u2699" : ""}</td>
        <td><span class="role role-${role}">${esc(role)}</span></td>
        <td style="color:var(--text-dim)">${esc(s.meta?.host || s.name)}</td>
        <td><span class="meta-tag">${esc(s.endpoint === "control-ws" ? "mode 1" : s.endpoint === "paired" ? "mode 2" : s.endpoint || "-")}</span></td>
        <td style="color:var(--text-muted)">${relTime(s.last_seen)}</td>
      </tr>`;
      }).join("");
    } catch (e) {
    }
  }
  async function refreshSessions() {
    const res = await fetch("/sessions", { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById("s-sessions").textContent = data.sessions.length;
    const tbody = document.getElementById("sessions-table");
    tbody.innerHTML = data.sessions.map((s) => `
    <tr>
      <td><span class="dot dot-on"></span></td>
      <td><span class="session-name" ondblclick="renameSession('${esc(s.id)}',this)" title="double-click to rename">${esc(s.name || s.id)}</span>${s.host ? ' <span class="meta-tag">' + esc(s.host) + "</span>" : ""}</td>
      <td style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
        <a href="/#${encodeURIComponent(s.id)}" class="btn">open</a>
        <button class="btn btn-red" onclick="killSession('${esc(s.id)}')">kill</button>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="3" class="empty-row">no sessions</td></tr>';
  }
  document.getElementById("btn-add-host").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Pair Host";
    document.getElementById("modal-fields").innerHTML = `
    <div class="field">
      <label>pairing token</label>
      <input type="text" id="pair-token" placeholder="paste token from shytti pair" spellcheck="false" autocomplete="off">
      <div class="hint">run "shytti pair" on the target machine, paste the token here</div>
    </div>
  `;
    document.getElementById("modal-bg").classList.add("active");
    document.getElementById("modal-save").onclick = async () => {
      const token = document.getElementById("pair-token").value.trim();
      if (!token) return;
      closeModal();
      banner("pairing...", "warn");
      const res = await fetch("/hosts/pair", { method: "POST", headers: authHeaders(), body: JSON.stringify({ token }) });
      const data = await res.json();
      if (!res.ok) {
        banner(data.error || "pairing failed", "err");
        return;
      }
      banner("paired with " + data.name, "ok");
      setTimeout(() => document.getElementById("banner-area").className = "banner", 3e3);
      refreshAll();
    };
  });
  document.getElementById("btn-kill-all").addEventListener("click", async () => {
    const r = await fetch("/sessions", { headers: authHeaders() });
    if (!r.ok) return banner("failed to list sessions", "err");
    const data = await r.json();
    const ids = (data.sessions || []).map((s) => s.id);
    if (!ids.length) return banner("no sessions", "warn");
    if (!confirm(`Kill all ${ids.length} sessions? This is irreversible.`)) return;
    banner(`killing ${ids.length}\u2026`, "warn");
    let killed = 0, failed = 0;
    await Promise.all(ids.map(async (id) => {
      const r2 = await fetch("/internal/session/" + encodeURIComponent(id), { method: "DELETE", headers: authHeaders() });
      if (r2.ok) killed++;
      else failed++;
    }));
    banner(`killed ${killed}${failed ? `, ${failed} failed` : ""}`, failed ? "warn" : "ok");
    setTimeout(() => document.getElementById("banner-area").className = "banner", 4e3);
    refreshSessions();
  });
  async function refreshInfo() {
    try {
      const res = await fetch("/info", { headers: authHeaders() });
      if (!res.ok) {
        document.getElementById("s-status").textContent = "error";
        return;
      }
      const data = await res.json();
      document.getElementById("s-status").textContent = "online";
      document.getElementById("s-shell").textContent = data.shell?.split("/").pop() || "-";
    } catch (e) {
      document.getElementById("s-status").textContent = "offline";
    }
  }
  document.getElementById("btn-new-session").addEventListener("click", async () => {
    let hosts = [];
    try {
      const res = await fetch("/hosts", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        hosts = data.hosts || [];
      }
    } catch (e) {
    }
    if (hosts.length === 0) {
      banner("no hosts connected \u2014 deploy shytti first", "err");
      return;
    }
    if (hosts.length === 1) {
      const url = "/hosts/" + encodeURIComponent(hosts[0].name) + "/spawn";
      const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) {
        banner(data.error || "spawn failed", "err");
      }
      refreshSessions();
      return;
    }
    const modal = document.getElementById("modal-fields");
    document.getElementById("modal-title").textContent = "New Session";
    modal.innerHTML = `
    <div class="field"><label>host</label>
    <select id="host-select" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;font-family:var(--font);font-size:11px;border-radius:3px">
      ${hosts.map((h) => `<option value="${esc(h.name)}">${esc(h.name)}${h.meta?.host ? " (" + esc(h.meta.host) + ")" : ""}</option>`).join("")}
    </select></div>
  `;
    document.getElementById("modal-bg").classList.add("active");
    document.getElementById("modal-save").onclick = async () => {
      const host = document.getElementById("host-select").value;
      closeModal();
      const url = "/hosts/" + encodeURIComponent(host) + "/spawn";
      const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) {
        banner(data.error || "spawn failed", "err");
      }
      refreshSessions();
    };
  });
  document.getElementById("btn-exec").addEventListener("click", runExec);
  document.getElementById("exec-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runExec();
  });
  async function runExec() {
    const input = document.getElementById("exec-input");
    const output = document.getElementById("exec-out");
    const cmd = input.value.trim();
    if (!cmd) return;
    output.style.display = "block";
    output.textContent = "...";
    const res = await fetch("/exec", { method: "POST", headers: authHeaders(), body: JSON.stringify({ input: cmd }) });
    if (!res.ok) {
      output.textContent = `err ${res.status}`;
      return;
    }
    const data = await res.json();
    let text = data.stdout || "";
    if (data.stderr) text += (text ? "\n" : "") + data.stderr;
    if (data.exit_code !== 0) text += `
[exit ${data.exit_code}]`;
    output.textContent = text || "(empty)";
    input.value = "";
  }
  var config = null;
  var dirty = false;
  var TRANSPORT_DEFS = {
    rest: { label: "REST + WS", fields: [{ key: "port", label: "Port", type: "number", required: true, default: 7777 }] },
    mqtt: { label: "MQTT", fields: [
      { key: "broker", label: "Broker", type: "text", required: true, placeholder: "mqtt.example.com" },
      { key: "port", label: "Port", type: "number", default: 1883 },
      { key: "username", label: "User", type: "text" },
      { key: "password", label: "Pass", type: "password" }
    ] },
    mqtt_pty: { label: "MQTT PTY", fields: [
      { key: "buffer_ms", label: "Buffer (ms)", type: "number", default: 200, hint: "output batching window \u2014 0 for raw passthrough" }
    ], requires: "mqtt" },
    tcp: { label: "TCP", fields: [{ key: "port", label: "Port", type: "number", required: true, default: 7779 }] }
  };
  async function loadConfig() {
    try {
      const res = await fetch("/config", { headers: authHeaders() });
      if (res.status === 404) {
        config = {};
        return;
      }
      if (!res.ok) return;
      config = await res.json();
    } catch (e) {
      config = {};
    }
    renderTransports();
  }
  function isEnabled(n) {
    return config?.transport?.[n] != null;
  }
  function getTC(n) {
    return config?.transport?.[n] || {};
  }
  function renderTransports() {
    const tbody = document.getElementById("transports-table");
    tbody.innerHTML = Object.entries(TRANSPORT_DEFS).map(([name, def]) => {
      const on = isEnabled(name);
      const cfg = getTC(name);
      let ep = "-";
      if (on) {
        if (name === "mqtt_pty") {
          const mc = getTC("mqtt");
          ep = mc.broker ? mc.broker + ":" + (mc.port || 1883) : "(via mqtt)";
        } else if (cfg.port) ep = ":" + cfg.port;
        else if (cfg.broker) ep = cfg.broker + ":" + (cfg.port || 1883);
      }
      return `<tr>
      <td><label class="toggle"><input type="checkbox" data-t="${esc(name)}" ${on ? "checked" : ""}><span class="sl"></span></label></td>
      <td><span class="dot ${on ? "dot-on" : "dot-off"}"></span>${esc(def.label)}</td>
      <td style="color:var(--text-dim)">${esc(ep)}</td>
      <td style="text-align:right"><button class="btn" data-edit="${esc(name)}" ${!on ? 'disabled style="opacity:0.2"' : ""}>edit</button></td>
    </tr>`;
    }).join("");
    tbody.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const n = cb.dataset.t;
        const def = TRANSPORT_DEFS[n];
        if (!config.transport) config.transport = {};
        if (cb.checked) {
          if (def.requires && !isEnabled(def.requires)) {
            cb.checked = false;
            banner(def.label + " requires " + TRANSPORT_DEFS[def.requires].label, "err");
            setTimeout(() => document.getElementById("banner-area").className = "banner", 3e3);
            return;
          }
          const d = {};
          def.fields.forEach((f) => {
            if (f.default != null) d[f.key] = f.default;
          });
          config.transport[n] = d;
        } else {
          delete config.transport[n];
          Object.entries(TRANSPORT_DEFS).forEach(([dn, dd]) => {
            if (dd.requires === n && isEnabled(dn)) delete config.transport[dn];
          });
        }
        dirty = true;
        renderTransports();
        saveConfig();
      });
    });
    tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openEditModal(b.dataset.edit)));
    const saveBtn = document.getElementById("btn-save-transports");
    saveBtn.style.opacity = dirty ? 1 : 0.3;
    saveBtn.style.pointerEvents = dirty ? "auto" : "none";
    if (dirty) {
      saveBtn.textContent = "\u25CF Save changes";
      saveBtn.style.background = "var(--accent)";
      saveBtn.style.color = "#000";
    } else {
      saveBtn.textContent = "Save";
      saveBtn.style.background = "";
      saveBtn.style.color = "";
    }
  }
  function openEditModal(name) {
    const def = TRANSPORT_DEFS[name];
    const cfg = getTC(name);
    document.getElementById("modal-title").textContent = def.label;
    const fields = document.getElementById("modal-fields");
    fields.innerHTML = def.fields.map((f) => {
      let v = cfg[f.key] ?? "";
      if (f.key === "chat_ids" && Array.isArray(v)) v = v.join(", ");
      return `<div class="field"><label>${esc(f.label)}${f.required ? " *" : ""}</label><input type="${f.type || "text"}" data-key="${esc(f.key)}" value="${esc(String(v))}" placeholder="${esc(f.placeholder || "")}">
    ${f.hint ? '<div class="hint">' + esc(f.hint) + "</div>" : ""}</div>`;
    }).join("");
    document.getElementById("modal-bg").classList.add("active");
    document.getElementById("modal-save").onclick = () => {
      const u = {};
      let ok = true;
      fields.querySelectorAll("input").forEach((i) => {
        const k = i.dataset.key, fd = def.fields.find((f) => f.key === k);
        let v = i.value.trim();
        i.parentElement.querySelector(".error")?.remove();
        if (fd.required && !v) {
          const e = document.createElement("div");
          e.className = "error";
          e.textContent = "required";
          i.parentElement.appendChild(e);
          ok = false;
          return;
        }
        if (!v) return;
        if (fd.type === "number") {
          const n = parseInt(v);
          if (isNaN(n) || n < 1 || n > 65535) {
            const e = document.createElement("div");
            e.className = "error";
            e.textContent = "1-65535";
            i.parentElement.appendChild(e);
            ok = false;
            return;
          }
          u[k] = n;
        } else if (k === "chat_ids") u[k] = v.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
        else u[k] = v;
      });
      if (!ok) return;
      if (!config.transport) config.transport = {};
      config.transport[name] = u;
      dirty = true;
      closeModal();
      renderTransports();
      saveConfig();
    };
  }
  function closeModal() {
    document.getElementById("modal-bg").classList.remove("active");
    document.getElementById("modal-box").classList.remove("wide");
    document.getElementById("modal-save").style.display = "";
  }
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-bg").addEventListener("click", (e) => {
    if (e.target.id === "modal-bg") closeModal();
  });
  async function saveConfig() {
    if (!dirty) return;
    const payload = Object.fromEntries(Object.entries(config).filter(([k]) => k !== "auth"));
    const res = await fetch("/config", { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) {
      banner(data.error || "save failed", "err");
      return;
    }
    dirty = false;
    renderTransports();
    banner("saved \u2014 restart to apply", "warn");
    document.getElementById("btn-restart").style.display = "inline-block";
  }
  document.getElementById("btn-save-transports").addEventListener("click", saveConfig);
  document.getElementById("btn-restart").addEventListener("click", async () => {
    if (!confirm("Restart hermytt? Active sessions will terminate.")) return;
    banner("restarting...", "warn");
    await fetch("/restart", { method: "POST", headers: authHeaders() });
    document.getElementById("btn-restart").style.display = "none";
    let n = 0;
    const poll = setInterval(async () => {
      n++;
      try {
        const r = await fetch("/info", { headers: authHeaders() });
        if (r.ok) {
          clearInterval(poll);
          banner("restarted", "ok");
          setTimeout(() => document.getElementById("banner-area").className = "banner", 3e3);
          loadConfig();
          refreshAll();
        }
      } catch (e) {
        if (n > 30) {
          clearInterval(poll);
          banner("server did not come back", "err");
        }
      }
    }, 1e3);
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  async function refreshUsers() {
    try {
      const r = await fetch("/auth/users", authFetchOpts());
      if (!r.ok) {
        document.getElementById("users-table").innerHTML = `<tr><td class="empty-row">unable to load users</td></tr>`;
        return;
      }
      const d = await r.json();
      const users = d.users || [];
      document.getElementById("users-count").textContent = users.length ? `(${users.length})` : "";
      if (!users.length) {
        document.getElementById("users-table").innerHTML = `<tr><td class="empty-row">no users yet \u2014 add one to enable login</td></tr>`;
        return;
      }
      document.getElementById("users-table").innerHTML = users.map((u) => {
        const last = u.last_login ? relTime(u.last_login) : '<span style="color:var(--text-muted)">never</span>';
        const isMe = CURRENT_USER === u.username;
        return `<tr>
        <td><span class="dot dot-on"></span></td>
        <td>${esc(u.username)}${isMe ? ' <span class="meta-tag">you</span>' : ""}</td>
        <td style="color:var(--text-dim)">last login ${last}</td>
        <td style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
          <button class="btn" onclick="changePassword('${esc(u.username)}')">change password</button>
          ${isMe ? "" : `<button class="btn btn-red" onclick="deleteUser('${esc(u.username)}')">remove</button>`}
        </td>
      </tr>`;
      }).join("");
    } catch (e) {
    }
  }
  function authFetchOpts(opts = {}) {
    return Object.assign({ credentials: "same-origin" }, opts, {
      headers: Object.assign({}, opts.headers || {}, authHeaders())
    });
  }
  document.getElementById("btn-add-user").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Add user";
    document.getElementById("modal-fields").innerHTML = `
    <div class="field"><label>username</label><input type="text" id="new-username" autocomplete="off"></div>
    <div class="field"><label>password (min 6)</label><input type="password" id="new-password" autocomplete="new-password"></div>`;
    document.getElementById("modal-bg").classList.add("active");
    document.getElementById("modal-save").onclick = async () => {
      const username = document.getElementById("new-username").value.trim();
      const password = document.getElementById("new-password").value;
      if (!username || password.length < 6) return banner("username + 6+ char password required", "err");
      const r = await fetch("/auth/users", { method: "POST", ...authFetchOpts({ headers: { "Content-Type": "application/json" } }), body: JSON.stringify({ username, password }) });
      if (r.ok) {
        closeModal();
        banner("user added", "ok");
        setTimeout(() => document.getElementById("banner-area").className = "banner", 3e3);
        refreshUsers();
      } else {
        const d = await r.json().catch(() => ({}));
        banner(d.error || "add failed", "err");
      }
    };
  });
  function refreshAll() {
    refreshInfo();
    refreshSessions();
    refreshFamily();
    refreshUsers();
  }
  loadConfig();
  refreshAll();
  setInterval(refreshAll, 5e3);
})();
