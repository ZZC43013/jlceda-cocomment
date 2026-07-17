import type { Comment, CommentThread } from '../types/comment';
import type { LocalData, ProjectData, SyncMode, SyncOp } from '../types/sync';
import type { User } from '../types/user';
import { generateId } from '../utils/id';
import { DEFAULT_USER_COLORS } from '../types/user';
import type { ISyncProvider } from './SyncProvider';

const STORAGE_KEY = 'cocomment_data_v1';

/**
 * 浏览器原生 localStorage 访问器。
 *
 * 说明：扩展运行在嘉立创EDA的浏览器/Electron 沙箱内，类型定义文件
 * `@jlceda/pro-api-types/index.d.ts` 中并未收录 `eda.sys_Storage` 这类
 * 键值存储 API（仅有 `sys_FileManager` 工程文件、`sys_FileSystem` 文件
 * 读写、`sys_Unit` 单位三类 SYS_ 接口）。因此本地阶段直接使用浏览器
 * 原生 localStorage，避免依赖未公开 API。
 *
 * 阶段 2 上云后会切换到 RestSync，不再使用本类。
 */
function storageGet(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	}
	catch (e) {
		// 隐私模式或跨域受限时 localStorage 可能抛错
		console.warn('[CoComment] localStorage.getItem failed:', e);
		return null;
	}
}

function storageSet(key: string, value: string): void {
	try {
		window.localStorage.setItem(key, value);
	}
	catch (e) {
		console.warn('[CoComment] localStorage.setItem failed:', e);
	}
}

export class LocalSync implements ISyncProvider {
	private data: LocalData;
	private threadChangeCallbacks: Array<(op: SyncOp) => void> = [];
	private commentChangeCallbacks: Array<(op: SyncOp) => void> = [];

	constructor() {
		this.data = this.loadFromStorage();
	}

	getMode(): SyncMode {
		return 'local';
	}

	private loadFromStorage(): LocalData {
		const raw = storageGet(STORAGE_KEY);
		if (raw) {
			try {
				return JSON.parse(raw) as LocalData;
			}
			catch (e) {
				console.warn('[CoComment] Stored data corrupted, resetting:', e);
			}
		}
		return this.createEmptyData();
	}

	private createEmptyData(): LocalData {
		const user: User = {
			id: generateId(),
			name: '我',
			color: DEFAULT_USER_COLORS[Math.floor(Math.random() * DEFAULT_USER_COLORS.length)],
		};
		return {
			schemaVersion: 1,
			currentUser: user,
			projects: {},
		};
	}

	private saveToStorage(): void {
		storageSet(STORAGE_KEY, JSON.stringify(this.data));
	}

	private ensureProject(projectId: string): ProjectData {
		if (!this.data.projects[projectId]) {
			this.data.projects[projectId] = {
				threads: [],
				comments: {},
			};
		}
		return this.data.projects[projectId];
	}

	private emitThreadChange(op: SyncOp): void {
		for (const cb of this.threadChangeCallbacks) {
			cb(op);
		}
	}

	private emitCommentChange(op: SyncOp): void {
		for (const cb of this.commentChangeCallbacks) {
			cb(op);
		}
	}

	async getThreads(projectId: string): Promise<CommentThread[]> {
		const project = this.ensureProject(projectId);
		return [...project.threads];
	}

	async createThread(thread: CommentThread): Promise<void> {
		const project = this.ensureProject(thread.projectId);
		project.threads.push(thread);
		project.comments[thread.id] = [];
		this.saveToStorage();
		this.emitThreadChange({
			id: generateId(),
			type: 'thread:create',
			entityId: thread.id,
			data: thread,
			userId: this.data.currentUser.id,
			timestamp: Date.now(),
			version: thread.version,
		});
	}

	async updateThread(threadId: string, patch: Partial<CommentThread>): Promise<void> {
		for (const [projectId, project] of Object.entries(this.data.projects)) {
			const idx = project.threads.findIndex(t => t.id === threadId);
			if (idx >= 0) {
				project.threads[idx] = {
					...project.threads[idx],
					...patch,
					version: project.threads[idx].version + 1,
					updatedAt: Date.now(),
				};
				this.saveToStorage();
				this.emitThreadChange({
					id: generateId(),
					type: 'thread:update',
					entityId: threadId,
					data: patch,
					userId: this.data.currentUser.id,
					timestamp: Date.now(),
					version: project.threads[idx].version,
				});
				return;
			}
			void projectId;
		}
	}

