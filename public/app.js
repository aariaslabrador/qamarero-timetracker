const DAY_LABELS = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const employeesBody = document.getElementById('employees-body');
const employeesEmpty = document.getElementById('employees-empty');
const noVenueSelected = document.getElementById('no-venue-selected');
const logsBody = document.getElementById('logs-body');
const logsEmpty = document.getElementById('logs-empty');
const overlay = document.getElementById('employee-overlay');
const form = document.getElementById('employee-form');
const modalTitle = document.getElementById('modal-title');
const errorEl = document.getElementById('employee-error');
const venueSelect = document.getElementById('venue-select');
const addEmployeeBtn = document.getElementById('add-employee-btn');

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('No autenticado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error inesperado');
  return data;
}

function dayChips(schedule) {
  const activeDays = new Set(schedule.map((s) => s.day));
  return DAY_ORDER.map((d) => {
    const active = activeDays.has(d) ? 'active' : '';
    return `<span class="day-chip ${active}">${DAY_LABELS[d]}</span>`;
  }).join('');
}

function scheduleSummary(schedule) {
  if (!schedule.length) return '—';
  return schedule
    .slice()
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))
    .map((s) => `${DAY_LABELS[s.day]} ${s.start}–${s.end}`)
    .join(', ');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isOnVacationToday(emp) {
  const today = todayStr();
  return (emp.vacations || []).some((v) => today >= v.from && today <= v.to);
}

