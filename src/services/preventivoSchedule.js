// src/services/preventivoSchedule.js
// Cálculo centralizado de los CICLOS de mantenimiento preventivo (qué mes corresponde
// realizarlo según la periodicidad) y del estado que pintan los puntos de Inventario —
// ÚNICA fuente de verdad para esta lógica, para no repetirla dentro de cada componente
// que necesite mostrarla (tabla de Inventario, Alertas, exportación a Excel, tooltip, etc.).
//
// Regla: el primer ciclo se calcula desde la fecha del último preventivo EJECUTADO (o, si
// el equipo nunca ha tenido uno, su fecha de instalación) + la periodicidad del equipo, en
// MESES CALENDARIO (no una cantidad fija de días); cada ciclo siguiente suma otra
// periodicidad más, así que para un equipo Trimestral instalado en enero los ciclos caen en
// abril, julio, octubre, ... — NO en cada mes. Nunca se inventa una fecha base: si no existe
// ninguna de las dos, el equipo queda "sin programación" (⚪) hasta que se registre un dato real.

export const MESES_POR_PERIODICIDAD = {
  Mensual: 1, Bimestral: 2, Trimestral: 3, Cuatrimestral: 4, Semestral: 6, Anual: 12,
};

// Ventana de tolerancia (días) tras la fecha programada antes de pasar de "programado"
// (🟡) a "vencido" (🔴). Único punto de ajuste — hoy no existe un campo de configuración
// equivalente en la app, así que se centraliza aquí como constante en vez de un valor
// mágico repetido en cada componente.
export const TOLERANCIA_VENCIMIENTO_DIAS = 10;

// Tope de ciclos pasados a generar hacia atrás desde el ancla (instalación o último
// ejecutado) — solo importa para un equipo abandonado durante años sin ningún preventivo
// registrado; evita un bucle sin límite práctico. 60 ciclos cubre 5 años de periodicidad
// Mensual (la más frecuente soportada), de sobra para cualquier caso real.
const MAX_CICLOS_GENERADOS = 60;

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

// Fecha base (ancla) para calcular los ciclos de mantenimiento: la del último ejecutado o,
// si el equipo nunca ha tenido uno, su fecha de instalación (campo ya existente en la ficha
// del equipo — se reutiliza en vez de duplicar un campo nuevo). Devuelve null si no existe
// ninguna de las dos, para no inventar una fecha.
export function fechaBasePreventivo(equipo) {
  const ultimo = ultimoPreventivoEjecutado(equipo);
  if (ultimo) return { fecha: ultimo.fecha, origen: 'ultimo_ejecutado' };
  const instalacion = parseFechaLocal(equipo.fechaInstalacion);
  if (instalacion) return { fecha: instalacion, origen: 'fecha_instalacion' };
  return null;
}

// Genera la grilla de fechas de ciclo (ancla + periodicidad, ancla + 2×periodicidad, ...)
// que son relevantes para pintar el estado de un equipo: todos los ciclos que ya deberían
// haber pasado desde el ancla sin haberse resuelto (cada uno se evalúa por separado — un
// Trimestral que lleva 3 ciclos sin hacerse tiene 3 meses distintos en rojo, no un bloque
// continuo), más el primer ciclo todavía futuro (el "próximo"). Nunca genera más de un
// ciclo futuro — no se pre-pintan varios "próximos" a la vez.
//
// Esta es la ÚNICA función que decide "¿a qué mes corresponde un ciclo?" — preventivoDelMes,
// proximoPreventivo y estadoActualPreventivo consultan esta misma grilla en vez de calcular
// cada una por su cuenta si un mes corresponde o no a la periodicidad del equipo.
export function ciclosPreventivo(equipo, hoy = new Date()) {
  if (!equipo.aplicaPreventivo) return [];
  const base = fechaBasePreventivo(equipo);
  if (!base) return [];

  const meses = MESES_POR_PERIODICIDAD[equipo.periodicidadMantenimiento] || 12;
  const today = new Date(hoy.getTime()); today.setHours(0, 0, 0, 0);

  const ciclos = [];
  for (let k = 1; k <= MAX_CICLOS_GENERADOS; k++) {
    const fecha = addMonthsCalendario(base.fecha, meses * k);
    ciclos.push(fecha);
    if (fecha > today) break; // primer ciclo futuro incluido — no se generan más allá de este
  }
  return ciclos;
}

