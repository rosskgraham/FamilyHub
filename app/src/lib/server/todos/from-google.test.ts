import { describe, expect, it } from 'vitest';
import type { GoogleTask } from '../tasks/google.ts';
import { toTodos } from './from-google.ts';

const NOW = new Date('2026-11-07T10:00:00Z');
const task = (id: string, fields: Partial<GoogleTask> = {}): GoogleTask => ({
	id,
	title: id,
	status: 'needsAction',
	position: '0',
	...fields
});

describe('toTodos', () => {
	it('reads each task’s due date, which Google sends as midnight UTC', () => {
		expect(toTodos([task('Enter meter readings', { due: '2026-12-01T00:00:00.000Z' })], NOW)).toEqual([
			{ id: 'Enter meter readings', text: 'Enter meter readings', due: '2026-12-01', tickedOff: false }
		]);
	});

	it('gives a task without a due date none', () => {
		expect(toTodos([task('Clean the oven')], NOW)[0]!.due).toBeNull();
	});

	it('puts To-dos in order of when they’re due, undated last, then in the list’s order', () => {
		const tasks = [
			task('Undated', { position: '0' }),
			task('Later', { due: '2026-11-20T00:00:00.000Z', position: '1' }),
			task('Sooner b', { due: '2026-11-08T00:00:00.000Z', position: '3' }),
			task('Sooner a', { due: '2026-11-08T00:00:00.000Z', position: '2' })
		];
		expect(toTodos(tasks, NOW).map((t) => t.text)).toEqual(['Sooner a', 'Sooner b', 'Later', 'Undated']);
	});

	it('keeps To-dos ticked off in the last 10 minutes, hidden on a phone or not, and drops older ones', () => {
		const tasks = [
			task('Just now', { status: 'completed', completed: '2026-11-07T09:55:00.000Z' }),
			task('On a phone', { status: 'completed', completed: '2026-11-07T09:58:00.000Z', hidden: true }),
			task('This morning', { status: 'completed', completed: '2026-11-07T08:00:00.000Z' })
		];
		expect(toTodos(tasks, NOW).map((t) => [t.text, t.tickedOff])).toEqual([
			['Just now', true],
			['On a phone', true]
		]);
	});

	it('leaves out deleted tasks, subtasks and blank titles', () => {
		const tasks = [task('Deleted', { deleted: true }), task('Sub', { parent: 'x' }), task('Blank', { title: '  ' })];
		expect(toTodos(tasks, NOW)).toEqual([]);
	});
});