function renderEmployees(employees) {
  employeesBody.innerHTML = '';
  employeesEmpty.classList.toggle('hidden', employees.length > 0);

  for (const emp of employees) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        ${escapeHtml(emp.name)}
        ${emp.displayName ? `<div style="font-size:12px;color:var(--muted)">Q-POS: ${escapeHtml(emp.displayName)}</div>` : ''}
      </td>
      <td><div class="days">${dayChips(emp.schedule || [])}</div></td>
      <td style="font-size: 13px">${scheduleSummary(emp.schedule || [])}</td>
      <td>
        <span class="badge ${emp.active ? 'on' : 'off'}">${emp.active ? 'Activo' : 'Pausado'}</span>
        ${isOnVacationToday(emp) ? '<div style="margin-top:4px"><span class="badge off">De vacaciones</span></div>' : ''}
      </td>
      <td>
        <div class="row-actions">
          <button class="ghost" data-action="ficharentrada" data-id="${emp.id}">Fichar entrada</button>
          <button class="ghost" data-action="ficharsalida" data-id="${emp.id}">Fichar salida</button>
          <button class="ghost" data-action="edit" data-id="${emp.id}">Editar</button>
          <button class="danger" data-action="delete" data-id="${emp.id}">Eliminar</button>
        </div>
      </td>
    `;
    employeesBody.appendChild(tr);
  }
}

function renderLogs(logs) {
  logsBody.innerHTML = '';
  logsEmpty.classList.toggle('hidden', logs.length > 0);

  for (const log of logs) {
    const tr = document.createElement('tr');
    const date = new Date(log.startedAt).toLocaleString('es-ES');
    tr.innerHTML = `
      <td>${date}</td>
      <td>${escapeHtml(log.employeeName)}</td>
      <td>${log.action === 'entrada' ? 'Entrada' : 'Salida'}</td>
      <td><span class="badge ${log.status}">${log.status === 'ok' ? 'OK' : 'Error'}</span>
        ${log.status === 'error' ? `<div style="font-size:12px;color:#c0392b;margin-top:4px">${escapeHtml(log.error || '')}</div>` : ''}
      </td>
    `;
    logsBody.appendChild(tr);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

let employeesCache = [];
let venuesCache = [];
let selectedVenueId = localStorage.getItem('selectedVenueId') || '';

async function loadEmployees() {
  if (!selectedVenueId) {
    employeesCache = [];
    employeesBody.innerHTML = '';
    employeesEmpty.classList.add('hidden');
    noVenueSelected.classList.remove('hidden');
    return;
  }
  noVenueSelected.classList.add('hidden');
  employeesCache = await api(`/api/employees?venueId=${encodeURIComponent(selectedVenueId)}`);
  renderEmployees(employeesCache);
}

function renderVenueSelect() {
  if (!venuesCache.length) {
    venueSelect.innerHTML = '<option value="">Sin locales todavía</option>';
    selectedVenueId = '';
  } else {
    if (!venuesCache.some((v) => v.id === selectedVenueId)) {
      selectedVenueId = venuesCache[0].id;
    }
    venueSelect.innerHTML = venuesCache
      .map((v) => `<option value="${v.id}" ${v.id === selectedVenueId ? 'selected' : ''}>${escapeHtml(v.name)}</option>`)
      .join('');
  }
  localStorage.setItem('selectedVenueId', selectedVenueId);
  addEmployeeBtn.disabled = !selectedVenueId;
}

async function loadVenues() {
  venuesCache = await api('/api/venues');
  renderVenueSelect();
  renderVenuesList();
}

venueSelect.addEventListener('change', async () => {
  selectedVenueId = venueSelect.value;
  localStorage.setItem('selectedVenueId', selectedVenueId);
  addEmployeeBtn.disabled = !selectedVenueId;
  await loadEmployees();
});

async function loadLogs() {
  const logs = await api('/api/logs');
  renderLogs(logs);
}

let currentVacations = [];

function renderVacationList() {
  const container = document.getElementById('vacation-list');
  if (!currentVacations.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = currentVacations
    .map(
      (v, i) => `
        <div class="vacation-item">
          <span>${v.from} → ${v.to}</span>
          <button type="button" class="ghost" data-remove-vacation="${i}">Quitar</button>
        </div>
      `
    )
    .join('');
}

function setScheduleEditor(schedule) {
  const byDay = new Map(schedule.map((s) => [s.day, s]));
  document.querySelectorAll('#schedule-editor .schedule-row').forEach((row) => {
    const day = row.dataset.day;
    const enabled = row.querySelector('.schedule-enabled');
    const start = row.querySelector('.schedule-start');
    const end = row.querySelector('.schedule-end');
    const entry = byDay.get(day);

    enabled.checked = Boolean(entry);
    start.value = entry ? entry.start : '09:00';
    end.value = entry ? entry.end : '17:00';
    start.disabled = !entry;
    end.disabled = !entry;
  });
}

function readScheduleEditor() {
  const schedule = [];
  document.querySelectorAll('#schedule-editor .schedule-row').forEach((row) => {
    const enabled = row.querySelector('.schedule-enabled');
    if (!enabled.checked) return;
    schedule.push({
      day: row.dataset.day,
      start: row.querySelector('.schedule-start').value,
      end: row.querySelector('.schedule-end').value,
    });
  });
  return schedule;
}

document.getElementById('schedule-editor').addEventListener('change', (e) => {
  if (!e.target.classList.contains('schedule-enabled')) return;
  const row = e.target.closest('.schedule-row');
  row.querySelector('.schedule-start').disabled = !e.target.checked;
  row.querySelector('.schedule-end').disabled = !e.target.checked;
});

function openModal(employee) {
  form.reset();
  errorEl.textContent = '';
  document.getElementById('employee-id').value = employee ? employee.id : '';
  document.getElementById('employee-name').value = employee ? employee.name : '';
  document.getElementById('employee-display-name').value = employee ? employee.displayName || '' : '';
  document.getElementById('employee-pin').value = employee ? employee.pin : '';
  document.getElementById('employee-jitter').value = employee ? (employee.jitterMinutes ?? 5) : 5;
  document.getElementById('employee-active').checked = employee ? employee.active : true;

  setScheduleEditor(employee ? employee.schedule || [] : []);

  currentVacations = employee ? [...(employee.vacations || [])] : [];
  renderVacationList();

  modalTitle.textContent = employee ? 'Editar empleado' : 'Añadir empleado';
  overlay.classList.remove('hidden');
  overlay.scrollTop = 0;
  document.getElementById('employee-name').focus();
}

document.getElementById('add-vacation-btn').addEventListener('click', () => {
  const from = document.getElementById('vacation-from').value;
  const to = document.getElementById('vacation-to').value;
  if (!from || !to) {
    errorEl.textContent = 'Indica fecha de inicio y fin para añadir un rango de vacaciones';
    return;
  }
  if (from > to) {
    errorEl.textContent = 'La fecha de inicio no puede ser posterior a la de fin';
    return;
  }
  errorEl.textContent = '';
  currentVacations.push({ from, to });
  renderVacationList();
  document.getElementById('vacation-from').value = '';
  document.getElementById('vacation-to').value = '';
});

document.getElementById('vacation-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-remove-vacation]');
  if (!btn) return;
  currentVacations.splice(Number(btn.dataset.removeVacation), 1);
  renderVacationList();
});

function closeModal() {
  overlay.classList.add('hidden');
}

function renderVenuesList() {
  const container = document.getElementById('venues-list');
  if (!venuesCache.length) {
    container.innerHTML = '<p class="empty" style="padding: 0">Todavía no has añadido ningún local.</p>';
    return;
  }
  container.innerHTML = venuesCache
    .map(
      (v) => `
        <div class="vacation-item">
          <span>${escapeHtml(v.name)}</span>
          <div class="row-actions">
            <button type="button" class="ghost" data-edit-venue="${v.id}">Editar</button>
            <button type="button" class="danger" data-delete-venue="${v.id}">Eliminar</button>
          </div>
        </div>
      `
    )
    .join('');
}

const venueOverlay = document.getElementById('venue-overlay');
const venueForm = document.getElementById('venue-form');
const venueErrorEl = document.getElementById('venue-error');
const venueModalTitle = document.getElementById('venue-modal-title');

function resetVenueForm() {
  venueForm.reset();
  venueErrorEl.textContent = '';
  document.getElementById('venue-id').value = '';
  venueModalTitle.textContent = 'Añadir local';
}

function openVenueForEdit(venue) {
  document.getElementById('venue-id').value = venue.id;
  document.getElementById('venue-name').value = venue.name;
  document.getElementById('venue-restaurant-name').value = venue.restaurantName || '';
  document.getElementById('venue-phone').value = venue.accessPhone;
  document.getElementById('venue-pin').value = venue.accessPin;
  venueModalTitle.textContent = 'Editar local';
  document.getElementById('venue-name').focus();
}

document.getElementById('manage-venues-btn').addEventListener('click', () => {
  resetVenueForm();
  venueOverlay.classList.remove('hidden');
  venueOverlay.scrollTop = 0;
});

document.getElementById('close-venues-btn').addEventListener('click', () => {
  venueOverlay.classList.add('hidden');
});

document.getElementById('venue-form-cancel-btn').addEventListener('click', resetVenueForm);

venueOverlay.addEventListener('click', (e) => {
  if (e.target === venueOverlay) venueOverlay.classList.add('hidden');
});

venueForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  venueErrorEl.textContent = '';

  const id = document.getElementById('venue-id').value;
  const payload = {
    name: document.getElementById('venue-name').value.trim(),
    restaurantName: document.getElementById('venue-restaurant-name').value.trim(),
    accessPhone: document.getElementById('venue-phone').value.trim(),
    accessPin: document.getElementById('venue-pin').value.trim(),
  };

  try {
    if (id) {
      await api(`/api/venues/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/venues', { method: 'POST', body: JSON.stringify(payload) });
    }
    resetVenueForm();
    await loadVenues();
    await loadEmployees();
  } catch (err) {
    venueErrorEl.textContent = err.message;
  }
});

