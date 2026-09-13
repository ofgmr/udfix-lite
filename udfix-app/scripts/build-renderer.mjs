#!/usr/bin/env node
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { viteNodeEnv } from './vite-node-env.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit', env: viteNodeEnv() });
