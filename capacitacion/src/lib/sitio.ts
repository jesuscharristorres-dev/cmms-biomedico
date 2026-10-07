// Datos institucionales. Los valores null se muestran como "pendiente" y quedan en el reporte de migración.
export const SITIO = {
  nombre: 'Capacitación biomédica',
  area: 'Ingeniería biomédica',
  // URL "embed" del calendario de Google de próximas capacitaciones (src del iframe actual).
  calendarioUrl: null as string | null,
  // Correo del área para dudas y para ejercer derechos de habeas data.
  correoArea: null as string | null,
  sitioAnterior: 'https://formacionbiomedica.wordpress.com/',
  notaAprobacion: 80,
  intentosPosTest: 3,
  preguntasPosTest: 10,
  vigenciaMeses: 12,
};
