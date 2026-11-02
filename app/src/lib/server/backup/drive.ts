// The Chores backups in the Household's Google Drive, in a folder of their own. The Hub only has the `drive.file`
// permission, so it sees only what it created itself, and nothing else in the Drive.
import type { GoogleRequest, RawBody } from '../google/auth.ts';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
export const FOLDER_NAME = 'FamilyHub backups';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';

export interface DriveFile {
	id: string;
	name: string;
}

export interface BackupFolder {
	/** Uploads a backup, named for example "chores-2026-11-02-0200.db". */
	upload(name: string, data: Uint8Array<ArrayBuffer>): Promise<void>;
	/** Every backup in the folder. */
	list(): Promise<DriveFile[]>;
	remove(id: string): Promise<void>;
}

/** The backups folder, created the first time it's needed. */
export function backupFolder(request: GoogleRequest): BackupFolder {
	let folderId: string | undefined;

	async function folder(): Promise<string> {
		if (folderId) return folderId;
		const q = `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_TYPE}' and trashed = false`;
		const found = await request<{ files: DriveFile[] }>(
			'GET',
			`${API}?${new URLSearchParams({ q, fields: 'files(id,name)' })}`
		);
		folderId =
			found.files[0]?.id ?? (await request<DriveFile>('POST', API, { name: FOLDER_NAME, mimeType: FOLDER_TYPE })).id;
		return folderId;
	}

	return {
		async upload(name, data) {
			const metadata = JSON.stringify({ name, parents: [await folder()], mimeType: 'application/vnd.sqlite3' });
			await request('POST', UPLOAD, multipart(metadata, data));
		},
		async list() {
			const q = `'${await folder()}' in parents and trashed = false`;
			const params = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '1000' });
			return (await request<{ files: DriveFile[] }>('GET', `${API}?${params}`)).files;
		},
		async remove(id) {
			await request('DELETE', `${API}/${encodeURIComponent(id)}`);
		}
	};
}

/** A file and its details in one request, as Drive's multipart upload takes them. */
export function multipart(metadata: string, data: Uint8Array<ArrayBuffer>): RawBody {
	const boundary = `familyhub-${crypto.randomUUID()}`;
	const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
	const tail = `\r\n--${boundary}--`;
	return {
		contentType: `multipart/related; boundary=${boundary}`,
		data: new Uint8Array(Buffer.concat([Buffer.from(head), data, Buffer.from(tail)]))
	};
}

/** The backups to delete so only the newest `keep` are left. Names sort by date, oldest first. */
export function beyond(files: DriveFile[], keep: number): DriveFile[] {
	return [...files].sort((a, b) => b.name.localeCompare(a.name)).slice(keep);
}
