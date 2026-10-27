// src/utils/id.js
// Generador de ids cortos y únicos para registros creados en el cliente (equipos, personal,
// documentos, calibraciones, preventivos, correctivos, instalaciones, bajas, reportes de
// falla...) — usado en toda la app, por eso vive en su propio módulo.
export const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
