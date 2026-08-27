const store = require('./store');
const { runFichar } = require('./runner');

const WEEKDAY_TO_KEY = {
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
};

// Tope de variación aleatoria admitido, para que nunca se pueda configurar
// un margen que desvirtúe el horario real (ver MAX_JITTER_MINUTES en el
// panel/servidor).
const MAX_JITTER_MINUTES = 15;

// Estado de cada fichaje (entrada/salida) del día para cada empleado. Vive
// solo en memoria: si el proceso se reinicia, se pierde el progreso de
// reintentos del día en curso; es un riesgo asumido a cambio de no
// depender de una base de datos para esto.
//
// key = `${employeeId}:${action}:${dateStr}` -> {
//   status: 'pending' | 'done' | 'gaveup',
//   dueSince: primer instante (ms) en que se detectó que tocaba fichar,
//   lastAttemptAt: último intento (ms),
//   inFlight: hay un intento en curso ahora mismo,
// }
const attempts = new Map();

// Si un fichaje falla (p. ej. un timeout puntual de Q-POS), se reintenta
// cada RETRY_COOLDOWN_MS hasta RETRY_WINDOW_MS después de la hora que
// tocaba. Esto evita que un fallo aislado en la entrada deje al empleado
// "no encontrado en turno" cuando llegue la hora de la salida.
const RETRY_COOLDOWN_MS = 2 * 60 * 1000;
const RETRY_WINDOW_MS = 20 * 60 * 1000;

// Hora "real" (con la variación aleatoria del día ya aplicada) de cada
// entrada/salida. Se calcula una sola vez por empleado y por día, para que
// no cambie a cada tick: igual que una persona real, ese día entra/sale
// siempre a la misma hora, solo que no es exactamente la programada.
const jitterCache = new Map();

function nowParts(timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const map = {};
  for (const p of fmt.formatToParts(new Date())) map[p.type] = p.value;

  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  return {
    day: WEEKDAY_TO_KEY[map.weekday],
    time: `${map.hour}:${map.minute}`,
    dateStr: dateFmt.format(new Date()),
  };
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + minutes));
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function randomOffset(maxMinutes) {
  if (!maxMinutes) return 0;
  const capped = Math.min(maxMinutes, MAX_JITTER_MINUTES);
  return Math.round((Math.random() * 2 - 1) * capped);
}

function getJitteredTimes(employee, dateStr) {
  const key = `${employee.id}:${dateStr}`;
  if (!jitterCache.has(key)) {
    jitterCache.set(key, {
      entrada: addMinutes(employee.start, randomOffset(employee.jitterMinutes)),
      salida: addMinutes(employee.end, randomOffset(employee.jitterMinutes)),
    });
  }
  return jitterCache.get(key);
}

function pruneJitterCache(dateStr) {
  for (const key of jitterCache.keys()) {
    if (!key.endsWith(`:${dateStr}`)) jitterCache.delete(key);
  }
}

function isOnVacation(employee, dateStr) {
  return (employee.vacations || []).some((v) => dateStr >= v.from && dateStr <= v.to);
}

function pruneAttempts(dateStr) {
  for (const key of attempts.keys()) {
    if (!key.endsWith(`:${dateStr}`)) attempts.delete(key);
  }
}

function getAttemptState(key) {
  if (!attempts.has(key)) {
    attempts.set(key, { status: 'pending', dueSince: null, lastAttemptAt: 0, inFlight: false });
  }
  return attempts.get(key);
}

async function tick() {
  const { timezone } = store.getSettings();
  const { day, time, dateStr } = nowParts(timezone);
  pruneJitterCache(dateStr);
  pruneAttempts(dateStr);

  const employees = store.listEmployees().filter((e) => e.active);

  for (const employee of employees) {
    if (!employee.days || !employee.days.includes(day)) continue;
    if (isOnVacation(employee, dateStr)) continue;

    const { entrada, salida } = getJitteredTimes(employee, dateStr);

    for (const [action, target] of [
      ['entrada', entrada],
      ['salida', salida],
    ]) {
      if (time < target) continue; // todavía no toca

      const key = `${employee.id}:${action}:${dateStr}`;
      const state = getAttemptState(key);
      if (state.status !== 'pending' || state.inFlight) continue;

      const now = Date.now();
      if (!state.dueSince) state.dueSince = now;

      if (now - state.dueSince > RETRY_WINDOW_MS) {
        state.status = 'gaveup';
        console.error(
          `[scheduler] ${action} de ${employee.name} lleva más de 20 min sin poder ficharse; revísalo a mano desde el panel.`
        );
        continue;
      }

      if (now - state.lastAttemptAt < RETRY_COOLDOWN_MS) continue;

      state.inFlight = true;
      state.lastAttemptAt = now;

      console.log(`[scheduler] Disparando ${action} para ${employee.name} (${time})`);
      runFichar({ employee, action }).then((res) => {
        state.inFlight = false;
        if (res.ok) {
          state.status = 'done';
          console.log(`[scheduler] OK ${action} - ${employee.name}`);
        } else {
          console.error(`[scheduler] ERROR ${action} - ${employee.name}: ${res.error} (se reintentará)`);
        }
      });
    }
  }
}

function start() {
  console.log('[scheduler] Planificador activo, comprobando cada 20s.');
  tick();
  setInterval(tick, 20 * 1000);
}

module.exports = { start, MAX_JITTER_MINUTES };
