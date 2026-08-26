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
  const browser = await chromium.launch({ headless });
  try {
    const page = await browser.newPage();
    await login(page, process.env.ACCESS_PHONE, process.env.ACCESS_PIN);
    await fichar(page, { name: employee.name, pin: employee.pin, action });

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
      fs.mkdirSync(ERRORS_DIR, { recursive: true });
      screenshot = path.join(ERRORS_DIR, `${action}-${employee.id}-${Date.now()}.png`);
      const pages = browser.contexts().flatMap((c) => c.pages());
      if (pages[0]) await pages[0].screenshot({ path: screenshot });
    } catch {
      screenshot = null;
    }

    store.addLog({
      employeeId: employee.id,
      employeeName: employee.name,
      action,
      status: 'error',
      error: err.message,
      screenshot,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return { ok: false, error: err.message };
  } finally {
    await browser.close();
  }
}

module.exports = { runFichar };
