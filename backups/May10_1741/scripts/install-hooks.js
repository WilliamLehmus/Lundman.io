import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = path.join(root, '.git-hooks', 'pre-commit');
const target = path.join(root, '.git', 'hooks', 'pre-commit');

try {
    if (!fs.existsSync(path.join(root, '.git'))) {
        console.error('Error: .git directory not found. Are you in the project root?');
        process.exit(1);
    }

    fs.copyFileSync(source, target);
    
    // On Unix-like systems, we need to make the hook executable
    if (process.platform !== 'win32') {
        import('child_process').then(({ execSync }) => {
            execSync(`chmod +x "${target}"`);
        });
    }

    console.log('[Hooks] Successfully installed pre-commit hook to .git/hooks/');
} catch (error) {
    console.error('[Hooks] Failed to install hook:', error.message);
}
