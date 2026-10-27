// src/context/AuthUserContext.js
import React from 'react';

// Usuario autenticado tal como lo describe el servidor (GET /api/login): { id, nombre,
// email, role, empresa_id, estado }. La UI lo usa para adaptar menú y selectores; la
// autorización real SIEMPRE la decide la API a partir de la sesión, nunca de este objeto.
const AuthUserContext = React.createContext(null);

export default AuthUserContext;
