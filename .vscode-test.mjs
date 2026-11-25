import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out-test/test/integration/**/*.test.js',
    workspaceFolder: './samples',
    mocha: {
        ui: 'tdd',
        timeout: 20000,
    },
});
