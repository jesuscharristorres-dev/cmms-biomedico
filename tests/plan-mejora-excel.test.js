// tests/plan-mejora-excel.test.js
// Pruebas del lector del Excel de plan de mejora continua (src/services/planMejoraExcel.js):
// se arma en memoria un .xlsx mínimo con el mismo layout del formato UT-GGC-F-09 (fila de
// encabezados + fila de sub-encabezados + hallazgos) y una hoja oculta que no es la de datos.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';

import { readPlanMejora, estaVencido, grupoEstado } from '../src/services/planMejoraExcel.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const col = (i) => String.fromCharCode(65 + i);

// Celdas de texto como inlineStr, números como <v>; null = celda vacía.
function sheetXml(rows) {
  const body = rows.map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => {
    if (v === null) return '';
    const ref = `${col(c)}${r + 1}`;
    return typeof v === 'number'
      ? `<c r="${ref}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function buildXlsx(sheets) {
  const files = {
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
      sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0"?><Relationships>${
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows)); });
  return zipSync(files);
}

const HEADER = ['Establecimiento', 'Fecha Auditoria', 'Mes ', 'Ente Auditor', 'Subcomponente o servicio 1', 'No del hallazgo',
  'HALLAZGOS', 'PLAZO', '(¿Quién?) Responsable de realizar la acción de mejora', 'Fecha Final', 'ESTADO DE PLAN'];

// 46023 = 2026-01-01, 46054 = 2026-02-01 (serial de Excel)
const DATA = [
  ['EPMSC Neiva', 46023, 'enero', 'USPEC', 'EQUIPOS BIOMÉDICOS', 1, 'Monitor sin calibración', 'CORTO PLAZO', 'BIOMEDICA', 46054, 'CERRADO - CALIDAD'],
  ['EPMSC Neiva', 46054, 'Febrero ', 'uspec', 'EQUIPOS BIOMEDICOS', 2, 'Desfibrilador sin mantenimiento', 'LARGO PLAZO', 'BIOMEDICA', 46054, 'RE-APERTURA'],
  ['CPMS Tunja', 46054, null, 'COSAD', 'FARMACIA', 3, 'Medicamento vencido', 'MEDIANO PLAZO', 'Farmacia', 'N/A', 'NO APLICA'],
  ['CPMS Tunja', 46054, 'febrero', 'COSAD', 'FARMACIA', 4, 'Sin kardex', 'MEDIANO PLAZO', 'Farmacia', 47000, 'EN GESTION '],
];

describe('Lector del Excel de plan de mejora (planMejoraExcel.js)', () => {
  const xlsx = buildXlsx([
    { name: 'Hoja1', rows: [['Estado', 'plazo'], ['SIN GESTION', 'CORTO PLAZO']] },
    { name: 'Sheet1', hidden: true, rows: [HEADER, ['oculta', null, null, null, null, null, 'x', null, null, null, 'CERRADO - CALIDAD']] },
    { name: 'HALLAZGOS VISITAS', rows: [HEADER, [null, null, null, null, null, null, null, null, null, 'Fecha de terminacion', null], ...DATA, [null, null, null, null, null, null, null, null, null, null, 'Total']] },
  ]);
  const { sheetName, registros } = readPlanMejora(xlsx);

  test('elige la hoja visible con el encabezado del formato y omite sub-encabezados y totales', () => {
    assert.equal(sheetName, 'HALLAZGOS VISITAS');
    assert.equal(registros.length, 4);
  });

  test('convierte fechas seriales de Excel y deja en null los "N/A"', () => {
    assert.equal(registros[0].fechaAuditoria, '2026-01-01');
    assert.equal(registros[0].fechaFinal, '2026-02-01');
    assert.equal(registros[2].fechaFinal, null);
  });

  test('normaliza estado, ente y variantes de escritura del servicio', () => {
    assert.equal(registros[3].estado, 'EN GESTION');
    assert.equal(registros[1].ente, 'USPEC');
    assert.equal(registros[1].servicio, 'EQUIPOS BIOMÉDICOS');
    assert.deepEqual(registros.map(r => r.grupo), ['Cerrado', 'Re-apertura / sin gestión', 'No aplica', 'En gestión']);
  });

  test('toma el mes de la columna "Mes" y, si falta, de la fecha de auditoría', () => {
    assert.deepEqual(registros.map(r => r.mesIdx), [0, 1, 1, 1]);
  });

  test('vencido = abierto con fecha final anterior a hoy', () => {
    assert.equal(estaVencido(registros[1], '2026-10-28'), true);   // re-apertura, venció el 2026-02-01
    assert.equal(estaVencido(registros[0], '2026-10-28'), false);  // cerrado
    assert.equal(estaVencido(registros[3], '2026-10-28'), false);  // en gestión, vence en 2028
  });

  test('agrupa los estados del formato', () => {
    assert.equal(grupoEstado('CERRADO - MESA DE TRABAJO'), 'Cerrado');
    assert.equal(grupoEstado('EN PROCESO'), 'En gestión');
    assert.equal(grupoEstado('SIN GESTION'), 'Re-apertura / sin gestión');
  });

  test('rechaza un libro sin la hoja del formato', () => {
    assert.throws(() => readPlanMejora(buildXlsx([{ name: 'Hoja1', rows: [['a', 'b']] }])), /formato de plan de mejora/);
  });
});
