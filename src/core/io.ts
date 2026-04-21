import { randomUUID } from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'node:path';

export async function writeFileAtomic(targetPath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(targetPath));

  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${randomUUID()}.tmp`,
  );

  try {
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.move(tempPath, targetPath, { overwrite: true });
  } finally {
    if (await fs.pathExists(tempPath)) {
      await fs.remove(tempPath);
    }
  }
}

export async function writeJsonAtomic(targetPath: string, value: unknown): Promise<void> {
  await writeFileAtomic(targetPath, JSON.stringify(value, null, 2));
}
