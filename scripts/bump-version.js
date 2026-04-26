import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionPath = path.join(__dirname, '../frontend/version.json');

try {
    let data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    let parts = data.version.split('.');
    
    // Increment the last part of the version
    parts[parts.length - 1] = parseInt(parts[parts.length - 1]) + 1;
    data.version = parts.join('.');

    fs.writeFileSync(versionPath, JSON.stringify(data, null, 2));
    console.log(`[Version Bump] Successfully updated to v.${data.version}`);
} catch (error) {
    console.error('Failed to bump version:', error);
    process.exit(1);
}
