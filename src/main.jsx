import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Blindaje contra "NotFoundError: Failed to execute 'removeChild' on 'Node'"
// (pantalla en blanco tras el login). React asume que sigue siendo el único
// dueño del árbol del DOM que renderiza; si una extensión del navegador
// (gestor de contraseñas, traductor, Grammarly, etc.) reordena o envuelve
// nodos que React creó —algo muy probable justo en un formulario de login
// con inputs de usuario/contraseña—, React intenta luego eliminar/insertar
// un nodo que ya no está donde lo dejó, el navegador lanza NotFoundError, y
// como esto ocurre en la fase de commit del DOM (no en el render), ningún
// Error Boundary de React lo atrapa: la raíz entera se desmonta y queda en
// blanco. El parche hace que removeChild/insertBefore sean tolerantes a esa
// mutación externa en vez de lanzar. Ver https://github.com/facebook/react/issues/11538
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      if (import.meta.env.DEV) {
        console.warn('[removeChild guard] nodo ya no era hijo de su padre esperado (probable mutación externa del DOM); se ignora.', child);
      }
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (import.meta.env.DEV) {
        console.warn('[insertBefore guard] nodo de referencia ya no era hijo de su padre esperado (probable mutación externa del DOM); se agrega al final.', referenceNode);
      }
      return this.appendChild(newNode);
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
}

const root = createRoot(document.getElementById('root'), {
  // Red de seguridad de observabilidad (no de recuperación): un error que ocurra durante
  // la fase de "commit" del DOM (como el NotFoundError de arriba, si algún día escapara
  // al guard) no pasa por render ni por ningún Error Boundary — React simplemente
  // desmonta la raíz. Antes eso quedaba en la consola como un mensaje genérico de React
  // difícil de rastrear; con esto queda registrado explícitamente y con su stack, para
  // diagnosticar sin depender de que alguien reproduzca el problema a mano.
  onUncaughtError: (error, errorInfo) => {
    console.error('[root] Error no capturado por ningún Error Boundary:', error, errorInfo?.componentStack);
  },
});

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
