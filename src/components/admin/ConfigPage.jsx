// src/components/admin/ConfigPage.jsx
import { Button } from '../ui.jsx';

// Sello de versión — actualízalo cuando reemplaces App.jsx, así confirmas en Configuración
// que el navegador está sirviendo la versión más reciente y no una copia en caché.
const APP_BUILD = '2026-09-29 · Arquitectura multiempresa (SUPER_ADMIN, empresas y usuarios)';

export default function ConfigPage({ t, onLogout }) {
  return (
    <div>
      <h1 className="text-lg font-bold mb-1">Configuración</h1>
      <p className={`text-2xs mb-4 font-mono ${t.muted}`}>Versión del panel: {APP_BUILD}</p>

      <div className={`rounded-lg border p-4 max-w-md ${t.panel} ${t.border}`}>
        <div className="text-xs font-semibold mb-1">Sesión</div>
        <p className={`text-2xs mb-3 ${t.muted}`}>Cierra tu sesión en este navegador. Te pedirá usuario y contraseña de nuevo.</p>
        <Button variant="outline" t={t} onClick={onLogout}>Cerrar sesión</Button>
      </div>
    </div>
  );
}
