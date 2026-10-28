// src/components/equipos/helpers.js
// Helper compartido por DocumentosTab.jsx y CalibracionesTab.jsx (ambos validan una URL de
// documento externo de la misma forma) — evita que un módulo importe del otro para esto.

// Los documentos/certificados solo guardan su URL externa (Drive/OneDrive/Dropbox/etc.) —
// nunca el archivo — para no consumir almacenamiento de la base de datos ni del servidor.
export function esUrlDocumentoValida(value) {
  try {
    const u = new URL((value || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
