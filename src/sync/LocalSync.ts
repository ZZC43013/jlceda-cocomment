import type { Comment, CommentThread } from '../types/comment';
import type { LocalData, ProjectData, SyncMode, SyncOp } from '../types/sync';
import type { User } from '../types/user';
import { generateId } from '../utils/id';
import { DEFAULT_USER_COLORS } from '../types/user';
import type { ISyncProvider } from './SyncProvider';

const STORAGE_KEY = 'cocomment_data_v1';

/**
 * 基于 eda.sys_Storage 的本地存储实现。
 *
 * 真实 API（来自 easyeda-api skill references/classes/SYS_Storage.md）:
 *   - getExtensionUserConfig(key): any | undefined  （同步）
 *   - setExtensionUserConfig(key, value): Promise<boolean>  （异步）
 *
 * 注意：sys_Storage 仅扩展主进程可调，iframe 内调用会 throw。
 * 因此所有持久化都由 parent（扩展主进程）的 LocalSync 完成，
 * iframe 通过 sys_MessageBus 通知 parent 做写操作。
 */
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
		try {
			const raw = eda.sys_Storage.getExtensionUserConfig(STORAGE_KEY);
			if (raw) {
				return typeof raw === 'string' ? (JSON.parse(raw) as LocalData) : (raw as LocalData);
			}
		}
		catch (e) {
			console.warn('[CoComment] sys_Storage.getExtensionUserConfig failed:', e);
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
		try {
			void eda.sys_Storage.setExtensionUserConfig(STORAGE_KEY, this.data);
		}
		catch (e) {
			console.warn('[CoComment] sys_Storage.setExtensionUserConfig failed:', e);
		}
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
