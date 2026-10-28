// src/utils/theme.js
// Clases de superficie claro/oscuro — única fuente de verdad, la usa MainApp y
// también las pantallas públicas (ReporteFallaForm) para no divergir del resto del CMMS.
export function uiTheme(dark) {
  return dark
    ? { bg: 'bg-slate-950', panel: 'bg-slate-900', panel3: 'bg-slate-800/60', border: 'border-slate-700/60', text: 'text-slate-100', muted: 'text-slate-400', input: 'bg-slate-950 border-slate-700 text-slate-100' }
    : { bg: 'bg-slate-50', panel: 'bg-white', panel3: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-900', muted: 'text-slate-500', input: 'bg-white border-slate-300 text-slate-900' };
}
