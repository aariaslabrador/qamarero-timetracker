const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { login } = require('./qpos/browser');
const { fichar } = require('./qpos/personal');
const store = require('./store');

const ERRORS_DIR = path.join(__dirname, '..', 'data', 'errors');

async function runFichar({ employee, action }) {
  const headless = process.env.HEADLESS !== 'false';
  const startedAt = new Date().toISOString();
  let browser = null;

  try {
    const restaurantName = process.env.RESTAURANT_NAME;
    browser = await chromium.launch({ headless });
    const page = await browser.newPage();
    await login(page, process.env.ACCESS_PHONE, process.env.ACCESS_PIN, restaurantName);
    await fichar(page, {
      name: employee.name,
      pin: employee.pin,
      action,
      restaurantName,
      displayName: employee.displayName,
    });

    store.addLog({
      employeeId: employee.id,
      employeeName: employee.name,
      action,
      status: 'ok',
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    let screenshot = null;
    try {
      if (browser) {
        fs.mkdirSync(ERRORS_DIR, { recursive: true });
        screenshot = path.join(ERRORS_DIR, `${action}-${employee.id}-${Date.now()}.png`);
        const pages = browser.contexts().flatMap((c) => c.pages());
        if (pages[0]) await pages[0].screenshot({ path: screenshot });
        else screenshot = null;
      }
    } catch {
      screenshot = null;
    }

    const message = browser
      ? err.message
      : `No se pudo abrir el navegador (Chromium): ${err.message}. ` +
        'Ejecuta "npx playwright install chromium" en el servidor y vuelve a intentarlo.';

    store.addLog({
      employeeId: employee.id,
      employeeName: employee.name,
      action,
      status: 'error',
      error: message,
      screenshot,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return { ok: false, error: message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { runFichar };
