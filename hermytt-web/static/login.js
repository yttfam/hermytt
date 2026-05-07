"use strict";
(() => {
  // src-ts/login.ts
  function $(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`#${id} not found`);
    return el;
  }
  function safeNext() {
    const next = new URLSearchParams(location.search).get("next") || "/";
    return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.toLowerCase().startsWith("javascript:") ? next : "/";
  }
  function showErr(text) {
    const err = $("err");
    err.textContent = text;
    err.style.display = "block";
  }
  fetch("/auth/me", { credentials: "same-origin" }).then((r) => r.json()).then((d) => {
    if (d && d.username) location.href = safeNext();
  }).catch(() => {
  });
  for (const id of ["username", "password"]) {
    $(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        $("form").requestSubmit();
      }
    });
  }
  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = $("username").value.trim();
    const password = $("password").value;
    if (!username) {
      $("username").focus();
      return;
    }
    if (!password) {
      $("password").focus();
      return;
    }
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        sessionStorage.removeItem("hermytt-token");
        location.href = safeNext();
      } else {
        const d = await res.json().catch(() => ({}));
        showErr(d.error || "invalid credentials");
      }
    } catch {
      showErr("connection failed");
    }
  });
  $("tokenform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = $("token").value.trim();
    if (!token) return;
    try {
      const res = await fetch("/info", { headers: { "X-Hermytt-Key": token } });
      if (res.ok) {
        sessionStorage.setItem("hermytt-token", token);
        location.href = safeNext();
      } else {
        showErr("invalid token");
      }
    } catch {
      showErr("connection failed");
    }
  });
})();
