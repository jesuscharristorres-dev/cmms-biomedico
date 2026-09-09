// src/services/preventivoSchedule.js
// Cálculo centralizado de la PRÓXIMA fecha de mantenimiento preventivo y del estado
// mensual que pintan los puntos de Inventario — ÚNICA fuente de verdad para esta lógica,
// para no repetirla dentro de cada componente que necesite mostrarla (tabla de Inventario,
// exportación a Excel, tooltip, etc.).
//
// Regla: próxima fecha = fecha del último preventivo EJECUTADO (o, si el equipo nunca ha
// tenido uno, su fecha de instalación) + la periodicidad del equipo, en MESES CALENDARIO
// (no una cantidad fija de días). Nunca se inventa una fecha base: si no existe ninguna de
// las dos, el equipo queda "sin programación" (⚪) hasta que se registre un dato real.

export const MESES_POR_PERIODICIDAD = {
  Mensual: 1, Bimestral: 2, Trimestral: 3, Cuatrimestral: 4, Semestral: 6, Anual: 12,
};

// Ventana de tolerancia (días) tras la fecha programada antes de pasar de "programado"
// (🟡) a "vencido" (🔴). Único punto de ajuste — hoy no existe un campo de configuración
// equivalente en la app, así que se centraliza aquí como constante en vez de un valor
// mágico repetido en cada componente.
export const TOLERANCIA_VENCIMIENTO_DIAS = 10;

function parseFechaLocal(fechaStr) {
  if (!fechaStr) return null;
  const iso = fechaStr.length === 7 ? `${fechaStr}-01` : fechaStr;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? null : d;
}

// Suma meses CALENDARIO a una fecha (no días fijos), preservando el día cuando el mes
// destino lo tiene y recortando al último día del mes destino en caso contrario
// (ej. 31/ene + 1 mes = 28 o 29/feb, nunca "3 de marzo").
function addMonthsCalendario(fecha, meses) {
  const day = fecha.getDate();
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  d.setMonth(d.getMonth() + meses);
  const ultimoDiaDestino = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, ultimoDiaDestino));
  return d;
}

