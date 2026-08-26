const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  settings: { timezone: 'Europe/Madrid' },
  employees: [],
  logs: [],
};

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function load() {
  ensureFile();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const db = JSON.parse(raw);
  db.settings = db.settings || DEFAULT_DB.settings;
  db.employees = db.employees || [];
  db.logs = db.logs || [];
  return db;
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

function listEmployees() {
  return load().employees;
}

function getEmployee(id) {
  return load().employees.find((e) => e.id === id) || null;
}

function createEmployee({ name, pin, active = true, days = [], start = '09:00', end = '17:00' }) {
  const db = load();
  const employee = {
    id: crypto.randomUUID(),
    name,
    pin,
    active,
    days,
    start,
    end,
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

module.exports = {
  getSettings,
  updateSettings,
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  addLog,
  listLogs,
};