	async deleteThread(threadId: string): Promise<void> {
		for (const [, project] of Object.entries(this.data.projects)) {
			const idx = project.threads.findIndex(t => t.id === threadId);
			if (idx >= 0) {
				project.threads.splice(idx, 1);
				delete project.comments[threadId];
				this.saveToStorage();
				this.emitThreadChange({
					id: generateId(),
					type: 'thread:delete',
					entityId: threadId,
					data: null,
					userId: this.data.currentUser.id,
					timestamp: Date.now(),
					version: 0,
				});
				return;
			}
		}
	}

	async getComments(threadId: string): Promise<Comment[]> {
		for (const [, project] of Object.entries(this.data.projects)) {
			if (project.comments[threadId]) {
				return [...project.comments[threadId]];
			}
		}
		return [];
	}

	async createComment(comment: Comment): Promise<void> {
		for (const [, project] of Object.entries(this.data.projects)) {
			if (project.comments[comment.threadId]) {
				project.comments[comment.threadId].push(comment);
				this.saveToStorage();
				this.emitCommentChange({
					id: generateId(),
					type: 'comment:create',
					entityId: comment.id,
					data: comment,
					userId: this.data.currentUser.id,
					timestamp: Date.now(),
					version: 0,
				});
				return;
			}
		}
	}

	async updateComment(commentId: string, patch: Partial<Comment>): Promise<void> {
		for (const [, project] of Object.entries(this.data.projects)) {
			for (const threadId of Object.keys(project.comments)) {
				const idx = project.comments[threadId].findIndex(c => c.id === commentId);
				if (idx >= 0) {
					project.comments[threadId][idx] = {
						...project.comments[threadId][idx],
						...patch,
						updatedAt: Date.now(),
					};
					this.saveToStorage();
					this.emitCommentChange({
						id: generateId(),
						type: 'comment:update',
						entityId: commentId,
						data: patch,
						userId: this.data.currentUser.id,
						timestamp: Date.now(),
						version: 0,
					});
					return;
				}
			}
		}
	}

	async deleteComment(commentId: string): Promise<void> {
		for (const [, project] of Object.entries(this.data.projects)) {
			for (const threadId of Object.keys(project.comments)) {
				const idx = project.comments[threadId].findIndex(c => c.id === commentId);
				if (idx >= 0) {
					project.comments[threadId].splice(idx, 1);
					this.saveToStorage();
					this.emitCommentChange({
						id: generateId(),
						type: 'comment:delete',
						entityId: commentId,
						data: null,
						userId: this.data.currentUser.id,
						timestamp: Date.now(),
						version: 0,
					});
					return;
				}
			}
		}
	}

	onThreadChange(callback: (op: SyncOp) => void): () => void {
		this.threadChangeCallbacks.push(callback);
		return () => {
			const idx = this.threadChangeCallbacks.indexOf(callback);
			if (idx >= 0) {
				this.threadChangeCallbacks.splice(idx, 1);
			}
		};
	}

	onCommentChange(callback: (op: SyncOp) => void): () => void {
		this.commentChangeCallbacks.push(callback);
		return () => {
			const idx = this.commentChangeCallbacks.indexOf(callback);
			if (idx >= 0) {
				this.commentChangeCallbacks.splice(idx, 1);
			}
		};
	}

	async getCurrentUser(): Promise<User> {
		return { ...this.data.currentUser };
	}

	async setCurrentUser(user: User): Promise<void> {
		this.data.currentUser = { ...user };
		this.saveToStorage();
	}

	async exportProject(projectId: string): Promise<ProjectData> {
		const project = this.ensureProject(projectId);
		return JSON.parse(JSON.stringify(project));
	}

	async importProject(projectId: string, data: ProjectData): Promise<void> {
		this.data.projects[projectId] = JSON.parse(JSON.stringify(data));
		this.saveToStorage();
	}

	async getAllData(): Promise<LocalData> {
		return JSON.parse(JSON.stringify(this.data));
	}
}
