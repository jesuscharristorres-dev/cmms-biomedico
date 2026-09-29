/* scripts/isolation-suite.js
 *
 * Prueba de AISLAMIENTO MULTIEMPRESA contra un deployment REAL (Preview), vía HTTP y usando
 * solo la API pública del sistema — exactamente lo que podría hacer un atacante con DevTools,
 * curl o Postman. No accede a KV ni a variables de entorno del servidor.
 *
 * Qué hace (idempotente — se puede repetir):
 *   1. Inicia sesión como SUPER_ADMIN (credenciales existentes; NO las modifica).
 *   2. Reutiliza las empresas existentes: Empresa 1 = MACROMED y Empresa 2 = MEIDE (o, si no
 *      existieran, las dos primeras empresas activas).
 *   3. Crea (o reactiva/restablece) dos usuarios de prueba, rol EMPRESA, uno por empresa.
 *   4. Crea datos mínimos: un equipo y una hoja de vida por empresa (ids "prueba-aislamiento-*")
 *      y un reporte de falla público sobre el equipo de Empresa 2.
 *   5. Ejecuta las verificaciones de aislamiento con cada usuario y de administración con el
 *      SUPER_ADMIN, comprobando código HTTP y contenido de cada respuesta.
 *
 * Es un script "clásico" (sin import/export) para poder usarse de dos formas:
 *   - Node:       scripts/preview-isolation-test.mjs  (ver ese archivo)
 *   - Navegador:  pegar este archivo en la consola de DevTools con el Preview abierto y luego
 *                 ejecutar  await cmmsIsolationSuite.runInBrowser()
 *
 * Documentación y credenciales de prueba: docs/prueba-aislamiento-preview.md
 */