document.getElementById('venues-list').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-edit-venue]');
  const deleteBtn = e.target.closest('button[data-delete-venue]');

  if (editBtn) {
    const venue = venuesCache.find((v) => v.id === editBtn.dataset.editVenue);
    if (venue) openVenueForEdit(venue);
  } else if (deleteBtn) {
    const venue = venuesCache.find((v) => v.id === deleteBtn.dataset.deleteVenue);
    if (!venue) return;
    if (!confirm(`¿Eliminar el local "${venue.name}"?`)) return;
    try {
      await api(`/api/venues/${venue.id}`, { method: 'DELETE' });
      await loadVenues();
      await loadEmployees();
    } catch (err) {
      alert(err.message);
    }
  }
});

document.getElementById('add-employee-btn').addEventListener('click', () => openModal(null));
document.getElementById('cancel-employee-btn').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';

  const id = document.getElementById('employee-id').value;

  const payload = {
    name: document.getElementById('employee-name').value.trim(),
    displayName: document.getElementById('employee-display-name').value.trim(),
    pin: document.getElementById('employee-pin').value.trim(),
    jitterMinutes: Number(document.getElementById('employee-jitter').value) || 0,
    active: document.getElementById('employee-active').checked,
    schedule: readScheduleEditor(),
    vacations: currentVacations,
    venueId: selectedVenueId,
  };

  try {
    if (id) {
      await api(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/employees', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal();
    await loadEmployees();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

employeesBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const employee = employeesCache.find((emp) => emp.id === id);

  if (action === 'edit') {
    openModal(employee);
  } else if (action === 'delete') {
    if (!confirm(`¿Eliminar a ${employee.name}? Dejará de ficharse automáticamente.`)) return;
    await api(`/api/employees/${id}`, { method: 'DELETE' });
    await loadEmployees();
  } else if (action === 'ficharentrada' || action === 'ficharsalida') {
    const ficharAction = action === 'ficharentrada' ? 'entrada' : 'salida';
    btn.disabled = true;
    btn.textContent = 'Fichando…';
    try {
      await api(`/api/employees/${id}/fichar`, {
        method: 'POST',
        body: JSON.stringify({ action: ficharAction }),
      });
    } catch (err) {
      alert(`No se pudo fichar: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = ficharAction === 'entrada' ? 'Fichar entrada' : 'Fichar salida';
      await loadLogs();
    }
  }
});

document.getElementById('test-telegram-btn').addEventListener('click', async (e) => {
  const btn = e.target;
  const resultEl = document.getElementById('telegram-test-result');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  resultEl.textContent = '';
  try {
    await api('/api/test-telegram', { method: 'POST' });
    resultEl.style.color = 'var(--accent-dark)';
    resultEl.textContent = 'Mensaje de prueba enviado, revisa Telegram.';
  } catch (err) {
    resultEl.style.color = 'var(--danger)';
    resultEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar prueba';
  }
});

document.getElementById('clear-logs-btn').addEventListener('click', async () => {
  if (!confirm('¿Vaciar todo el historial de fichajes? Esta acción no se puede deshacer.')) return;
  await api('/api/logs', { method: 'DELETE' });
  await loadLogs();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

async function init() {
  await loadVenues();
  await loadEmployees();
}

init();
loadLogs();
setInterval(loadLogs, 15000);