function addDias(fecha, dias) {
  const d = new Date(fecha.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

// Último mantenimiento preventivo REALIZADO (estado 'Ejecutado'), el más reciente por
// fecha real de ejecución — así, si se registra uno con retraso, la fecha que cuenta para
// el siguiente cálculo es la fecha real en que se ejecutó, no la que estaba programada.
export function ultimoPreventivoEjecutado(equipo) {
  let ultimo = null;
  (equipo.preventivos || []).forEach(p => {
    if (p.estado !== 'Ejecutado' || !p.fecha) return;
    const d = parseFechaLocal(p.fecha);
    if (!d) return;
    if (!ultimo || d > ultimo.fecha) ultimo = { registro: p, fecha: d };
  });
  return ultimo;
}

// Fecha base para calcular el próximo mantenimiento: la del último ejecutado o, si el
// equipo nunca ha tenido uno, su fecha de instalación (campo ya existente en la ficha del
// equipo — se reutiliza en vez de duplicar un campo nuevo). Devuelve null si no existe
// ninguna de las dos, para no inventar una fecha.
export function fechaBasePreventivo(equipo) {
  const ultimo = ultimoPreventivoEjecutado(equipo);
  if (ultimo) return { fecha: ultimo.fecha, origen: 'ultimo_ejecutado' };
  const instalacion = parseFechaLocal(equipo.fechaInstalacion);
  if (instalacion) return { fecha: instalacion, origen: 'fecha_instalacion' };
  return null;
}

// Próxima fecha de mantenimiento preventivo, calculada automáticamente. Devuelve null si
// el equipo no aplica a preventivo o no hay fecha base disponible.
export function proximoPreventivo(equipo) {
  if (!equipo.aplicaPreventivo) return null;
  const base = fechaBasePreventivo(equipo);
  if (!base) return null;
  const meses = MESES_POR_PERIODICIDAD[equipo.periodicidadMantenimiento] || 12;
  return { fecha: addMonthsCalendario(base.fecha, meses), origenBase: base.origen };
}

// Estado (y fecha relevante) del mantenimiento preventivo de un equipo para un mes/año
// puntual — es lo que pintan los puntos de Inventario. Prioridad ya implícita en el orden
// de los checks: REALIZADO > VENCIDO > PROGRAMADO > SIN PROGRAMACIÓN.
//
// Un vencimiento NO desaparece al cambiar de mes: `proximoPreventivo` da una única fecha
// (el ciclo pendiente actual), así que si ya pasó su mes sin ejecutarse, cada mes siguiente
// hasta el mes actual también se marca "vencido" — no solo el mes en que originalmente se
// venció. "Programado" (🟡, aún dentro de tolerancia) solo aplica al mes exacto en que se
// debía realizar; antes de ese mes no hay nada que mostrar todavía, y los meses futuros más
// allá del mes actual tampoco (no se puede saber si se resolverá a tiempo).
//
// `toleranciaDias` (por defecto TOLERANCIA_VENCIMIENTO_DIAS) queda como parámetro explícito
// para poder hacerla configurable desde la app más adelante sin tocar esta función de nuevo.
// Devuelve { status: 'realizado'|'vencido'|'programado'|'no_aplica', fecha: Date|null }.
export function preventivoDelMes(equipo, monthIdx, year, hoy = new Date(), toleranciaDias = TOLERANCIA_VENCIMIENTO_DIAS) {
  if (!equipo.aplicaPreventivo) return { status: 'no_aplica', fecha: null };

  const ejecutadoEsteMes = (equipo.preventivos || []).find(p => {
    if (p.estado !== 'Ejecutado' || !p.fecha) return false;
    const d = parseFechaLocal(p.fecha);
    return d && d.getFullYear() === year && d.getMonth() === monthIdx;
  });
  if (ejecutadoEsteMes) return { status: 'realizado', fecha: parseFechaLocal(ejecutadoEsteMes.fecha) };

  const proximo = proximoPreventivo(equipo);
  if (!proximo) return { status: 'no_aplica', fecha: null };

  const mesDebido = new Date(proximo.fecha.getFullYear(), proximo.fecha.getMonth(), 1);
  const mesConsultado = new Date(year, monthIdx, 1);
  if (mesConsultado < mesDebido) return { status: 'no_aplica', fecha: null };

  const today = new Date(hoy.getTime()); today.setHours(0, 0, 0, 0);
  const mesActual = new Date(today.getFullYear(), today.getMonth(), 1);
  if (mesConsultado > mesActual) return { status: 'no_aplica', fecha: null };

  const limite = addDias(proximo.fecha, toleranciaDias);
  const vencido = today > limite;

  if (mesConsultado.getTime() === mesDebido.getTime()) {
    return { status: vencido ? 'vencido' : 'programado', fecha: proximo.fecha };
  }
  // Meses posteriores al mes debido, hasta el mes actual: el vencimiento persiste.
  return { status: vencido ? 'vencido' : 'no_aplica', fecha: proximo.fecha };
}

// Estado "instantáneo" (de HOY) del preventivo de un equipo — a diferencia de
// preventivoDelMes (que evalúa una celda mes/año puntual del cronograma de Inventario),
// esta responde "¿cómo está este preventivo ahora mismo?", útil para pantallas que no
// pintan un calendario (p. ej. Alertas). Parte de la MISMA `proximoPreventivo(equipo)`
// que usa preventivoDelMes — ninguna fórmula de fecha nueva — así que para el mes en
// curso ambas funciones siempre concuerdan en si un equipo está o no vencido.
//
// `diasAviso` (opcional) permite marcar 'proximo' cuando falten pocos días para la fecha
// programada, aunque ese día todavía no haya llegado — el umbral de "cuántos días antes
// avisar" es una decisión de la pantalla que consume esto (p. ej. Alertas), no del cálculo
// de fechas en sí, así que se recibe como parámetro en vez de vivir aquí como constante.
// Devuelve { status: 'vencido'|'proximo'|'vigente'|'sin_dato', fecha: Date|null, diffDays: number|null }.
export function estadoActualPreventivo(equipo, hoy = new Date(), { toleranciaDias = TOLERANCIA_VENCIMIENTO_DIAS, diasAviso = null } = {}) {
  const proximo = proximoPreventivo(equipo);
  if (!proximo) return { status: 'sin_dato', fecha: null, diffDays: null };

  const today = new Date(hoy.getTime()); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((proximo.fecha.getTime() - today.getTime()) / 86400000);
  const limite = addDias(proximo.fecha, toleranciaDias);

  if (today > limite) return { status: 'vencido', fecha: proximo.fecha, diffDays };
  if (diasAviso != null && diffDays <= diasAviso) return { status: 'proximo', fecha: proximo.fecha, diffDays };
  return { status: 'vigente', fecha: proximo.fecha, diffDays };
}
