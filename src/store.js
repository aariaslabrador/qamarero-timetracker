const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  settings: { timezone: 'Europe/Madrid' },
  venues: [],
  employees: [],
  logs: [],
};

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

// La app empezó con un único local configurado por variables de entorno
// (ACCESS_PHONE/ACCESS_PIN/RESTAURANT_NAME). Al pasar a multi-local, si
// todavía no hay ningún local guardado pero esas variables existen, se crea
// automáticamente un primer local con ellas y se le asignan los empleados
// que aún no tuvieran uno — así una instalación ya en producción no pierde
// nada al actualizar.
function migrateLegacyVenue(db) {
  if (db.venues.length > 0) return db;
  if (!process.env.ACCESS_PHONE || !process.env.ACCESS_PIN) return db;

  const venue = {
    id: crypto.randomUUID(),
    name: process.env.RESTAURANT_NAME || 'Local principal',
    restaurantName: process.env.RESTAURANT_NAME || '',
    accessPhone: process.env.ACCESS_PHONE,
    accessPin: process.env.ACCESS_PIN,
    createdAt: new Date().toISOString(),
  };
  db.venues.push(venue);
  db.employees = db.employees.map((e) => (e.venueId ? e : { ...e, venueId: venue.id }));
  save(db);
  return db;
}

// Los empleados guardaban un único horario (days[] + start + end) aplicado
// a todos sus días de trabajo. Al pasar a horario por día, se convierte a
// `schedule: [{ day, start, end }, ...]` la primera vez que se cargan.
function migrateLegacySchedule(db) {
  let changed = false;
  db.employees = db.employees.map((e) => {
    if (e.schedule) return e;
    changed = true;
    const { days, start, end, ...rest } = e;
    return {
      ...rest,
      schedule: (days || []).map((day) => ({ day, start, end })),
    };
  });
  if (changed) save(db);
  return db;
}

function load() {
  ensureFile();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  let db = JSON.parse(raw);
  db.settings = db.settings || DEFAULT_DB.settings;
  db.venues = db.venues || [];
  db.employees = db.employees || [];
  db.logs = db.logs || [];
  db = migrateLegacyVenue(db);
  return migrateLegacySchedule(db);
}

function save(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getSettings() {
  return load().settings;
}

function updateSettings(patch) {
  const db = load();
  db.settings = { ...db.settings, ...patch };
  save(db);
  return db.settings;
}

function listVenues() {
  return load().venues;
}

function getVenue(id) {
  return load().venues.find((v) => v.id === id) || null;
}

function createVenue({ name, restaurantName, accessPhone, accessPin }) {
  const db = load();
  const venue = {
    id: crypto.randomUUID(),
    name,
    restaurantName: restaurantName || name,
    accessPhone,
    accessPin,
    createdAt: new Date().toISOString(),
  };
  db.venues.push(venue);
  save(db);
  return venue;
}

function updateVenue(id, patch) {
  const db = load();
  const idx = db.venues.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  db.venues[idx] = { ...db.venues[idx], ...patch, id };
  save(db);
  return db.venues[idx];
}

function deleteVenue(id) {
  const db = load();
  const before = db.venues.length;
  db.venues = db.venues.filter((v) => v.id !== id);
  save(db);
  return db.venues.length < before;
}

function listEmployees(venueId) {
  const employees = load().employees;
  return venueId ? employees.filter((e) => e.venueId === venueId) : employees;
}

function getEmployee(id) {
  return load().employees.find((e) => e.id === id) || null;
}

function createEmployee({
  name,
  pin,
  active = true,
  schedule = [],
  displayName = '',
  jitterMinutes = 5,
  vacations = [],
  venueId,
}) {
  const db = load();
  const employee = {
    id: crypto.randomUUID(),
    name,
    pin,
    active,
    schedule,
    displayName,
    jitterMinutes,
    vacations,
    venueId,
    createdAt: new Date().toISOString(),
  };
  db.employees.push(employee);
  save(db);
  return employee;
}

function updateEmployee(id, patch) {
  const db = load();
  const idx = db.employees.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  db.employees[idx] = { ...db.employees[idx], ...patch, id };
  save(db);
  return db.employees[idx];
}

function deleteEmployee(id) {
  const db = load();
  const before = db.employees.length;
  db.employees = db.employees.filter((e) => e.id !== id);
  save(db);
  return db.employees.length < before;
}

function addLog(entry) {
  const db = load();
  db.logs.unshift({ id: crypto.randomUUID(), ...entry });
  db.logs = db.logs.slice(0, 500);
  save(db);
}

function listLogs(limit = 100) {
  return load().logs.slice(0, limit);
}

function getLog(id) {
  return load().logs.find((l) => l.id === id) || null;
}

function clearLogs() {
  const db = load();
  db.logs = [];
  save(db);
}

module.exports = {
  getSettings,
  updateSettings,
  listVenues,
  getVenue,
  createVenue,
  updateVenue,
  deleteVenue,
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  addLog,
  listLogs,
  getLog,
  clearLogs,
};
