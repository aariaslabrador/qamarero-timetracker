require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const store = require('./store');
const { runFichar } = require('./runner');
const { checkCredentials, requireAuth } = require('./auth');
const scheduler = require('./scheduler');
const { sendTelegramMessage } = require('./telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// Detrás de un proxy inverso (nginx) que termina el HTTPS, hay que decirle
// a Express que confíe en la cabecera X-Forwarded-Proto para que sepa que
// la conexión real es segura; si no, la cookie de sesión "secure" nunca se
// enviaría y el login se rompería en producción.
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
if (TRUST_PROXY) app.set('trust proxy', 1);

// El servidor debe seguir vivo aunque un fichaje falle de forma inesperada
// (p. ej. Chromium no instalado, timeout de red): si no, deja de fichar a
// todo el mundo hasta que alguien lo reinicie a mano.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
  sendTelegramMessage(`⚠️ Error inesperado en Qamarero Timetracker: ${err && err.message ? err.message : err}`);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  sendTelegramMessage(`⚠️ Error inesperado en Qamarero Timetracker: ${err && err.message ? err.message : err}`);
});

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    proxy: TRUST_PROXY,
    cookie: { maxAge: 12 * 60 * 60 * 1000, secure: TRUST_PROXY },
  })
);

// Login público, el resto del sitio (estáticos + API) queda protegido.
app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (checkCredentials(user, pass)) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Rutas accesibles sin sesión: la propia página de login, su endpoint, y
// los estáticos que esa página necesita para no verse sin estilo.
const PUBLIC_PATHS = new Set(['/login.html', '/api/login', '/styles.css']);

