import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export class PdfAnnotationConflictError extends Error {
  constructor(message = 'PDF annotations changed on disk. Keep your draft and reload/merge before saving.') {
    super(message); this.name = 'PdfAnnotationConflictError';
  }
}

export function pdfAnnotationRevision(paths: readonly string[]): string {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path); hash.update('\0');
    hash.update(existsSync(path) ? readFileSync(path) : '<absent>'); hash.update('\0');
  }
  return hash.digest('hex');
}

/** Cooperating Node/Bun writers share a short-lived OS-directory lock.
 * It lives outside source folders/Syncthing. A dead owner's lock is recoverable;
 * uncertain or live ownership fails closed, never waits inside the event loop.
 */
export function withPdfAnnotationLock<T>(sourceDirectory: string, action: () => T): T {
  const root = join(tmpdir(), `plannotator-pdf-locks-${process.getuid?.() ?? 'user'}`);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('Unsafe PDF annotation lock directory');
  }
  const dir = join(root, createHash('sha256').update(realpathSync(sourceDirectory)).digest('hex'));
  const owner = join(dir, 'owner');
  const recovery = `${dir}.recovery`;
  if (existsSync(recovery)) throw new PdfAnnotationConflictError('Annotation lock recovery is active; retain the draft and retry.');
  try { mkdirSync(dir, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const locked = lstatSync(dir);
    if (locked.isSymbolicLink() || !locked.isDirectory()) throw new Error('Unsafe PDF annotation lock');
    let dead = false;
    const observedOwner = existsSync(owner) ? readFileSync(owner, 'utf8') : undefined;
    if (observedOwner !== undefined) {
      const pid = Number(observedOwner);
      if (Number.isSafeInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); }
        catch (check) { dead = (check as NodeJS.ErrnoException).code === 'ESRCH'; }
      }
    } else { dead = Date.now() - locked.mtimeMs > 30_000; }
    if (!dead) throw new PdfAnnotationConflictError('Another PDF annotation save is active. Keep your draft and retry.');
    // Elect one reaper, then recheck the exact old inode. A second process must
    // not remove a newly acquired live owner's lock after a stale observation.
    try { mkdirSync(recovery, { mode: 0o700 }); }
    catch { throw new PdfAnnotationConflictError('Annotation lock recovery is active; retry.'); }
    try {
      const current = lstatSync(dir);
      const currentOwner = existsSync(owner) ? readFileSync(owner, 'utf8') : undefined;
      if (current.ino !== locked.ino || current.mtimeMs !== locked.mtimeMs || currentOwner !== observedOwner) throw new PdfAnnotationConflictError();
      if (existsSync(owner)) unlinkSync(owner);
      rmdirSync(dir); mkdirSync(dir, { mode: 0o700 });
    } catch { throw new PdfAnnotationConflictError('Annotation lock changed; retry the save.'); }
    finally { rmdirSync(recovery); }
  }
  writeFileSync(owner, String(process.pid), { mode: 0o600, flag: 'wx' });
  try { return action(); }
  finally { unlinkSync(owner); rmdirSync(dir); }
}
