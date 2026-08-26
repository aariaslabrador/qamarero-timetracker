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

// Últimos disparos hechos, para no repetir un fichaje si el tick cae
// varias veces dentro del mismo minuto. Vive solo en memoria: si el
// proceso se reinicia justo en el minuto exacto de un fichaje, podría
// repetirse una vez; es un riesgo asumido a cambio de no depender de
// una base de datos para esto.
const lastFired = new Map();

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

async function tick() {
  const { timezone } = store.getSettings();
  const { day, time, dateStr } = nowParts(timezone);
  const employees = store.listEmployees().filter((e) => e.active);

  for (const employee of employees) {
    if (!employee.days || !employee.days.includes(day)) continue;

    for (const [action, target] of [
      ['entrada', employee.start],
      ['salida', employee.end],
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

module.exports = { start };