app.use((req, res, next) => {
  if (PUBLIC_PATHS.has(req.path)) return next();
  return requireAuth(req, res, next);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateVenuePayload(body) {
  const errors = [];
  if (!body.name || !String(body.name).trim()) errors.push('El nombre del local es obligatorio');
  if (!/^\d{6,15}$/.test(String(body.accessPhone || ''))) errors.push('El teléfono de acceso debe tener solo dígitos (entre 6 y 15)');
  if (!/^\d{4}$/.test(String(body.accessPin || ''))) errors.push('El PIN de acceso debe tener 4 dígitos');
  return { errors };
}

app.get('/api/venues', (req, res) => {
  res.json(store.listVenues());
});

app.post('/api/venues', (req, res) => {
  const { errors } = validateVenuePayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const venue = store.createVenue({
    name: String(req.body.name).trim(),
    restaurantName: String(req.body.restaurantName || req.body.name).trim(),
    accessPhone: String(req.body.accessPhone),
    accessPin: String(req.body.accessPin),
  });
  res.status(201).json(venue);
});

app.put('/api/venues/:id', (req, res) => {
  const existing = store.getVenue(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Local no encontrado' });

  const { errors } = validateVenuePayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const updated = store.updateVenue(req.params.id, {
    name: String(req.body.name).trim(),
    restaurantName: String(req.body.restaurantName || req.body.name).trim(),
    accessPhone: String(req.body.accessPhone),
    accessPin: String(req.body.accessPin),
  });
  res.json(updated);
});

app.delete('/api/venues/:id', (req, res) => {
  const employeeCount = store.listEmployees(req.params.id).length;
  if (employeeCount > 0) {
    return res.status(400).json({
      error: `No se puede eliminar: hay ${employeeCount} empleado(s) asignados a este local. Reasígnalos o bórralos primero.`,
    });
  }
  const ok = store.deleteVenue(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Local no encontrado' });
  res.json({ ok: true });
});

function validateEmployeePayload(body) {
  const errors = [];
  if (!body.name || !String(body.name).trim()) errors.push('El nombre es obligatorio');
  if (!body.displayName || !String(body.displayName).trim()) {
    errors.push('El nombre tal cual aparece en Q-POS es obligatorio');
  }
  if (!body.venueId || !store.getVenue(body.venueId)) errors.push('Selecciona un local válido');
  if (!/^\d{4}$/.test(String(body.pin || ''))) errors.push('El PIN debe tener 4 dígitos');

  const TIME_RE = /^\d{2}:\d{2}$/;
  const rawSchedule = Array.isArray(body.schedule) ? body.schedule : [];
  const schedule = [];
  const seenDays = new Set();
  for (const s of rawSchedule) {
    if (!s || !DAY_KEYS.includes(s.day)) {
      errors.push('Día de horario inválido');
      continue;
    }
    if (seenDays.has(s.day)) {
      errors.push('No puedes repetir el mismo día en el horario');
      continue;
    }
    if (!TIME_RE.test(s.start || '') || !TIME_RE.test(s.end || '')) {
      errors.push(`Horario inválido para ${s.day}`);
      continue;
    }
    if (s.start >= s.end) {
      errors.push(`En ${s.day}, la hora de entrada debe ser anterior a la de salida`);
      continue;
    }
    seenDays.add(s.day);
    schedule.push({ day: s.day, start: s.start, end: s.end });
  }
  if (schedule.length === 0) errors.push('Marca al menos un día de trabajo');

  let jitterMinutes = Number(body.jitterMinutes);
  if (Number.isNaN(jitterMinutes)) jitterMinutes = 0;
  jitterMinutes = Math.max(0, Math.min(scheduler.MAX_JITTER_MINUTES, Math.round(jitterMinutes)));

  const rawVacations = Array.isArray(body.vacations) ? body.vacations : [];
  const vacations = [];
  for (const v of rawVacations) {
    if (!v || !DATE_RE.test(v.from) || !DATE_RE.test(v.to)) {
      errors.push('Rango de vacaciones inválido');
      continue;
    }
    if (v.from > v.to) {
      errors.push('En cada rango de vacaciones la fecha de inicio no puede ser posterior a la de fin');
      continue;
    }
    vacations.push({ from: v.from, to: v.to });
  }

  return { errors, schedule, jitterMinutes, vacations };
}

app.get('/api/employees', (req, res) => {
  res.json(store.listEmployees(req.query.venueId));
});

app.post('/api/employees', (req, res) => {
  const { errors, schedule, jitterMinutes, vacations } = validateEmployeePayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const employee = store.createEmployee({
    name: String(req.body.name).trim(),
    pin: String(req.body.pin),
    active: req.body.active !== false,
    schedule,
    displayName: String(req.body.displayName || '').trim(),
    jitterMinutes,
    vacations,
    venueId: req.body.venueId,
  });
  res.status(201).json(employee);
});

app.put('/api/employees/:id', (req, res) => {
  const existing = store.getEmployee(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Empleado no encontrado' });

  const { errors, schedule, jitterMinutes, vacations } = validateEmployeePayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const updated = store.updateEmployee(req.params.id, {
    name: String(req.body.name).trim(),
    pin: String(req.body.pin),
    active: req.body.active !== false,
    schedule,
    displayName: String(req.body.displayName || '').trim(),
    jitterMinutes,
    vacations,
    venueId: req.body.venueId,
  });
  res.json(updated);
});

app.delete('/api/employees/:id', (req, res) => {
  const ok = store.deleteEmployee(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json({ ok: true });
});

// Disparo manual desde la web, útil para probar sin esperar a la hora programada.
app.post('/api/employees/:id/fichar', async (req, res) => {
  const employee = store.getEmployee(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

  const action = req.body && req.body.action;
  if (!['entrada', 'salida'].includes(action)) {
    return res.status(400).json({ error: "action debe ser 'entrada' o 'salida'" });
  }

  try {
    const result = await runFichar({ employee, action });
    if (!result.ok) return res.status(500).json(result);
    res.json(result);
  } catch (err) {
    console.error('[fichar] Error inesperado:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/logs', (req, res) => {
  res.json(store.listLogs());
});

app.delete('/api/logs', (req, res) => {
  store.clearLogs();
  res.json({ ok: true });
});

app.get('/api/logs/:id/screenshot', (req, res) => {
  const log = store.getLog(req.params.id);
  if (!log || !log.screenshot) return res.status(404).json({ error: 'No hay captura para este fichaje' });
  if (!fs.existsSync(log.screenshot)) return res.status(404).json({ error: 'La captura ya no existe en el servidor' });
  res.sendFile(log.screenshot);
});

app.get('/api/settings', (req, res) => {
  res.json(store.getSettings());
});

app.put('/api/settings', (req, res) => {
  res.json(store.updateSettings({ timezone: req.body.timezone }));
});

app.post('/api/test-telegram', async (req, res) => {
  const result = await sendTelegramMessage('✅ Notificaciones de Qamarero Timetracker configuradas correctamente.');
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Qamarero Timetracker escuchando en http://localhost:${PORT}`);
  scheduler.start();
});
