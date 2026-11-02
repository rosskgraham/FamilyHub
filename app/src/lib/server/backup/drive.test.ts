import { describe, expect, it } from 'vitest';
import type { GoogleRequest, RawBody } from '../google/auth.ts';
import { backupFolder, beyond, FOLDER_NAME, multipart } from './drive.ts';

/** A Google Drive that answers from `answers`, in order, and records what it was asked. */
function fakeDrive(answers: unknown[]) {
	const calls: { method: string; url: string; body?: unknown }[] = [];
	const request = (async (method: string, url: string, body?: unknown) => {
		calls.push({ method, url, body });
		return answers.shift();
	}) as GoogleRequest;
	return { request, calls };
}

const bytes = new Uint8Array([0x53, 0x51, 0x4c, 0x00]);

describe('backupFolder', () => {
	it('uploads into its own folder, creating the folder the first time', async () => {
		const drive = fakeDrive([{ files: [] }, { id: 'folder-1' }, { id: 'file-1' }]);
		await backupFolder(drive.request).upload('chores-2026-11-02-0200.db', bytes);
		const [find, create, upload] = drive.calls;
		expect(find!.method).toBe('GET');
		expect(new URL(find!.url).searchParams.get('q')).toContain(`name = '${FOLDER_NAME}'`);
		expect(create).toMatchObject({
			method: 'POST',
			body: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }
		});
		expect(upload!.url).toContain('uploadType=multipart');
		const text = Buffer.from((upload!.body as RawBody).data).toString('latin1');
		expect(text).toContain('"name":"chores-2026-11-02-0200.db","parents":["folder-1"]');
		expect(text).toContain('SQL\0');
	});

	it('uses the folder that’s already there, and looks it up only once', async () => {
		const drive = fakeDrive([{ files: [{ id: 'folder-1', name: FOLDER_NAME }] }, { files: [] }, {}]);
		const folder = backupFolder(drive.request);
		await folder.list();
		await folder.upload('chores-2026-11-02-0200.db', bytes);
		expect(drive.calls.map((c) => c.method)).toEqual(['GET', 'GET', 'POST']);
		expect(new URL(drive.calls[1]!.url).searchParams.get('q')).toBe("'folder-1' in parents and trashed = false");
	});

	it('deletes a backup by its id', async () => {
		const drive = fakeDrive([undefined]);
		await backupFolder(drive.request).remove('file/1');
		expect(drive.calls).toEqual([
			{ method: 'DELETE', url: 'https://www.googleapis.com/drive/v3/files/file%2F1', body: undefined }
		]);
	});
});

describe('multipart', () => {
	it('puts the details, then the file, between the boundaries Drive expects', () => {
		const body = multipart('{"name":"x"}', bytes);
		const boundary = body.contentType.match(/^multipart\/related; boundary=(.+)$/)![1]!;
		const text = Buffer.from(body.data).toString('latin1');
		expect(text).toBe(
			`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"x"}\r\n` +
				`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\nSQL\0\r\n--${boundary}--`
		);
	});
});

describe('beyond', () => {
	it('picks all but the newest backups to delete', () => {
		const files = ['2026-11-01', '2026-11-03', '2026-10-30', '2026-11-02'].map((d) => ({
			id: d,
			name: `chores-${d}-0200.db`
		}));
		expect(beyond(files, 2).map((f) => f.id)).toEqual(['2026-11-01', '2026-10-30']);
		expect(beyond(files, 14)).toEqual([]);
	});
});
