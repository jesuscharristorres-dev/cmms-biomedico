// src/rrhh/mockData.js
// DATOS DE DEMOSTRACIÓN del módulo Gestión Humana (RRHH).
//
// TODO lo que hay aquí es FICTICIO: nombres inventados, documentos enmascarados
// (52.XXX.XXX), teléfonos 300 000 00xx, correos @example.com (dominio reservado para
// ejemplos) y archivos que no existen. No se usa ningún dato real de empleados.
//
// Estructura pensada para reemplazarse por la base de datos: cada colección equivale a una
// tabla/colección futura y se relaciona por `colaboradorId`:
//
//   colaboradores           → employees
//   documentos              → employeeDocuments          (documentos generales del expediente)
//   titulos                 → academicTitles             (+ acta de grado: degreeCertificates)
//   estudios                → complementaryStudies
//   vacunas                 → vaccinations
//   contratos               → contracts
//   experiencia             → workExperience
//   historial               → employeeHistory
//
// La interfaz NO lee este archivo directamente: todo pasa por rrhhService.js, que es el
// único punto a cambiar cuando exista la API.
//
// Las fechas de vencimiento se expresan en días relativos a HOY para que la demo muestre
// siempre los mismos estados (vigente / por vencer / vencido) sin importar cuándo se abra.

export function fechaRelativa(dias) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}


// Documentos generales que se esperan en todo expediente.
export const DOCUMENTOS_BASE = [
  { clave: 'cedula', tipo: 'Cédula', nombre: 'Cédula de ciudadanía', archivo: 'Cedula.pdf' },
  { clave: 'hv', tipo: 'Hoja de vida', nombre: 'Hoja de vida actualizada', archivo: 'Hoja_de_vida.pdf' },
  { clave: 'eps', tipo: 'Certificados', nombre: 'Certificado de afiliación a EPS', archivo: 'Afiliacion_EPS.pdf' },
  { clave: 'arl', tipo: 'Certificados', nombre: 'Certificado de afiliación a ARL', archivo: 'Afiliacion_ARL.pdf' },
  { clave: 'pension', tipo: 'Certificados', nombre: 'Certificado de fondo de pensiones', archivo: 'Fondo_pensiones.pdf' },
  { clave: 'caja', tipo: 'Certificados', nombre: 'Afiliación a caja de compensación', archivo: 'Caja_compensacion.pdf' },
  { clave: 'rut', tipo: 'Certificados', nombre: 'RUT', archivo: 'RUT.pdf' },
  { clave: 'banco', tipo: 'Certificados', nombre: 'Certificación bancaria', archivo: 'Certificacion_bancaria.pdf' },
  { clave: 'antecedentes', tipo: 'Certificados', nombre: 'Certificado de antecedentes', archivo: 'Antecedentes.pdf', venceDias: 210 },
  { clave: 'examen_ingreso', tipo: 'Otros documentos', nombre: 'Examen médico ocupacional de ingreso', archivo: 'Examen_ingreso.pdf' },
  { clave: 'examen_periodico', tipo: 'Otros documentos', nombre: 'Examen médico ocupacional periódico', archivo: 'Examen_periodico.pdf', venceDias: 160 },
  { clave: 'contrato', tipo: 'Contrato', nombre: 'Contrato laboral firmado', archivo: 'Contrato_laboral.pdf' },
  { clave: 'confidencialidad', tipo: 'Otros documentos', nombre: 'Acuerdo de confidencialidad', archivo: 'Acuerdo_confidencialidad.pdf' },
];

const VACUNAS_BASE = [
  { clave: 'covid', vacuna: 'COVID-19', dosis: 'Dosis 1', fecha: '2024-03-15' },
  { clave: 'hepb1', vacuna: 'Hepatitis B', dosis: 'Dosis 1', fecha: '2024-01-10' },
  { clave: 'hepb2', vacuna: 'Hepatitis B', dosis: 'Dosis 2', fecha: '2024-02-10' },
  { clave: 'tetanos', vacuna: 'Tétanos', dosis: 'Dosis única', fecha: '2023-06-15' },
  { clave: 'influenza', vacuna: 'Influenza', dosis: 'Anual', fecha: '2024-10-05' },
];

