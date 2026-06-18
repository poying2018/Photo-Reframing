const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const args = process.argv.slice(2);
const includeModels = args.includes('--include-models');
const unpackedOnly = args.includes('--dir');
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, includeModels ? 'release-full' : 'release');
const shouldBuildWindowsFullArchive = includeModels && process.platform === 'win32' && !unpackedOnly;

function run(command, commandArgs, extraEnv = {}, cwd = rootDir) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function cleanOutputDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function archiveWindowsUnpacked() {
  const sevenZip = path.join(rootDir, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  const unpackedDir = path.join(outputDir, 'win-unpacked');
  const archiveName = `photo-reframing-${packageJson.version}-win-unpacked.7z`;
  const archivePath = path.join(outputDir, archiveName);

  if (!fs.existsSync(unpackedDir)) {
    throw new Error(`未找到待归档目录: ${unpackedDir}`);
  }

  run(sevenZip, ['a', '-bd', '-mx=1', '-mtc=off', '-mtm=off', '-mta=off', archivePath, '.'], {}, unpackedDir);
}

cleanOutputDir(outputDir);
run('npm', ['run', 'build']);

const builderArgs = ['electron-builder', '--config', 'electron-builder.config.cjs'];
if (unpackedOnly || shouldBuildWindowsFullArchive) {
  builderArgs.push('--dir');
}

run('npx', builderArgs, {
  BUILD_OUTPUT_DIR: outputDir,
  INCLUDE_MODELS: includeModels ? 'true' : 'false',
});

if (shouldBuildWindowsFullArchive) {
  archiveWindowsUnpacked();
}
