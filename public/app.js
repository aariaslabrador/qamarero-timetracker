const DAY_LABELS = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const employeesBody = document.getElementById('employees-body');
const employeesEmpty = document.getElementById('employees-empty');
const logsBody = document.getElementById('logs-body');
const logsEmpty = document.getElementById('logs-empty');
const overlay = document.getElementById('employee-overlay');
const form = document.getElementById('employee-form');
const modalTitle = document.getElementById('modal-title');
const errorEl = document.getElementById('employee-error');

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

function dayChips(days) {
  return DAY_ORDER.map((d) => {
    const active = days.includes(d) ? 'active' : '';
    return `<span class="day-chip ${active}">${DAY_LABELS[d]}</span>`;
  }).join('');
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
      <td><div class="days">${dayChips(emp.days || [])}</div></td>
      <td>${emp.start} – ${emp.end}</td>
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

async function loadEmployees() {
  employeesCache = await api('/api/employees');
  renderEmployees(employeesCache);
}

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

function openModal(employee) {
  form.reset();
  errorEl.textContent = '';
  document.getElementById('employee-id').value = employee ? employee.id : '';
  document.getElementById('employee-name').value = employee ? employee.name : '';
  document.getElementById('employee-display-name').value = employee ? employee.displayName || '' : '';
  document.getElementById('employee-pin').value = employee ? employee.pin : '';
  document.getElementById('employee-start').value = employee ? employee.start : '09:00';
  document.getElementById('employee-end').value = employee ? employee.end : '17:00';
  document.getElementById('employee-jitter').value = employee ? (employee.jitterMinutes ?? 5) : 5;
  document.getElementById('employee-active').checked = employee ? employee.active : true;

  const days = employee ? employee.days || [] : [];
  document.querySelectorAll('#day-picker input[type="checkbox"]').forEach((cb) => {
    cb.checked = days.includes(cb.value);
  });

  currentVacations = employee ? [...(employee.vacations || [])] : [];
  renderVacationList();

  modalTitle.textContent = employee ? 'Editar empleado' : 'Añadir empleado';
  overlay.classList.remove('hidden');
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

document.getElementById('add-employee-btn').addEventListener('click', () => openModal(null));
document.getElementById('cancel-employee-btn').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';

  const id = document.getElementById('employee-id').value;
  const days = Array.from(document.querySelectorAll('#day-picker input:checked')).map((cb) => cb.value);

  const payload = {
    name: document.getElementById('employee-name').value.trim(),
    displayName: document.getElementById('employee-display-name').value.trim(),
    pin: document.getElementById('employee-pin').value.trim(),
    start: document.getElementById('employee-start').value,
    end: document.getElementById('employee-end').value,
    jitterMinutes: Number(document.getElementById('employee-jitter').value) || 0,
    active: document.getElementById('employee-active').checked,
    days,
    vacations: currentVacations,
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

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

loadEmployees();
loadLogs();
setInterval(loadLogs, 15000);