(function () {
  const PREFIJO = 'prueba-aislamiento';
  const TEST_USERS = [
    { slot: 1, nombre: 'PRUEBA Usuario Empresa 1', email: 'prueba.empresa1@cmms-prueba.local' },
    { slot: 2, nombre: 'PRUEBA Usuario Empresa 2', email: 'prueba.empresa2@cmms-prueba.local' },
  ];
  const DEFAULT_TEST_PASSWORD = 'PruebaAislamiento-2026!';
  const PREFERIDAS = ['MACROMED', 'MEIDE'];

  /**
   * `http(method, path, { body, as })` → { status, body }. `as` es el nombre de la identidad
   * ('sa', 'u1', 'u2', 'anon'); el runner decide cómo mantener la sesión de cada una.
   * `login(as, user, pass, extraBody)` / `logout(as)` cambian la sesión de esa identidad.
   */
  async function runSuite({ http, login, logout, log = console.log, adminUser, adminPass, testPassword = DEFAULT_TEST_PASSWORD, cleanup = false }) {
    const resultados = [];
    const check = (grupo, nombre, ok, detalle) => {
      resultados.push({ grupo, nombre, ok: !!ok, detalle: detalle || '' });
      log(`${ok ? '✔' : '✘'} [${grupo}] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
    };
    const fatal = (msg) => { const e = new Error(msg); e.fatal = true; throw e; };
    const st = (r) => `HTTP ${r.status}`;
    const ids = (list) => (list || []).map(x => x.id);

    /* ---------- 0. Entorno ---------- */
    const pre = await http('GET', '/api/login', { as: 'anon' });
    if (pre.status !== 200 || !pre.body || !pre.body.entorno) fatal(`GET /api/login no respondió el entorno (${st(pre)}). No se continúa.`);
    if (pre.body.entorno === 'production') fatal('El deployment apunta a PRODUCTION. Esta prueba solo se ejecuta en Preview. Abortado sin tocar nada.');
    check('entorno', `El deployment trabaja sobre el namespace "${pre.body.entorno}" (no production)`, true);

    /* ---------- 1. SUPER_ADMIN: empresas ---------- */
    const lsa = await login('sa', adminUser, adminPass);
    if (lsa.status !== 200) fatal(`No se pudo iniciar sesión como SUPER_ADMIN (${st(lsa)}): ${lsa.body && lsa.body.error}`);
    const me = await http('GET', '/api/login', { as: 'sa' });
    check('super_admin', 'La sesión inicial es SUPER_ADMIN', me.body?.user?.role === 'SUPER_ADMIN', `rol=${me.body?.user?.role}`);
    if (me.body?.user?.role !== 'SUPER_ADMIN') fatal('La cuenta indicada no es SUPER_ADMIN.');

    const emp = await http('GET', '/api/admin?resource=empresas', { as: 'sa' });
    check('super_admin', 'SUPER_ADMIN lista todas las empresas', emp.status === 200 && (emp.body.empresas || []).length >= 5,
      `${st(emp)}, ${(emp.body.empresas || []).length} empresas: ${ids(emp.body.empresas).join(', ')}`);
    const activas = (emp.body.empresas || []).filter(e => e.estado === 'activo');
    const E = PREFERIDAS.every(p => activas.some(e => e.id === p)) ? PREFERIDAS.slice() : activas.slice(0, 2).map(e => e.id);
    if (E.length < 2) fatal('Se necesitan al menos 2 empresas activas.');
    const [E1, E2] = E;
    const sedeDe = (id) => activas.find(e => e.id === id).sedes[0];
    log(`Empresa 1 = ${E1} · Empresa 2 = ${E2}`);

    /* ---------- 2. Usuarios de prueba (idempotente) ---------- */
    const lu = await http('GET', '/api/admin?resource=usuarios', { as: 'sa' });
    check('super_admin', 'SUPER_ADMIN lista todos los usuarios', lu.status === 200, `${st(lu)}, ${(lu.body.usuarios || []).length} usuarios`);
    const userIds = {};
    for (const tu of TEST_USERS) {
      const empresa = tu.slot === 1 ? E1 : E2;
      const existente = (lu.body.usuarios || []).find(u => (u.email || '').toLowerCase() === tu.email);
      if (existente && existente.role === 'SUPER_ADMIN') fatal(`${tu.email} existe como SUPER_ADMIN: no se toca.`);
      let r;
      if (existente) {
        r = await http('PATCH', `/api/admin?resource=usuarios&id=${encodeURIComponent(existente.id)}`, { as: 'sa',
          body: { nombre: tu.nombre, role: 'EMPRESA', empresa_id: empresa, estado: 'activo', password: testPassword } });
      } else {
        r = await http('POST', '/api/admin?resource=usuarios', { as: 'sa',
          body: { nombre: tu.nombre, email: tu.email, password: testPassword, role: 'EMPRESA', empresa_id: empresa, estado: 'activo' } });
      }
      const u = r.body && r.body.usuario;
      check('preparacion', `${existente ? 'Actualizado' : 'Creado'} ${tu.email} → ${empresa}, rol EMPRESA`,
        (r.status === 200 || r.status === 201) && u && u.role === 'EMPRESA' && u.empresa_id === empresa && !('password_hash' in u), st(r));
      if (!u) fatal(`No se pudo preparar ${tu.email}.`);
      userIds[tu.slot] = u.id;
    }

    /* ---------- 3. Login de los usuarios de prueba (con intento de escalar en el body) ---------- */
    const l1 = await login('u1', TEST_USERS[0].email, testPassword, { role: 'SUPER_ADMIN', empresa_id: E2 });
    const l2 = await login('u2', TEST_USERS[1].email, testPassword, { role: 'SUPER_ADMIN', empresa_id: E1 });
    if (l1.status !== 200 || l2.status !== 200) fatal(`Login de usuarios de prueba falló (${st(l1)} / ${st(l2)}).`);
    const who1 = await http('GET', '/api/login', { as: 'u1' });
    const who2 = await http('GET', '/api/login', { as: 'u2' });
    check('escalada', 'Mandar role/empresa_id en el login NO cambia el rol ni la empresa (usuario 1)',
      who1.body.user.role === 'EMPRESA' && who1.body.user.empresa_id === E1, `rol=${who1.body.user.role}, empresa=${who1.body.user.empresa_id}`);
    check('escalada', 'Mandar role/empresa_id en el login NO cambia el rol ni la empresa (usuario 2)',
      who2.body.user.role === 'EMPRESA' && who2.body.user.empresa_id === E2, `rol=${who2.body.user.role}, empresa=${who2.body.user.empresa_id}`);
    check('lectura', 'Usuario 1 solo recibe su empresa en /api/login', JSON.stringify(ids(who1.body.empresas)) === JSON.stringify([E1]), ids(who1.body.empresas).join(','));
    check('lectura', 'Usuario 2 solo recibe su empresa en /api/login', JSON.stringify(ids(who2.body.empresas)) === JSON.stringify([E2]), ids(who2.body.empresas).join(','));

    /* ---------- 4. Datos de prueba (cada usuario crea los suyos) ---------- */
    const EQ = { 1: `${PREFIJO}-equipo-emp1`, 2: `${PREFIJO}-equipo-emp2` };
    const PER = { 1: `${PREFIJO}-personal-emp1`, 2: `${PREFIJO}-personal-emp2` };
    for (const n of [1, 2]) {
      const as = `u${n}`;
      const empresa = n === 1 ? E1 : E2;
      const ce = await http('POST', '/api/equipos', { as, body: { equipo: {
        id: EQ[n], equipo: `PRUEBA Monitor Empresa ${n}`, marca: 'PRUEBA', modelo: 'AISLAMIENTO', numeroSerie: `SN-PRUEBA-${n}`,
        sede: sedeDe(empresa), estado: 'Operativo', preventivos: [], correctivos: [], calibraciones: [], documentos: [],
        observaciones: `DATO PRIVADO DE ${empresa}`,
      } } });
      check('preparacion', `Usuario ${n} crea (o ya tenía) su equipo de prueba`, ce.status === 200 && ids(ce.body.equipos).includes(EQ[n]), st(ce));
      const cp = await http('POST', '/api/personal', { as, body: { record: {
        id: PER[n], nombreCompleto: `PRUEBA Persona Empresa ${n}`, tipoDocumento: 'CC', numeroDocumento: `PRUEBA-${n}`, cargo: 'PRUEBA', estado: 'Activo',
      } } });
      check('preparacion', `Usuario ${n} crea (o ya tenía) su hoja de vida de prueba`, cp.status === 200, st(cp));
    }
    // Reporte de falla sobre el equipo de Empresa 2 (formulario público, sin sesión).
    const RF2 = `${PREFIJO}-reporte-emp2`;
    const rf = await http('POST', '/api/reportes-falla', { as: 'anon', body: { reporte: {
      id: RF2, empresa: E2, sede: sedeDe(E2), equipoId: EQ[2], personaReporta: 'PRUEBA', descripcion: 'PRUEBA de aislamiento', prioridad: 'Baja',
    } } });
    check('preparacion', 'Reporte de falla público creado sobre el equipo de Empresa 2', rf.status === 200, st(rf));

    /* ---------- 5. Verificaciones por usuario ---------- */
    const otro = { 1: 2, 2: 1 };
    const noExiste = `${PREFIJO}-no-existe`;
    for (const n of [1, 2]) {
      const as = `u${n}`;
      const mia = n === 1 ? E1 : E2;
      const ajena = n === 1 ? E2 : E1;
      const g = `empresa ${n}`;

      const eq = await http('GET', '/api/equipos', { as });
      const lista = eq.body.equipos || [];
      check(g, `Lee sus propios equipos`, eq.status === 200 && lista.some(e => e.id === EQ[n]), `${st(eq)}, ${lista.length} equipos`);
      check(g, `NO recibe ningún equipo de otra empresa`, lista.every(e => e.empresa === mia) && !lista.some(e => e.id === EQ[otro[n]]));
      check(g, 'La respuesta no contiene el texto privado de la otra empresa', !JSON.stringify(eq.body).includes(`DATO PRIVADO DE ${ajena}`));

      const pe = await http('GET', '/api/personal', { as });
      check(g, 'Lee su personal y NO el de otra empresa', pe.status === 200 && (pe.body.personal || []).some(p => p.id === PER[n]) && (pe.body.personal || []).every(p => p.empresa === mia), st(pe));

      const rep = await http('GET', '/api/reportes-falla', { as });
      check(g, 'Reportes de falla: solo los de su empresa', rep.status === 200 && (rep.body.reportes || []).every(r => r.empresa === mia)
        && (n === 2 ? (rep.body.reportes || []).some(r => r.id === RF2) : !(rep.body.reportes || []).some(r => r.id === RF2)), st(rep));

      for (const ep of ['/api/planes-programas', '/api/tecno-reportes', '/api/limpieza-desinfeccion', '/api/limpieza-plantillas']) {
        const d = await http('GET', ep, { as });
        const keys = Object.keys(d.body.data || {});
        check(g, `${ep}: solo su empresa`, d.status === 200 && keys.every(k => k === mia), `${st(d)}, claves: ${keys.join(',') || '(vacío)'}`);
      }
      const cap = await http('GET', '/api/capacitaciones', { as });
      check(g, '/api/capacitaciones: solo registros de su empresa', cap.status === 200 && ((cap.body.data && cap.body.data.records) || []).every(r => r.empresa === mia), st(cap));

      const ae = await http('GET', '/api/admin?resource=empresas', { as });
      check(g, 'Administración → empresas: solo ve la suya', ae.status === 200 && JSON.stringify(ids(ae.body.empresas)) === JSON.stringify([mia]), ids(ae.body.empresas).join(','));

      // Manipulación de empresa_id / empresa en query y body.
      for (const ep of ['/api/equipos', '/api/personal', '/api/reportes-falla', '/api/planes-programas']) {
        const q = await http('GET', `${ep}?empresa=${encodeURIComponent(ajena)}`, { as });
        check(g, `GET ${ep}?empresa=${ajena} → 403 sin datos`, q.status === 403 && !q.body.equipos && !q.body.personal && !q.body.reportes && !q.body.data, st(q));
      }
      const pb = await http('POST', '/api/equipos', { as, body: { equipo: { id: `${PREFIJO}-intruso-${n}`, empresa: ajena, equipo: 'INTRUSO' } } });
      check(g, `Crear un equipo con empresa=${ajena} en el body → 403`, pb.status === 403, st(pb));
      const pk = await http('PATCH', '/api/planes-programas', { as, body: { empresaKey: ajena, campo: 'prueba', valor: 'INTRUSO' } });
      check(g, `Escribir documentos de ${ajena} (empresaKey manipulado) → 403`, pk.status === 403, st(pk));
      const mv = await http('PATCH', '/api/equipos', { as, body: { id: EQ[n], patch: { empresa: ajena } } });
      check(g, `Mover su propio equipo a ${ajena} → 403`, mv.status === 403, st(mv));
      const ok = await http('PATCH', '/api/equipos', { as, body: { id: EQ[n], patch: { ubicacion: `PRUEBA editado por usuario ${n}` } } });
      check(g, 'Editar su propio equipo → 200', ok.status === 200 && ok.body.equipo && ok.body.equipo.empresa === mia, st(ok));

      // Manipulación de IDs de recursos de la otra empresa.
      const ref = await http('PATCH', '/api/equipos', { as, body: { id: noExiste, patch: { marca: 'X' } } });
      const pa = await http('PATCH', '/api/equipos', { as, body: { id: EQ[otro[n]], patch: { marca: 'HACKEADO' } } });
      check(g, 'PATCH de un equipo ajeno por id → 404', pa.status === 404, st(pa));
      check(g, 'El 404 de un equipo ajeno es idéntico al de uno inexistente (no se infiere su existencia)',
        pa.status === ref.status && JSON.stringify(pa.body) === JSON.stringify(ref.body));
      const de = await http('DELETE', '/api/equipos', { as, body: { id: EQ[otro[n]] } });
      check(g, 'DELETE de un equipo ajeno por id → 404', de.status === 404, st(de));
      const pp = await http('PATCH', '/api/personal', { as, body: { id: PER[otro[n]], patch: { nombreCompleto: 'HACKEADO' } } });
      check(g, 'PATCH de una hoja de vida ajena por id → 404', pp.status === 404, st(pp));
      if (n === 1) {
        const rpa = await http('PATCH', '/api/reportes-falla', { as, body: { id: RF2, patch: { estado: 'Finalizado' } } });
        check(g, 'PATCH de un reporte de falla ajeno → 404', rpa.status === 404, st(rpa));
        const rde = await http('DELETE', `/api/reportes-falla?id=${encodeURIComponent(RF2)}`, { as });
        check(g, 'DELETE de un reporte de falla ajeno → 404', rde.status === 404, st(rde));
      }
      const col = await http('POST', '/api/equipos', { as, body: { equipo: { id: EQ[otro[n]], equipo: 'SUPLANTADO' } } });
      check(g, 'Crear un equipo reutilizando el id de uno ajeno → 409 (no lo sobrescribe)', col.status === 409, st(col));

      // Escalada de privilegios / administración.
      const selfRole = await http('PATCH', `/api/admin?resource=usuarios&id=${encodeURIComponent(userIds[n])}`, { as, body: { role: 'SUPER_ADMIN' } });
      check(g, 'Hacerse SUPER_ADMIN editando su propio usuario → 403', selfRole.status === 403, st(selfRole));
      const selfEmp = await http('PATCH', `/api/admin?resource=usuarios&id=${encodeURIComponent(userIds[n])}`, { as, body: { empresa_id: ajena } });
      check(g, `Cambiarse a sí mismo a ${ajena} → 403`, selfEmp.status === 403, st(selfEmp));
      const newSa = await http('POST', '/api/admin?resource=usuarios', { as, body: { nombre: 'x', email: `${PREFIJO}-x@cmms-prueba.local`, password: testPassword, role: 'SUPER_ADMIN' } });
      check(g, 'Crear un SUPER_ADMIN → 403', newSa.status === 403, st(newSa));
      const lus = await http('GET', '/api/admin?resource=usuarios', { as });
      check(g, 'Listar usuarios → 403', lus.status === 403 && !lus.body.usuarios, st(lus));
      const emE = await http('PATCH', `/api/admin?resource=empresas&id=${encodeURIComponent(ajena)}`, { as, body: { estado: 'inactivo' } });
      check(g, `Desactivar ${ajena} → 403`, emE.status === 403, st(emE));
      const sin = await http('GET', '/api/admin?resource=sin-empresa', { as });
      check(g, 'Informe de registros sin empresa → 403', sin.status === 403, st(sin));
      const sync = await http('POST', '/api/capacitaciones', { as });
      check(g, 'Sincronizar capacitaciones (global) → 403', sync.status === 403, st(sync));
      const mail = await http('POST', '/api/send-email', { as, body: { to: 'x@x.co', subject: 'x', html: 'x' } });
      check(g, 'Usar /api/send-email → 403', mail.status === 403, st(mail));
      const who = await http('GET', '/api/login', { as });
      check(g, 'Tras todos los intentos sigue siendo EMPRESA de su empresa', who.body.user.role === 'EMPRESA' && who.body.user.empresa_id === mia);
    }

    /* ---------- 6. Sin sesión (endpoints directos) ---------- */
    for (const ep of ['/api/equipos', '/api/personal', '/api/reportes-falla', '/api/planes-programas', '/api/tecno-reportes',
      '/api/tecno-transversal', '/api/limpieza-desinfeccion', '/api/limpieza-plantillas', '/api/capacitaciones', '/api/admin?resource=empresas']) {
      const r = await http('GET', ep, { as: 'anon' });
      check('sin sesión', `GET ${ep} → 401`, r.status === 401, st(r));
    }
    const cat = await http('GET', '/api/reportes-falla?catalogo=1', { as: 'anon' });
    const catTxt = JSON.stringify(cat.body);
    check('sin sesión', 'Catálogo público sin datos sensibles (observaciones, mantenimientos, contacto, usuarios)',
      cat.status === 200 && !catTxt.includes('DATO PRIVADO') && !/"(observaciones|preventivos|correctivos|calibraciones|nit|email|telefono|password_hash)"/.test(catTxt), st(cat));

    /* ---------- 7. SUPER_ADMIN: visibilidad global y administración ---------- */
    for (const n of [1, 2]) {
      const empresa = n === 1 ? E1 : E2;
      const r = await http('GET', `/api/equipos?empresa=${encodeURIComponent(empresa)}`, { as: 'sa' });
      check('super_admin', `SUPER_ADMIN ve los equipos de ${empresa}`, r.status === 200 && ids(r.body.equipos).includes(EQ[n]), st(r));
    }
    const todos = await http('GET', '/api/equipos', { as: 'sa' });
    const eqs = todos.body.equipos || [];
    check('super_admin', 'SUPER_ADMIN ve ambas empresas a la vez', eqs.some(e => e.id === EQ[1]) && eqs.some(e => e.id === EQ[2]));
    check('integridad', 'Ningún equipo fue modificado por la otra empresa', eqs.filter(e => e.id === EQ[1] || e.id === EQ[2]).every(e => e.marca === 'PRUEBA'));
    check('integridad', 'Ningún equipo "intruso" o "suplantado" quedó guardado', !eqs.some(e => String(e.id).includes('intruso') || e.equipo === 'SUPLANTADO' || e.equipo === 'INTRUSO'));
    check('integridad', 'Cada equipo de prueba conserva su empresa', eqs.find(e => e.id === EQ[1])?.empresa === E1 && eqs.find(e => e.id === EQ[2])?.empresa === E2);
    const reps = await http('GET', '/api/reportes-falla', { as: 'sa' });
    check('integridad', 'El reporte de Empresa 2 sigue existiendo y sin cambios', (reps.body.reportes || []).some(r => r.id === RF2 && r.estado === 'Reportado'));
    const pers = await http('GET', '/api/personal', { as: 'sa' });
    check('integridad', 'Ninguna hoja de vida fue modificada por la otra empresa', !(pers.body.personal || []).some(p => p.nombreCompleto === 'HACKEADO'));
    const usuariosFin = await http('GET', '/api/admin?resource=usuarios', { as: 'sa' });
    const lista = usuariosFin.body.usuarios || [];
    check('integridad', 'Los usuarios de prueba siguen siendo EMPRESA y no se creó ningún SUPER_ADMIN nuevo',
      TEST_USERS.every(t => lista.find(u => u.email === t.email)?.role === 'EMPRESA') && !lista.some(u => (u.email || '').startsWith(PREFIJO)));

    // Administración real: desactivar un usuario corta su acceso; reactivarlo lo devuelve.
    const off = await http('PATCH', `/api/admin?resource=usuarios&id=${encodeURIComponent(userIds[1])}`, { as: 'sa', body: { estado: 'inactivo' } });
    check('super_admin', 'SUPER_ADMIN desactiva al usuario de prueba 1', off.status === 200 && off.body.usuario.estado === 'inactivo', st(off));
    const tras = await http('GET', '/api/equipos', { as: 'u1' });
    check('super_admin', 'La sesión abierta del usuario desactivado deja de funcionar (401)', tras.status === 401, st(tras));
    const relog = await login('u1', TEST_USERS[0].email, testPassword);
    check('super_admin', 'El usuario desactivado no puede iniciar sesión (403)', relog.status === 403, st(relog));
    const on = await http('PATCH', `/api/admin?resource=usuarios&id=${encodeURIComponent(userIds[1])}`, { as: 'sa', body: { estado: 'activo' } });
    check('super_admin', 'SUPER_ADMIN reactiva al usuario de prueba 1', on.status === 200 && on.body.usuario.estado === 'activo', st(on));
    const relog2 = await login('u1', TEST_USERS[0].email, testPassword);
    check('super_admin', 'Reactivado, vuelve a iniciar sesión', relog2.status === 200, st(relog2));

    /* ---------- 8. Limpieza opcional ---------- */
    if (cleanup) {
      for (const n of [1, 2]) {
        await http('DELETE', '/api/equipos', { as: 'sa', body: { id: EQ[n] } });
        await http('DELETE', `/api/admin?resource=usuarios&id=${encodeURIComponent(userIds[n])}`, { as: 'sa' });
      }
      await http('DELETE', `/api/reportes-falla?id=${encodeURIComponent(RF2)}`, { as: 'sa' });
      log('Limpieza: equipos, usuarios y reporte de prueba eliminados (las hojas de vida de prueba no tienen DELETE en la API y quedan).');
    }

    for (const as of ['u1', 'u2', 'sa']) { try { await logout(as); } catch { /* ya cerrada */ } }
    const fallos = resultados.filter(r => !r.ok);
    log(`\nResultado: ${resultados.length - fallos.length}/${resultados.length} verificaciones correctas${fallos.length ? ` — ${fallos.length} FALLARON` : ''}.`);
    return { ok: fallos.length === 0, resultados, empresas: { E1, E2 }, usuarios: TEST_USERS, datos: { equipos: EQ, personal: PER, reporte: RF2 } };
  }

  /* Runner de navegador: pegar este archivo en la consola de DevTools con el Preview abierto.
     Las cookies las maneja el navegador (una sola sesión a la vez), así que cada identidad
     vuelve a iniciar sesión antes de sus peticiones. La contraseña del SUPER_ADMIN se pide con
     prompt() y nunca sale del navegador. */
  async function runInBrowser({ cleanup = false } = {}) {
    const adminUser = window.prompt('Usuario o email del SUPER_ADMIN (Preview):');
    const adminPass = window.prompt('Contraseña del SUPER_ADMIN (no se guarda):');
    const creds = {};
    let actual = null;
    const raw = async (method, path, body) => {
      const res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      let parsed = {};
      try { parsed = await res.json(); } catch { /* sin cuerpo */ }
      return { status: res.status, body: parsed };
    };
    const login = async (as, user, pass, extra = {}) => {
      creds[as] = { user, pass, extra };
      await raw('POST', '/api/login?action=logout');
      const r = await raw('POST', '/api/login', { user, pass, ...extra });
      actual = r.status === 200 ? as : null;
      return r;
    };
    const ensure = async (as) => {
      if (as === 'anon') { if (actual !== null) { await raw('POST', '/api/login?action=logout'); actual = null; } return; }
      if (actual === as || !creds[as]) return;
      const c = creds[as];
      await raw('POST', '/api/login?action=logout');
      const r = await raw('POST', '/api/login', { user: c.user, pass: c.pass });
      actual = r.status === 200 ? as : null;
    };
    const http = async (method, path, { body, as = 'anon' } = {}) => { await ensure(as); return raw(method, path, body); };
    const logout = async () => { await raw('POST', '/api/login?action=logout'); actual = null; };
    try {
      const out = await runSuite({ http, login, logout, adminUser, adminPass, cleanup });
      console.table(out.resultados.map(r => ({ ok: r.ok ? '✔' : '✘', grupo: r.grupo, prueba: r.nombre, detalle: r.detalle })));
      return out;
    } catch (err) {
      console.error(err.message);
      throw err;
    }
  }

  globalThis.cmmsIsolationSuite = { runSuite, runInBrowser, TEST_USERS, DEFAULT_TEST_PASSWORD };
})();