// Especificación compacta de cada colaborador de la muestra. `faltan` deja documentos sin
// cargar, `vencidos`/`porVencer` ajustan fechas y `vacunas` define el estado de cada dosis;
// con eso cada expediente tiene un nivel de completitud distinto (100 %, 92 %, 84 %, 72 %…).
const ESPECIFICACION = [
  {
    id: 'col-001', nombres: 'María Fernanda', apellidos: 'Gómez', genero: 'F', empresa: 'MACROMED SAS', dotacion: { recibio: true, dias: -40 },
    tipoDocumento: 'CC', documento: '52.XXX.XXX', cargo: 'Coordinadora Administrativa', area: 'Administración',
    contrato: 'Indefinido', estado: 'Activo', ingreso: '2022-02-01', nacimiento: '1990-04-18', estadoCivil: 'Casada',
    ciudad: 'Bogotá', perfil: 'Profesional con experiencia en gestión administrativa y coordinación de procesos.',
    titulos: [
      { titulo: 'Ingeniería Industrial', institucion: 'Universidad Nacional', nivel: 'Pregrado', anio: 2018, acta: '20/12/2018' },
      { titulo: 'Especialización en Gerencia de Proyectos', institucion: 'Universidad del Rosario', nivel: 'Especialización', anio: 2021, acta: '15/07/2021' },
    ],
    estudios: [
      { nombre: 'Diplomado en Gestión de Calidad', institucion: 'Universidad X', tipo: 'Diplomado', horas: 120, anio: 2024 },
      { nombre: 'Curso de Seguridad y Salud en el Trabajo', institucion: 'Plataforma de formación SST', tipo: 'Curso', horas: 50, anio: 2024, venceDias: 45 },
      { nombre: 'Certificación en Excel Avanzado', institucion: 'Centro de Formación Digital', tipo: 'Certificación', horas: 40, anio: 2025, sinCertificado: true },
    ],
    vencidos: ['antecedentes'],
    vacunas: { influenza: { proxima: -30 } },
    experiencia: [
      { empresa: 'Empresa ABC', cargo: 'Coordinadora Administrativa', inicio: '2021', fin: null },
      { empresa: 'Empresa XYZ', cargo: 'Analista Administrativa', inicio: '2018', fin: '2021' },
    ],
    historial: [
      { fecha: '2025-03-12', titulo: 'Actualización de hoja de vida', detalle: 'Se cargó la versión 2025 de la hoja de vida.', tipo: 'documento' },
      { fecha: '2024-08-20', titulo: 'Nuevo estudio complementario', detalle: 'Diplomado en Gestión de Calidad (120 horas).', tipo: 'estudio' },
      { fecha: '2023-02-01', titulo: 'Renovación de contrato', detalle: 'Continuidad del contrato a término indefinido.', tipo: 'contrato' },
      { fecha: '2022-02-01', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Coordinadora Administrativa.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-002', nombres: 'Carlos Andrés', apellidos: 'Rodríguez', genero: 'M', empresa: 'NP MEDICAL', dotacion: { recibio: false, dias: -25 },
    tipoDocumento: 'CC', documento: '79.XXX.XXX', cargo: 'Ingeniero Biomédico', area: 'Biomédica',
    contrato: 'Indefinido', estado: 'Activo', ingreso: '2020-06-16', nacimiento: '1987-11-02', estadoCivil: 'Soltero',
    ciudad: 'Bogotá', perfil: 'Ingeniero biomédico con experiencia en gestión de tecnología, mantenimiento y metrología de equipos médicos.',
    titulos: [
      { titulo: 'Ingeniería Biomédica', institucion: 'Universidad Escuela de Ingeniería', nivel: 'Pregrado', anio: 2012, acta: '14/12/2012' },
      { titulo: 'Maestría en Ingeniería Clínica', institucion: 'Universidad de Antioquia', nivel: 'Maestría', anio: 2017, acta: '30/06/2017' },
    ],
    estudios: [
      { nombre: 'Curso de Metrología Biomédica', institucion: 'Instituto de Metrología Demo', tipo: 'Curso', horas: 60, anio: 2023 },
      { nombre: 'Tecnovigilancia para prestadores', institucion: 'Formación en línea', tipo: 'Curso', horas: 30, anio: 2024 },
    ],
    vacunas: {},
    experiencia: [
      { empresa: 'Hospital Demo Central', cargo: 'Ingeniero de Mantenimiento', inicio: '2014', fin: '2020' },
      { empresa: 'Distribuidora Médica Ficticia', cargo: 'Ingeniero de Soporte', inicio: '2012', fin: '2014' },
    ],
    historial: [
      { fecha: '2024-05-10', titulo: 'Nuevo estudio complementario', detalle: 'Tecnovigilancia para prestadores (30 horas).', tipo: 'estudio' },
      { fecha: '2021-06-16', titulo: 'Renovación de contrato', detalle: 'Paso a contrato a término indefinido.', tipo: 'contrato' },
      { fecha: '2020-06-16', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Ingeniero Biomédico.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-003', nombres: 'Laura Valentina', apellidos: 'Martínez', genero: 'F', empresa: 'DIAGNOSTIK',
    tipoDocumento: 'CC', documento: '1.XXX.XXX.XXX', cargo: 'Analista de Calidad', area: 'Calidad',
    contrato: 'Término fijo', estado: 'Activo', ingreso: fechaRelativa(-435), nacimiento: '1996-02-27', estadoCivil: 'Soltera',
    ciudad: 'Medellín', perfil: 'Profesional en gestión de la calidad con enfoque en auditoría de procesos y mejora continua.',
    titulos: [
      { titulo: 'Administración de Empresas', institucion: 'Universidad de Medellín', nivel: 'Pregrado', anio: 2019, acta: '06/12/2019' },
    ],
    estudios: [
      { nombre: 'Auditor interno ISO 9001', institucion: 'Organismo de formación Demo', tipo: 'Certificación', horas: 40, anio: 2023, venceDias: 30 },
      { nombre: 'Diplomado en Gestión por Procesos', institucion: 'Universidad X', tipo: 'Diplomado', horas: 100, anio: 2024, sinCertificado: true },
    ],
    faltan: ['banco'],
    porVencer: { examen_periodico: 20 },
    vacunas: { hepb2: { proxima: 40 } },
    contratoFinDias: 50,
    experiencia: [
      { empresa: 'Consultora de Procesos S.A.S.', cargo: 'Auxiliar de Calidad', inicio: '2019', fin: '2023' },
    ],
    historial: [
      { fecha: '2024-09-04', titulo: 'Prórroga de contrato', detalle: 'Prórroga del contrato a término fijo por un año.', tipo: 'contrato' },
      { fecha: '2023-11-15', titulo: 'Nueva certificación', detalle: 'Auditor interno ISO 9001.', tipo: 'estudio' },
      { fecha: '2023-09-04', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Analista de Calidad.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-004', nombres: 'Jorge Enrique', apellidos: 'Ramírez', genero: 'M',
    tipoDocumento: 'CC', documento: '80.XXX.XXX', cargo: 'Coordinador SST', area: 'SST',
    contrato: 'Indefinido', estado: 'Activo', ingreso: '2019-03-11', nacimiento: '1985-08-09', estadoCivil: 'Casado',
    ciudad: 'Bogotá', perfil: 'Profesional en seguridad y salud en el trabajo con licencia vigente y experiencia en gestión de riesgos.',
    titulos: [
      { titulo: 'Administración en Salud Ocupacional', institucion: 'Universidad ECCI', nivel: 'Pregrado', anio: 2010, acta: '10/12/2010' },
      { titulo: 'Especialización en Gerencia de la SST', institucion: 'Universidad Distrital', nivel: 'Especialización', anio: 2014, acta: '21/06/2014' },
    ],
    estudios: [
      { nombre: 'Curso de 50 horas del SG-SST', institucion: 'Plataforma de formación SST', tipo: 'Curso', horas: 50, anio: 2024 },
      { nombre: 'Trabajo seguro en alturas — coordinador', institucion: 'Centro de entrenamiento Demo', tipo: 'Certificación', horas: 80, anio: 2025, venceDias: 330 },
    ],
    vacunas: { influenza: { proxima: 15 } },
    experiencia: [
      { empresa: 'Constructora Ficticia Ltda.', cargo: 'Inspector SST', inicio: '2011', fin: '2019' },
    ],
    historial: [
      { fecha: '2025-02-18', titulo: 'Nueva certificación', detalle: 'Trabajo seguro en alturas — coordinador.', tipo: 'estudio' },
      { fecha: '2019-03-11', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Coordinador SST.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-005', nombres: 'Ana Sofía', apellidos: 'Herrera', genero: 'F',
    tipoDocumento: 'CC', documento: '1.XXX.XXX.XXX', cargo: 'Auxiliar de Operaciones', area: 'Operaciones',
    contrato: 'Obra o labor', estado: 'Activo', ingreso: '2025-01-20', nacimiento: '1999-12-03', estadoCivil: 'Soltera',
    ciudad: 'Cali', perfil: 'Auxiliar con experiencia en logística y apoyo operativo en sedes.',
    titulos: [
      { titulo: 'Tecnología en Logística', institucion: 'Institución Tecnológica Demo', nivel: 'Tecnológico', anio: 2021, acta: '11/12/2021', sinActa: true },
    ],
    estudios: [
      { nombre: 'Manipulación de cargas', institucion: 'Formación en línea', tipo: 'Curso', horas: 20, anio: 2025, sinCertificado: true },
    ],
    faltan: ['rut', 'banco', 'confidencialidad'],
    vacunas: { tetanos: { sinSoporte: true }, hepb2: { proxima: -10 } },
    contratoFinDias: 120,
    experiencia: [
      { empresa: 'Operador Logístico Demo', cargo: 'Auxiliar de bodega', inicio: '2021', fin: '2024' },
    ],
    historial: [
      { fecha: '2025-01-20', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Auxiliar de Operaciones.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-006', nombres: 'Diego Alejandro', apellidos: 'Torres', genero: 'M',
    tipoDocumento: 'CC', documento: '1.XXX.XXX.XXX', cargo: 'Técnico Biomédico', area: 'Biomédica',
    contrato: 'Término fijo', estado: 'Activo', ingreso: '2023-04-03', nacimiento: '1995-06-21', estadoCivil: 'Unión libre',
    ciudad: 'Tunja', perfil: 'Técnico en mantenimiento de equipo biomédico, con énfasis en preventivos y soporte en sedes.',
    titulos: [
      { titulo: 'Tecnología en Mantenimiento de Equipo Biomédico', institucion: 'Servicio de formación Demo', nivel: 'Tecnológico', anio: 2017, acta: '01/12/2017' },
    ],
    estudios: [
      { nombre: 'Seguridad eléctrica en equipos médicos', institucion: 'Formación en línea', tipo: 'Curso', horas: 24, anio: 2024 },
    ],
    porVencer: { antecedentes: 35 },
    vacunas: { influenza: { proxima: -5 } },
    contratoFinDias: 190,
    experiencia: [
      { empresa: 'Clínica Ficticia del Norte', cargo: 'Técnico de mantenimiento', inicio: '2018', fin: '2023' },
    ],
    historial: [
      { fecha: '2024-04-03', titulo: 'Prórroga de contrato', detalle: 'Prórroga del contrato a término fijo.', tipo: 'contrato' },
      { fecha: '2023-04-03', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Técnico Biomédico.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-007', nombres: 'Paula Andrea', apellidos: 'Castillo', genero: 'F',
    tipoDocumento: 'CC', documento: '53.XXX.XXX', cargo: 'Profesional de Gestión Humana', area: 'Gestión Humana',
    contrato: 'Indefinido', estado: 'Activo', ingreso: '2018-08-01', nacimiento: '1988-01-30', estadoCivil: 'Casada',
    ciudad: 'Bogotá', perfil: 'Psicóloga organizacional con experiencia en selección, bienestar y administración de personal.',
    titulos: [
      { titulo: 'Psicología', institucion: 'Pontificia Universidad Demo', nivel: 'Pregrado', anio: 2011, acta: '09/12/2011' },
      { titulo: 'Especialización en Gestión Humana', institucion: 'Universidad de La Sabana', nivel: 'Especialización', anio: 2015, acta: '19/06/2015' },
    ],
    estudios: [
      { nombre: 'Diplomado en Legislación Laboral', institucion: 'Universidad X', tipo: 'Diplomado', horas: 90, anio: 2022 },
      { nombre: 'Curso de Bienestar Laboral', institucion: 'Formación en línea', tipo: 'Curso', horas: 30, anio: 2024 },
    ],
    vacunas: {},
    experiencia: [
      { empresa: 'Consultora de Talento Demo', cargo: 'Analista de Selección', inicio: '2012', fin: '2018' },
    ],
    historial: [
      { fecha: '2024-06-12', titulo: 'Nuevo estudio complementario', detalle: 'Curso de Bienestar Laboral (30 horas).', tipo: 'estudio' },
      { fecha: '2018-08-01', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Profesional de Gestión Humana.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-008', nombres: 'Andrés Felipe', apellidos: 'Morales', genero: 'M',
    tipoDocumento: 'CC', documento: '1.XXX.XXX.XXX', cargo: 'Analista Administrativo', area: 'Administración',
    contrato: 'Prestación de servicios', estado: 'Activo', ingreso: '2025-05-05', nacimiento: '1997-09-14', estadoCivil: 'Soltero',
    ciudad: 'Bogotá', perfil: 'Profesional de apoyo administrativo en facturación y control de documentos.',
    titulos: [
      { titulo: 'Contaduría Pública', institucion: 'Universidad Demo de Colombia', nivel: 'Pregrado', anio: 2020, acta: '04/12/2020', sinDocumento: true },
    ],
    estudios: [],
    faltan: ['caja', 'pension', 'examen_periodico', 'confidencialidad'],
    vacunas: { covid: { sinSoporte: true }, hepb1: { sinSoporte: true } },
    contratoFinDias: 80,
    experiencia: [
      { empresa: 'Empresa XYZ', cargo: 'Auxiliar Contable', inicio: '2020', fin: '2025' },
    ],
    historial: [
      { fecha: '2025-05-05', titulo: 'Ingreso a la organización', detalle: 'Vinculación por prestación de servicios.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-009', nombres: 'Natalia', apellidos: 'Ruiz Ospina', genero: 'F',
    tipoDocumento: 'CC', documento: '43.XXX.XXX', cargo: 'Auditora Interna', area: 'Calidad',
    contrato: 'Indefinido', estado: 'Activo', ingreso: '2021-01-18', nacimiento: '1986-05-07', estadoCivil: 'Divorciada',
    ciudad: 'Medellín', perfil: 'Auditora de sistemas de gestión con experiencia en habilitación y acreditación en salud.',
    titulos: [
      { titulo: 'Enfermería', institucion: 'Universidad de Antioquia', nivel: 'Pregrado', anio: 2009, acta: '12/06/2009' },
      { titulo: 'Especialización en Auditoría en Salud', institucion: 'Universidad CES', nivel: 'Especialización', anio: 2013, acta: '14/12/2013' },
    ],
    estudios: [
      { nombre: 'Auditor líder ISO 9001', institucion: 'Organismo de formación Demo', tipo: 'Certificación', horas: 40, anio: 2022 },
      { nombre: 'Sistema Único de Habilitación', institucion: 'Formación en línea', tipo: 'Curso', horas: 60, anio: 2023 },
    ],
    porVencer: { examen_periodico: 40 },
    vacunas: { influenza: { proxima: -45 } },
    experiencia: [
      { empresa: 'IPS Ficticia Salud', cargo: 'Coordinadora de Calidad', inicio: '2014', fin: '2021' },
    ],
    historial: [
      { fecha: '2023-10-02', titulo: 'Nuevo estudio complementario', detalle: 'Sistema Único de Habilitación (60 horas).', tipo: 'estudio' },
      { fecha: '2021-01-18', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Auditora Interna.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-010', nombres: 'Santiago', apellidos: 'Vargas León', genero: 'M',
    tipoDocumento: 'CC', documento: '1.XXX.XXX.XXX', cargo: 'Inspector SST', area: 'SST',
    contrato: 'Término fijo', estado: 'Activo', ingreso: '2024-02-12', nacimiento: '1994-10-25', estadoCivil: 'Soltero',
    ciudad: 'Girardot', perfil: 'Tecnólogo en seguridad y salud en el trabajo con experiencia en inspecciones de sede.',
    titulos: [
      { titulo: 'Tecnología en Seguridad y Salud en el Trabajo', institucion: 'Institución Tecnológica Demo', nivel: 'Tecnológico', anio: 2018, acta: '07/12/2018' },
    ],
    estudios: [
      { nombre: 'Curso de 50 horas del SG-SST', institucion: 'Plataforma de formación SST', tipo: 'Curso', horas: 50, anio: 2023, venceDias: -15 },
      { nombre: 'Primeros auxilios', institucion: 'Formación en línea', tipo: 'Curso', horas: 16, anio: 2024 },
    ],
    faltan: ['rut'],
    vencidos: ['examen_periodico'],
    vacunas: { hepb2: { proxima: 20 } },
    contratoFinDias: 35,
    experiencia: [
      { empresa: 'Empresa ABC', cargo: 'Auxiliar SST', inicio: '2019', fin: '2024' },
    ],
    historial: [
      { fecha: '2025-02-12', titulo: 'Prórroga de contrato', detalle: 'Prórroga del contrato a término fijo.', tipo: 'contrato' },
      { fecha: '2024-02-12', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Inspector SST.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-011', nombres: 'Camila', apellidos: 'Rojas Pineda', genero: 'F',
    tipoDocumento: 'CC', documento: '52.XXX.XXX', cargo: 'Supervisora de Operaciones', area: 'Operaciones',
    contrato: 'Indefinido', estado: 'Activo', ingreso: '2019-10-07', nacimiento: '1989-03-16', estadoCivil: 'Casada',
    ciudad: 'Bogotá', perfil: 'Supervisora con experiencia en coordinación de turnos, indicadores operativos y atención de sedes.',
    titulos: [
      { titulo: 'Ingeniería de Producción', institucion: 'Universidad Distrital', nivel: 'Pregrado', anio: 2013, acta: '13/12/2013' },
    ],
    estudios: [
      { nombre: 'Diplomado en Lean Manufacturing', institucion: 'Universidad X', tipo: 'Diplomado', horas: 120, anio: 2022 },
      { nombre: 'Liderazgo de equipos', institucion: 'Formación en línea', tipo: 'Curso', horas: 32, anio: 2024 },
    ],
    vacunas: { influenza: { proxima: 60 } },
    experiencia: [
      { empresa: 'Manufacturas Demo S.A.', cargo: 'Jefe de turno', inicio: '2014', fin: '2019' },
    ],
    historial: [
      { fecha: '2024-03-01', titulo: 'Cambio de cargo', detalle: 'Promoción a Supervisora de Operaciones.', tipo: 'contrato' },
      { fecha: '2019-10-07', titulo: 'Ingreso a la organización', detalle: 'Vinculación como Coordinadora de turno.', tipo: 'ingreso' },
    ],
  },
  {
    id: 'col-012', nombres: 'Mateo', apellidos: 'Jiménez Cárdenas', genero: 'M',
    tipoDocumento: 'CC', documento: '1.XXX.XXX.XXX', cargo: 'Auxiliar de Gestión Humana', area: 'Gestión Humana',
    contrato: 'Aprendizaje', estado: 'Inactivo', ingreso: '2024-07-01', nacimiento: '2003-07-22', estadoCivil: 'Soltero',
    ciudad: 'Bogotá', perfil: 'Aprendiz de gestión del talento humano en etapa productiva.',
    titulos: [
      { titulo: 'Técnico en Recursos Humanos', institucion: 'Servicio de formación Demo', nivel: 'Técnico', anio: 2024, acta: '28/06/2024', sinActa: true, sinDocumento: true },
    ],
    estudios: [],
    faltan: ['rut', 'banco', 'pension', 'examen_periodico'],
    vacunas: { tetanos: { sinSoporte: true } },
    contratoFinDias: -20,
    experiencia: [],
    historial: [
      { fecha: fechaRelativa(-20), titulo: 'Finalización de contrato de aprendizaje', detalle: 'Terminó la etapa productiva.', tipo: 'contrato' },
      { fecha: '2024-07-01', titulo: 'Ingreso a la organización', detalle: 'Vinculación con contrato de aprendizaje.', tipo: 'ingreso' },
    ],
  },
];

export const TIPO_CONTRATO_LARGO = {
  Indefinido: 'Contrato a término indefinido',
  'Término fijo': 'Contrato a término fijo',
  'Obra o labor': 'Contrato por obra o labor',
  'Prestación de servicios': 'Contrato de prestación de servicios',
  Aprendizaje: 'Contrato de aprendizaje',
};

function slug(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Documento de ejemplo: un enlace (como los de Drive/OneDrive que se usan en la plataforma)
// que apunta a un PDF de demostración servido por la misma app (public/rrhh-demo).
const PDF_DEMO = '/rrhh-demo/documento-demo.pdf';
function archivoSimulado(nombre, fechaCarga) {
  return { nombre: 'PDF de demostración', url: `${PDF_DEMO}#${encodeURIComponent(nombre)}`, fechaCarga };
}

// Construye las colecciones "planas" (una fila por registro, como vendrían de la BD).
function construirColecciones() {
  const colaboradores = [];
  const documentos = [];
  const titulos = [];
  const estudios = [];
  const vacunas = [];
  const contratos = [];
  const experiencia = [];
  const historial = [];

  // La demo muestra solo 3 personas de ejemplo.
  ESPECIFICACION.slice(0, 3).forEach((e, idx) => {
    const n = String(idx + 1).padStart(2, '0');
    const inicial = `${e.nombres[0]}${e.apellidos[0]}`;
    const usuarioCorreo = `${slug(e.nombres.split(' ')[0]).toLowerCase()}.${slug(e.apellidos.split(' ')[0]).toLowerCase()}`;
    colaboradores.push({
      id: e.id, nombres: e.nombres, apellidos: e.apellidos, nombreCompleto: `${e.nombres} ${e.apellidos}`, genero: e.genero,
      tipoDocumento: e.tipoDocumento, documento: e.documento, cargo: e.cargo, area: e.area, empresa: e.empresa, estado: e.estado,
      fechaIngreso: e.ingreso, fechaNacimiento: e.nacimiento, estadoCivil: e.estadoCivil, ciudad: e.ciudad,
      telefono: `300 000 00${n}`, correo: `${usuarioCorreo}@example.com`, direccion: `Calle ${100 + idx} # 00-${n} (dirección ficticia)`,
      contactoEmergencia: { nombre: `Contacto de emergencia ${n} (ficticio)`, parentesco: idx % 2 ? 'Hermano(a)' : 'Cónyuge', telefono: `310 000 00${n}` },
      perfil: e.perfil,
      // Dotación: null = sin registrar; { recibio: true, archivo } o { recibio: false }.
      dotacion: e.dotacion ? {
        recibio: e.dotacion.recibio, fecha: fechaRelativa(e.dotacion.dias),
        archivo: e.dotacion.recibio ? archivoSimulado(`Acta_entrega_dotacion_${inicial}.pdf`, fechaRelativa(e.dotacion.dias)) : null,
      } : null,
    });

    DOCUMENTOS_BASE.forEach((d, i) => {
      const cargado = !(e.faltan || []).includes(d.clave);
      let vence = d.venceDias != null ? fechaRelativa(d.venceDias + idx * 11) : null;
      if ((e.vencidos || []).includes(d.clave)) vence = fechaRelativa(-18 - idx);
      if (e.porVencer?.[d.clave] != null) vence = fechaRelativa(e.porVencer[d.clave]);
      const fechaCarga = fechaRelativa(-400 + i * 9 - idx * 5);
      documentos.push({
        id: `${e.id}-doc-${d.clave}`, colaboradorId: e.id, clave: d.clave, tipo: d.tipo, nombre: d.nombre, requerido: true,
        fechaExpedicion: cargado ? fechaCarga : null, fechaVencimiento: cargado ? vence : null,
        archivo: cargado ? archivoSimulado(`${d.archivo.replace('.pdf', '')}_${inicial}.pdf`, fechaCarga) : null,
      });
    });

    e.titulos.forEach((tt, i) => {
      const id = `${e.id}-tit-${i}`;
      titulos.push({
        id, colaboradorId: e.id, titulo: tt.titulo, institucion: tt.institucion, nivel: tt.nivel, anio: tt.anio,
        verificado: !tt.sinDocumento,
        archivo: tt.sinDocumento ? null : archivoSimulado(`Titulo_${slug(tt.titulo)}.pdf`, fechaRelativa(-500 + i * 20)),
        acta: {
          fecha: tt.acta,
          archivo: tt.sinActa ? null : archivoSimulado(`Acta_de_grado_${slug(tt.titulo)}.pdf`, fechaRelativa(-500 + i * 20)),
        },
      });
    });

    e.estudios.forEach((s, i) => {
      estudios.push({
        id: `${e.id}-est-${i}`, colaboradorId: e.id, nombre: s.nombre, institucion: s.institucion, tipo: s.tipo, horas: s.horas, anio: s.anio,
        fechaVencimiento: s.venceDias != null ? fechaRelativa(s.venceDias) : null,
        archivo: s.sinCertificado ? null : archivoSimulado(`Certificado_${slug(s.nombre)}.pdf`, fechaRelativa(-300 + i * 30)),
      });
    });

    VACUNAS_BASE.forEach((v, i) => {
      const ajuste = e.vacunas?.[v.clave] || {};
      vacunas.push({
        id: `${e.id}-vac-${v.clave}`, colaboradorId: e.id, vacuna: v.vacuna, dosis: v.dosis, fecha: v.fecha,
        lote: `LOTE-${String(4000 + idx * 37 + i * 211).slice(0, 4)}`,
        proximaDosis: ajuste.proxima != null ? fechaRelativa(ajuste.proxima) : null,
        archivo: ajuste.sinSoporte ? null : archivoSimulado(`Carne_vacunacion_${slug(v.vacuna)}.pdf`, v.fecha),
      });
    });

    contratos.push({
      id: `${e.id}-contrato`, colaboradorId: e.id, tipo: e.contrato, tipoDescripcion: TIPO_CONTRATO_LARGO[e.contrato] || e.contrato,
      // Periodo de 3 meses con renovación automática: rrhhService calcula la terminación del
      // periodo vigente a partir de la fecha de inicio (ver renovarContratos).
      fechaInicio: e.ingreso, fechaFin: null,
      cargo: e.cargo, area: e.area, jornada: e.contrato === 'Aprendizaje' ? 'Medio tiempo' : 'Tiempo completo',
      // El documento firmado del contrato es el documento 'contrato' del expediente.
    });

    e.experiencia.forEach((x, i) => experiencia.push({ id: `${e.id}-exp-${i}`, colaboradorId: e.id, ...x }));
    e.historial.forEach((h, i) => historial.push({ id: `${e.id}-his-${i}`, colaboradorId: e.id, ...h }));
  });

  // Funciones del cargo (Capacitaciones de ingreso y reinducción): un documento por cargo.
  const funcionesCargo = [
    { id: 'cargo-director', cargo: 'Director', archivo: archivoSimulado('Funciones_Director.pdf', fechaRelativa(-200)) },
    { id: 'cargo-coordinador', cargo: 'Coordinador', archivo: archivoSimulado('Funciones_Coordinador.pdf', fechaRelativa(-180)) },
    { id: 'cargo-analista', cargo: 'Analista', archivo: archivoSimulado('Funciones_Analista.pdf', fechaRelativa(-150)) },
    { id: 'cargo-auxiliar', cargo: 'Auxiliar', archivo: null },
  ];

  return { colaboradores, documentos, titulos, estudios, vacunas, contratos, experiencia, historial, funcionesCargo };
}

export const DATOS_DEMO = construirColecciones();
