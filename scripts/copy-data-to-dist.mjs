import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('data');
const destination = resolve('dist', 'data');

// public/data is a local junction and Git cannot preserve it on Cloudflare's
// Linux build host. Always materialize the canonical data directory in dist.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

console.log(`Copied exam data to ${destination}`);
