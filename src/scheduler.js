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

// Últimos disparos hechos, para no repetir un fichaje si el tick cae
// varias veces dentro del mismo minuto. Vive solo en memoria: si el
// proceso se reinicia justo en el minuto exacto de un fichaje, podría
// repetirse una vez; es un riesgo asumido a cambio de no depender de
// una base de datos para esto.
const lastFired = new Map();

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

async function tick() {
  const { timezone } = store.getSettings();
  const { day, time, dateStr } = nowParts(timezone);
  pruneJitterCache(dateStr);

  const employees = store.listEmployees().filter((e) => e.active);

  for (const employee of employees) {
    if (!employee.days || !employee.days.includes(day)) continue;
    if (isOnVacation(employee, dateStr)) continue;

    const { entrada, salida } = getJitteredTimes(employee, dateStr);

    for (const [action, target] of [
      ['entrada', entrada],
      ['salida', salida],
    ]) {
      if (target !== time) continue;

      const key = `${employee.id}:${action}:${dateStr}:${time}`;
      if (lastFired.get(key)) continue;
      lastFired.set(key, true);

      console.log(`[scheduler] Disparando ${action} para ${employee.name} (${time})`);
      runFichar({ employee, action }).then((res) => {
        if (res.ok) {
          console.log(`[scheduler] OK ${action} - ${employee.name}`);
        } else {
          console.error(`[scheduler] ERROR ${action} - ${employee.name}: ${res.error}`);
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
