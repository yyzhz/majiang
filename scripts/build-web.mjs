// 将根目录的静态站点同步到 Capacitor 的 webDir（www/）
// 只拷贝运行所需文件，避免把 node_modules、android 工程等一起打进 APK。
import { rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(join(root, 'index.html'), join(out, 'index.html'));
cpSync(join(root, 'css'), join(out, 'css'), { recursive: true });
cpSync(join(root, 'js'), join(out, 'js'), { recursive: true });

console.log('[web] www/ 已生成（index.html + css/ + js/）');
