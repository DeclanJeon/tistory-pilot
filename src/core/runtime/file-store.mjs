import fs from 'node:fs/promises';

export async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeJsonFileAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
  return filePath;
}

export async function appendJsonLine(filePath, value) {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
  return filePath;
}
