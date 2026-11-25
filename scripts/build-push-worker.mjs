import {build} from 'esbuild';
await build({entryPoints:['src/lib/push-notice.ts'],outfile:'supabase/functions/lesson-push/engine.mjs',bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['zod'],minify:true,banner:{js:'// Generated from src/lib/push-notice.ts and the shared academic engine. Run npm run build:push.'}});
