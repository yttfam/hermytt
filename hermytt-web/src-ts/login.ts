export {};

// hermytt /login — TypeScript port. Two forms: primary user/password (with
// belt-and-suspenders Enter handlers for password managers) and a legacy
// bearer-token fallback under <details>.

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

function safeNext(): string {
  const next = new URLSearchParams(location.search).get('next') || '/';
  return (next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') && !next.toLowerCase().startsWith('javascript:'))
    ? next
    : '/';
}

function showErr(text: string): void {
  const err = $('err');
  err.textContent = text;
  err.style.display = 'block';
}

// Skip the form entirely if already cookie-authed.
fetch('/auth/me', { credentials: 'same-origin' })
  .then(r => r.json())
  .then((d: { username?: string | null }) => {
    if (d && d.username) location.href = safeNext();
  })
  .catch(() => {});

// Some password managers / extensions intercept Enter — re-trigger submit.
for (const id of ['username', 'password']) {
  $<HTMLInputElement>(id).addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ($('form') as HTMLFormElement).requestSubmit();
    }
  });
}

$<HTMLFormElement>('form').addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  const username = $<HTMLInputElement>('username').value.trim();
  const password = $<HTMLInputElement>('password').value;
  if (!username) { $('username').focus(); return; }
  if (!password) { $('password').focus(); return; }
  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      sessionStorage.removeItem('hermytt-token');  // legacy cleanup
      location.href = safeNext();
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string };
      showErr(d.error || 'invalid credentials');
    }
  } catch {
    showErr('connection failed');
  }
});

// Legacy bearer-token fallback.
$<HTMLFormElement>('tokenform').addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  const token = $<HTMLInputElement>('token').value.trim();
  if (!token) return;
  try {
    const res = await fetch('/info', { headers: { 'X-Hermytt-Key': token } });
    if (res.ok) {
      sessionStorage.setItem('hermytt-token', token);
      location.href = safeNext();
    } else {
      showErr('invalid token');
    }
  } catch {
    showErr('connection failed');
  }
});
