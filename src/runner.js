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

  const venue = employee.venueId ? store.getVenue(employee.venueId) : null;
  if (!venue) {
    const message = `${employee.name} no tiene un local asignado (o el local se eliminó). Edítalo desde el panel.`;
    store.addLog({
      employeeId: employee.id,
      employeeName: employee.name,
      action,
      status: 'error',
      error: message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return { ok: false, error: message };
  }

  try {
    const restaurantName = venue.restaurantName || venue.name;
    browser = await chromium.launch({ headless });
    const page = await browser.newPage();
    await login(page, venue.accessPhone, venue.accessPin, restaurantName);
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
        const candidate = path.join(ERRORS_DIR, `${action}-${employee.id}-${Date.now()}.png`);
        const pages = browser.contexts().flatMap((c) => c.pages());
        if (pages[0]) {
          await pages[0].screenshot({ path: candidate });
          screenshot = candidate;
        } else {
          console.error('[runner] No se pudo guardar captura: no hay ninguna página abierta en el navegador.');
        }
      }
    } catch (screenshotErr) {
      console.error('[runner] No se pudo guardar la captura del error:', screenshotErr.message);
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
