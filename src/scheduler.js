const store = require('./store');
const { runFichar } = require('./runner');
const { sendTelegramMessage } = require('./telegram');

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
//   status: 'pending' | 'done' | 'gaveup' | 'skipped',
//   lastAttemptAt: último intento (ms, 0 si aún no se ha intentado),
//   inFlight: hay un intento en curso ahora mismo,
// }
const attempts = new Map();

// Si un fichaje falla (p. ej. un timeout puntual de Q-POS), se reintenta
// cada RETRY_COOLDOWN_MS durante RETRY_WINDOW_MINUTES después de la hora
// que tocaba, para no dejar al empleado "no encontrado en turno" cuando
// llegue el siguiente fichaje. Pasado ese margen SIEMPRE se deja de
// intentar: el margen se cuenta desde la hora programada, no desde que el
// proceso lo detectó, para que un reinicio del servicio horas después de
// un turno ya terminado no dispare fichajes con horas de retraso.
const RETRY_COOLDOWN_MS = 2 * 60 * 1000;
const RETRY_WINDOW_MINUTES = 20;

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

function getJitteredTimes(employee, daySchedule, dateStr) {
  const key = `${employee.id}:${dateStr}`;
  if (!jitterCache.has(key)) {
    jitterCache.set(key, {
      entrada: addMinutes(daySchedule.start, randomOffset(employee.jitterMinutes)),
      salida: addMinutes(daySchedule.end, randomOffset(employee.jitterMinutes)),
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
    attempts.set(key, { status: 'pending', lastAttemptAt: 0, inFlight: false, hadFailure: false });
  }
  return attempts.get(key);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function tick() {
  const { timezone } = store.getSettings();
  const { day, time, dateStr } = nowParts(timezone);
  pruneJitterCache(dateStr);
  pruneAttempts(dateStr);

  const employees = store.listEmployees().filter((e) => e.active);

  for (const employee of employees) {
    const daySchedule = (employee.schedule || []).find((s) => s.day === day);
    if (!daySchedule) continue;
    if (isOnVacation(employee, dateStr)) continue;

    const { entrada, salida } = getJitteredTimes(employee, daySchedule, dateStr);

    for (const [action, target] of [
      ['entrada', entrada],
      ['salida', salida],
    ]) {
      const minutesPast = toMinutes(time) - toMinutes(target);
      if (minutesPast < 0) continue; // todavía no toca

      const key = `${employee.id}:${action}:${dateStr}`;
      const state = getAttemptState(key);
      if (state.status !== 'pending' || state.inFlight) continue;

      if (minutesPast > RETRY_WINDOW_MINUTES) {
        if (state.lastAttemptAt > 0) {
          // Se intentó de verdad y siguió fallando hasta agotar el margen:
          // esto sí necesita que alguien lo revise.
          state.status = 'gaveup';
          const msg = `⚠️ No se pudo fichar la ${action} de ${employee.name} tras varios reintentos. Hazlo a mano desde el panel.`;
          console.error(`[scheduler] ${msg}`);
          sendTelegramMessage(msg);
        } else {
          // Nunca se llegó a intentar dentro del margen (p. ej. el
          // servicio estuvo parado): no se dispara con horas de retraso.
          state.status = 'skipped';
          console.warn(
            `[scheduler] Se saltó ${action} de ${employee.name}: ya habían pasado más de ${RETRY_WINDOW_MINUTES} min de la hora programada.`
          );
        }
        continue;
      }

      const now = Date.now();
      if (now - state.lastAttemptAt < RETRY_COOLDOWN_MS) continue;

      state.inFlight = true;
      state.lastAttemptAt = now;

      console.log(`[scheduler] Disparando ${action} para ${employee.name} (${time})`);
      runFichar({ employee, action }).then((res) => {
        state.inFlight = false;
        if (res.ok) {
          state.status = 'done';
          console.log(`[scheduler] OK ${action} - ${employee.name}`);
          if (state.hadFailure) {
            sendTelegramMessage(
              `✅ ${employee.name}: la ${action} se pudo fichar en un reintento. Ya está resuelto, no hace falta hacer nada.`
            );
          }
        } else {
          console.error(`[scheduler] ERROR ${action} - ${employee.name}: ${res.error} (se reintentará)`);
          if (!state.hadFailure) {
            // Aviso inmediato solo en el primer fallo, para no saturar de
            // mensajes mientras siguen los reintentos automáticos.
            state.hadFailure = true;
            sendTelegramMessage(
              `⚠️ No se pudo fichar la ${action} de ${employee.name}.\n${res.error}\n\n` +
                `Se reintentará automáticamente durante ${RETRY_WINDOW_MINUTES} min. Si es urgente, ` +
                'corrígelo a mano desde el panel o avisa al camarero para que lo haga él mismo en Q-POS.'
            );
          }
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
