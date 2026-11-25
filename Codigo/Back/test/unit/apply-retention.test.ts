import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyRetention } from '../../src/infrastructure/backup/apply-retention';
import * as r2 from '../../src/infrastructure/backup/upload-to-r2';

describe('applyRetention (unit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('borra backups mas viejos que el limite de retencion', async () => {
    const day = 24 * 60 * 60 * 1000;
    const oldDate = new Date(Date.now() - 60 * day).toISOString().slice(0, 10);
    const recentDate = new Date(Date.now() - 2 * day).toISOString().slice(0, 10);
    vi.spyOn(r2, 'listBackups').mockResolvedValue([
      `backup-${oldDate}.bin`,
      `backup-${recentDate}.bin`,
    ]);
    const deleteSpy = vi.spyOn(r2, 'deleteBackup').mockResolvedValue(undefined);

    const result = await applyRetention(30);

    expect(result.deleted).toContain(`backup-${oldDate}.bin`);
    expect(result.kept).toContain(`backup-${recentDate}.bin`);
    expect(deleteSpy).toHaveBeenCalledWith(`backup-${oldDate}.bin`);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('no borra archivos con nombre desconocido', async () => {
    vi.spyOn(r2, 'listBackups').mockResolvedValue(['archivo-raro.txt']);
    const deleteSpy = vi.spyOn(r2, 'deleteBackup').mockResolvedValue(undefined);

    const result = await applyRetention(30);

    expect(result.kept).toContain('archivo-raro.txt');
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});