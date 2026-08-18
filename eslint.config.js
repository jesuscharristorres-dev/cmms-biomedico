import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // `_ignored` es el patrón usado en el repo para desestructurar y descartar
      // explícitamente una clave (p.ej. `const { id: _ignored, ...resto } = patch`) —
      // sin esto, no-unused-vars marca como error algo que es intencional.
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  {
    // api/ y lib/ corren en funciones serverless de Vercel (Node), no en el navegador —
    // usaban los globals de browser por defecto y eso marcaba `process`/`Buffer` como
    // no definidos aunque el código es correcto.
    files: ['api/**/*.js', 'lib/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