// Próximo ciclo de mantenimiento preventivo aún no resuelto y más cercano a "hoy": el más
// reciente que ya venció sin ejecutarse (si hay varios) o, si no hay ninguno vencido, el
// único ciclo futuro (el que de verdad corresponde llamar "el próximo"). Devuelve null si
// el equipo no aplica a preventivo o no hay fecha base disponible.
export function proximoPreventivo(equipo, hoy = new Date()) {
  const base = fechaBasePreventivo(equipo);
  if (!equipo.aplicaPreventivo || !base) return null;
  const ciclos = ciclosPreventivo(equipo, hoy);
  if (ciclos.length === 0) return null;
  return { fecha: ciclos[ciclos.length - 1], origenBase: base.origen };
}

// Estado (y fecha relevante) del mantenimiento preventivo de un equipo para un mes/año
// puntual — es lo que pintan los puntos de Inventario. Prioridad ya implícita en el orden
// de los checks: REALIZADO > (VENCIDO | PROGRAMADO, según el ciclo de ese mes) > SIN
// PROGRAMACIÓN.
//
// Un mes solo puede estar en vencido/programado si corresponde a un ciclo real según la
// periodicidad del equipo (ver ciclosPreventivo) — los meses intermedios que no forman
// parte de la grilla de ciclos (p. ej. febrero y marzo para un Trimestral con ciclos en
// enero/abril/julio/octubre) siempre son "no_aplica" (⚫), sin importar cuánto tiempo haya
// pasado. Esto reemplaza la regla anterior ("todo mes entre el vencimiento y hoy es rojo"),
// que pintaba de rojo meses que ni siquiera correspondían a la periodicidad del equipo.
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

  const ciclos = ciclosPreventivo(equipo, hoy);
  const cicloDelMes = ciclos.find(c => c.getFullYear() === year && c.getMonth() === monthIdx);
  if (!cicloDelMes) return { status: 'no_aplica', fecha: null };

  const today = new Date(hoy.getTime()); today.setHours(0, 0, 0, 0);
  const limite = addDias(cicloDelMes, toleranciaDias);
  return { status: today > limite ? 'vencido' : 'programado', fecha: cicloDelMes };
}

// Estado "instantáneo" (de HOY) del preventivo de un equipo — a diferencia de
// preventivoDelMes (que evalúa una celda mes/año puntual del cronograma de Inventario),
// esta responde "¿cómo está este preventivo ahora mismo?", útil para pantallas que no
// pintan un calendario (p. ej. Alertas). Consulta la MISMA grilla de ciclosPreventivo que
// usa preventivoDelMes — ninguna fórmula de fecha nueva — así que un equipo que muestra
// algún mes en rojo en Inventario siempre puede generar la alerta correspondiente aquí.
//
// Si hay varios ciclos vencidos sin resolver, reporta el más reciente (el más urgente); si
// no hay ninguno vencido, reporta el único ciclo futuro (el "próximo").
//
// `diasAviso` (opcional) permite marcar 'proximo' cuando falten pocos días para la fecha
// programada, aunque ese día todavía no haya llegado — el umbral de "cuántos días antes
// avisar" es una decisión de la pantalla que consume esto (p. ej. Alertas), no del cálculo
// de fechas en sí, así que se recibe como parámetro en vez de vivir aquí como constante.
// Devuelve { status: 'vencido'|'proximo'|'vigente'|'sin_dato', fecha: Date|null, diffDays: number|null }.
export function estadoActualPreventivo(equipo, hoy = new Date(), { toleranciaDias = TOLERANCIA_VENCIMIENTO_DIAS, diasAviso = null } = {}) {
  const ciclos = ciclosPreventivo(equipo, hoy);
  if (ciclos.length === 0) return { status: 'sin_dato', fecha: null, diffDays: null };

  const today = new Date(hoy.getTime()); today.setHours(0, 0, 0, 0);
  const pasados = ciclos.filter(c => c <= today);
  const objetivo = pasados.length > 0 ? pasados[pasados.length - 1] : ciclos[ciclos.length - 1];

  const diffDays = Math.round((objetivo.getTime() - today.getTime()) / 86400000);
  const limite = addDias(objetivo, toleranciaDias);

  if (today > limite) return { status: 'vencido', fecha: objetivo, diffDays };
  if (diasAviso != null && diffDays <= diasAviso) return { status: 'proximo', fecha: objetivo, diffDays };
  return { status: 'vigente', fecha: objetivo, diffDays };
}
