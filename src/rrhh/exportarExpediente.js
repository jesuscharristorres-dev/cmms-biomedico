// src/rrhh/exportarExpediente.js
// "Ver / Descargar expediente": arma un documento HTML imprimible con la información del
// expediente (se puede guardar como PDF desde el diálogo de impresión del navegador).
// Todo texto se escapa antes de interpolarlo. En producción esto podría generarse en el
// servidor (PDF firmado) sin cambiar los botones de la interfaz.

import { fmtFecha, ESTADO_DOCUMENTO, ESTADO_VACUNA } from './formato';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function tabla(encabezados, filas) {
  if (!filas.length) return '<p class="vacio">Sin registros.</p>';
  return `<table><thead><tr>${encabezados.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function htmlExpediente(exp, empresa) {
  const c = exp.colaborador;
  const k = exp.contrato;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Expediente — ${esc(c.nombreCompleto)}</title>
<style>
  body{font-family:'IBM Plex Sans',Arial,sans-serif;color:#0f172a;margin:32px;font-size:13px}
  h1{font-size:22px;margin:0} h2{font-size:15px;margin:26px 0 8px;border-bottom:2px solid #6366F1;padding-bottom:4px}
  .muted{color:#64748b} .demo{display:inline-block;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-top:4px} th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-size:12px} .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 24px}
  .barra{height:10px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:6px 0} .barra div{height:100%;background:#6366F1}
  .vacio{color:#94a3b8} @media print{body{margin:12mm}.noprint{display:none}}
</style></head><body>
<p class="noprint"><button onclick="window.print()">Imprimir / Guardar como PDF</button></p>
<p class="muted">Plataforma Integral de Gestión · Gestión Humana${empresa ? ` · ${esc(empresa)}` : ''}</p>
<h1>${esc(c.nombreCompleto)}</h1>
<p>${esc(c.cargo)} — ${esc(c.area)} · <span class="demo">DEMO · datos ficticios</span></p>
<p><strong>Completitud del expediente:</strong> ${exp.completitud.porcentaje}% (${exp.completitud.completos} / ${exp.completitud.total})</p>
<div class="barra"><div style="width:${exp.completitud.porcentaje}%"></div></div>
<h2>Información del colaborador</h2>
<div class="grid">
  <div><strong>Documento:</strong> ${esc(c.tipoDocumento)} ${esc(c.documento)}</div>
  <div><strong>Fecha de nacimiento:</strong> ${esc(fmtFecha(c.fechaNacimiento))}</div>
  <div><strong>Teléfono:</strong> ${esc(c.telefono)}</div>
  <div><strong>Correo:</strong> ${esc(c.correo)}</div>
  <div><strong>Dirección:</strong> ${esc(c.direccion)}</div>
  <div><strong>Ciudad:</strong> ${esc(c.ciudad)}</div>
  <div><strong>Estado civil:</strong> ${esc(c.estadoCivil)}</div>
  <div><strong>Contacto de emergencia:</strong> ${esc(c.contactoEmergencia?.nombre)} (${esc(c.contactoEmergencia?.parentesco)}) ${esc(c.contactoEmergencia?.telefono)}</div>
  <div><strong>Fecha de ingreso:</strong> ${esc(fmtFecha(c.fechaIngreso))}</div>
  <div><strong>Estado:</strong> ${esc(c.estado)}</div>
</div>
<h2>Contrato laboral</h2>
${k ? `<p>${esc(k.tipoDescripcion)} · Inicio ${esc(fmtFecha(k.fechaInicio))}${k.fechaFin ? ` · Fin ${esc(fmtFecha(k.fechaFin))}` : ''} · ${esc(k.cargo)} (${esc(k.area)}) · ${esc(k.jornada)}</p>` : '<p class="vacio">Sin contrato registrado.</p>'}
<h2>Títulos académicos</h2>
${tabla(['Título', 'Institución', 'Nivel', 'Año', 'Acta de grado'], exp.titulos.map(t => [t.titulo, t.institucion, t.nivel, t.anio, t.acta?.fecha || '—']))}
<h2>Estudios complementarios</h2>
${tabla(['Estudio', 'Institución', 'Tipo', 'Horas', 'Año'], exp.estudios.map(s => [s.nombre, s.institucion, s.tipo, s.horas, s.anio]))}
<h2>Registro de vacunación</h2>
${tabla(['Vacuna', 'Dosis', 'Fecha', 'Lote', 'Próxima dosis', 'Estado'], exp.vacunas.map(v => [v.vacuna, v.dosis, fmtFecha(v.fecha), v.lote, fmtFecha(v.proximaDosis), ESTADO_VACUNA[v.estado]?.label]))}
<h2>Documentación</h2>
${tabla(['Tipo', 'Documento', 'Cargado', 'Vence', 'Estado'], exp.documentos.map(d => [d.tipo, d.nombre, fmtFecha(d.fechaCarga), fmtFecha(d.fechaVencimiento), ESTADO_DOCUMENTO[d.estado]?.label]))}
<h2>Historial</h2>
${tabla(['Fecha', 'Evento', 'Detalle'], exp.historial.map(h => [fmtFecha(h.fecha), h.titulo, h.detalle]))}
<p class="muted" style="margin-top:28px">Generado el ${esc(fmtFecha(new Date().toISOString().slice(0, 10)))} desde la Plataforma Integral de Gestión.</p>
</body></html>`;
}

function blobUrl(exp, empresa) {
  return URL.createObjectURL(new Blob([htmlExpediente(exp, empresa)], { type: 'text/html;charset=utf-8' }));
}

export function verExpediente(exp, empresa) {
  const url = blobUrl(exp, empresa);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function descargarExpediente(exp, empresa) {
  const url = blobUrl(exp, empresa);
  const a = document.createElement('a');
  a.href = url;
  // Sin tildes ni caracteres especiales: algunos navegadores descartan un nombre con tildes
  // y guardan el archivo como "download".
  const nombre = exp.colaborador.nombreCompleto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_');
  a.download = `Expediente_${nombre}.html`;
  document.body.appendChild(a);
  a.click();
  // Se retira el enlace después del clic: algunos navegadores leen el atributo `download`
  // de forma asíncrona y, si el enlace ya no existe, guardan el archivo como "download".
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 10000);
}
