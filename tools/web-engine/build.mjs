import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, 'entry.ts')],
  bundle: true, minify: true, format: 'iife', globalName: 'VoiceCalcEngine', target: 'es2019',
  outfile: path.join(here, '../../Website/js/engine.js'),
  alias: {
    '@react-native-async-storage/async-storage': path.join(here, 'stubs/async-storage.ts'),
    'react-native': path.join(here, 'stubs/react-native.ts'),
    'expo-speech-recognition': path.join(here, 'stubs/unavailable.ts'),
    'expo-speech': path.join(here, 'stubs/unavailable.ts'),
    'expo-clipboard': path.join(here, 'stubs/unavailable.ts'),
    'expo-haptics': path.join(here, 'stubs/unavailable.ts'),
    'expo-audio': path.join(here, 'stubs/unavailable.ts'),
  },
  banner: { js: '/* VoiceCalc AI — real on-device calculation engine, built from the app source (tools/web-engine). */' },
  logLevel: 'info',
});
