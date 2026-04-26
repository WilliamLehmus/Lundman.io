import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionPath = path.join(__dirname, '../frontend/version.json');

try {
    // Get the total number of commits in the current branch
    const commitCount = execSync('git rev-list --count HEAD').toString().trim();
    
    // We use the commit count + 1 for the upcoming commit
    const newVersion = `0.0.0.${parseInt(commitCount) + 1}`;
    
    const data = { version: newVersion };
    fs.writeFileSync(versionPath, JSON.stringify(data, null, 2));
    
    console.log(`[Version Bump] Successfully updated to v.${newVersion} (Commits: ${commitCount})`);
} catch (error) {
    console.error('Failed to bump version using git:', error.message);
    // Fallback to manual bump if git fails (e.g. in some CI environments)
    try {
        let data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        let parts = data.version.split('.');
        parts[parts.length - 1] = parseInt(parts[parts.length - 1]) + 1;
        data.version = parts.join('.');
        fs.writeFileSync(versionPath, JSON.stringify(data, null, 2));
        console.log(`[Version Bump] Fallback manual update to v.${data.version}`);
    } catch (e) {
        console.error('Critical failure in bump-version script');
    }
}
