/** Merge NODE_OPTIONS with a larger V8 heap for heavy Vite production builds. */
export function viteNodeEnv(extra = {}) {
    const heapFlag = '--max-old-space-size=8192';
    const base = process.env.NODE_OPTIONS ?? '';
    const nodeOptions = base.includes('max-old-space-size') ? base : `${base} ${heapFlag}`.trim();
    return { ...process.env, ...extra, NODE_OPTIONS: nodeOptions };
}
