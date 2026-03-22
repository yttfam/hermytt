const { test, expect } = require('@playwright/test');

const TOKEN = 'hermytt-test-token';
const URL = `/?token=${TOKEN}`;

test.describe('Terminal', () => {

  test('page loads and WASM initializes', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    page.on('pageerror', err => logs.push('ERROR: ' + err.message));

    await page.goto(URL);
    await page.waitForTimeout(2000);

    console.log('Browser logs:', logs);
    expect(logs.some(l => l.includes('WASM initialized'))).toBeTruthy();
    expect(logs.some(l => l.includes('ERROR'))).toBeFalsy();
  });

  test('WebSocket connects and authenticates', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto(URL);
    await page.waitForTimeout(3000);

    console.log('Browser logs:', logs);
    expect(logs.some(l => l.includes('WS open, TOKEN: set'))).toBeTruthy();
    expect(logs.some(l => l.includes('auth:ok'))).toBeTruthy();
  });

  test('canvas exists and has dimensions', async ({ page }) => {
    await page.goto(URL);
    await page.waitForTimeout(2000);

    const canvas = await page.$('canvas');
    expect(canvas).not.toBeNull();

    const dims = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? { w: c.width, h: c.height } : null;
    });
    console.log('Canvas dims:', dims);
    expect(dims).not.toBeNull();
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
  });

  test('terminal receives PTY output', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto(URL);
    await page.waitForTimeout(3000);

    // Check if write() was called by looking at logs
    // Also check if the render loop is running
    const hasCanvas = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return false;
      // Check if canvas has any non-black pixels (terminal rendered something)
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, c.width, Math.min(c.height, 100)).data;
      // Look for any non-zero pixel (not pure black)
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 15 || data[i+1] > 15 || data[i+2] > 15) return true;
      }
      return false;
    });
    console.log('Canvas has content:', hasCanvas);
    console.log('Logs:', logs);
    expect(hasCanvas).toBeTruthy();
  });

  test('debug full flow', async ({ page }) => {
    const logs = [];
    const errors = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(URL);
    await page.waitForTimeout(4000);

    // Dump everything
    console.log('\n=== CONSOLE LOGS ===');
    logs.forEach(l => console.log(l));
    console.log('\n=== PAGE ERRORS ===');
    errors.forEach(e => console.log(e));

    // Check DOM state
    const state = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const containers = document.querySelectorAll('.term-container');
      const activeContainer = document.querySelector('.term-container.active');
      const status = document.getElementById('status-text')?.textContent;

      return {
        canvas: canvas ? { w: canvas.width, h: canvas.height, display: canvas.style.display } : null,
        containers: containers.length,
        activeContainer: activeContainer ? {
          id: activeContainer.id,
          display: getComputedStyle(activeContainer).display,
          width: activeContainer.offsetWidth,
          height: activeContainer.offsetHeight,
        } : null,
        status,
      };
    });
    console.log('\n=== DOM STATE ===');
    console.log(JSON.stringify(state, null, 2));

    // Check if sessions map has entries
    const sessionState = await page.evaluate(() => {
      // Access the module-scoped sessions via a hack — check if tabs exist
      const tabs = document.querySelectorAll('.tab[data-id]');
      return {
        tabCount: tabs.length,
        tabIds: [...tabs].map(t => t.dataset.id),
      };
    });
    console.log('\n=== SESSION STATE ===');
    console.log(JSON.stringify(sessionState, null, 2));

    expect(errors.length).toBe(0);
  });
});
