import type { CommentThread, ThreadAnchor, ThreadStatus, PageType, RelatedPrimitive, Comment } from '../types/comment';
import type { ProjectData, SyncMode } from '../types/sync';
import type { ISyncProvider } from '../sync/SyncProvider';
import { LocalSync } from '../sync/LocalSync';
import { ThreadManager, type ThreadFilter } from './ThreadManager';
import { CommentManager } from './CommentManager';
import type { User } from '../types/user';

export class CommentEngine {
	private sync!: ISyncProvider;
	private threadMgr!: ThreadManager;
	private commentMgr!: CommentManager;
	private initialized = false;

	async init(syncMode: SyncMode = 'local'): Promise<void> {
		if (this.initialized) {
			return;
		}

		this.sync = this.createSyncProvider(syncMode);
		this.threadMgr = new ThreadManager(this.sync);
		this.commentMgr = new CommentManager(this.sync);

		await this.threadMgr.init();
		await this.commentMgr.init();

		// 双向注入：ThreadManager 创建 thread 后需要 CommentManager 加首条评论
		this.threadMgr.setCommentManager(this.commentMgr);

		this.initialized = true;
	}

	private createSyncProvider(mode: SyncMode): ISyncProvider {
		switch (mode) {
			case 'local':
			default:
				return new LocalSync();
		}
	}

	destroy(): void {
		this.initialized = false;
	}

	getSyncProvider(): ISyncProvider {
		return this.sync;
	}

	getThreadManager(): ThreadManager {
		return this.threadMgr;
	}

	getCommentManager(): CommentManager {
		return this.commentMgr;
	}

	setProjectContext(projectId: string, pageId: string, pageType: PageType): void {
		this.threadMgr.setProjectContext(projectId, pageId, pageType);
	}

	getCurrentUser(): User {
		return this.threadMgr.getCurrentUser();
	}

	async setCurrentUser(user: User): Promise<void> {
		await this.sync.setCurrentUser(user);
		// 热更新两个 manager 的 currentUser 副本，不重新走 init()
		this.threadMgr.refreshUser(user);
		this.commentMgr.refreshUser(user);
	}

	async createThread(
		anchor: ThreadAnchor,
		firstComment: string,
		relatedPrimitives: RelatedPrimitive[] = [],
	): Promise<CommentThread> {
		return this.threadMgr.createThread(anchor, firstComment, relatedPrimitives);
	}

	async getThreads(filter?: ThreadFilter): Promise<CommentThread[]> {
		return this.threadMgr.getThreads(filter);
	}

	async getThread(threadId: string): Promise<CommentThread | null> {
		return this.threadMgr.getThread(threadId);
	}

	async updateThread(threadId: string, patch: Partial<CommentThread>): Promise<void> {
		await this.threadMgr.updateThread(threadId, patch);
	}

	async deleteThread(threadId: string): Promise<void> {
		await this.threadMgr.deleteThread(threadId);
	}

	async resolveThread(threadId: string): Promise<void> {
		await this.threadMgr.resolveThread(threadId);
	}

	async reopenThread(threadId: string): Promise<void> {
		await this.threadMgr.reopenThread(threadId);
	}

	async addComment(threadId: string, content: string): Promise<Comment> {
		return this.commentMgr.addComment(threadId, content);
	}

	async getComments(threadId: string): Promise<Comment[]> {
		return this.commentMgr.getComments(threadId);
	}

	async updateComment(commentId: string, content: string): Promise<void> {
		await this.commentMgr.updateComment(commentId, content);
	}

	async deleteComment(commentId: string): Promise<void> {
		await this.commentMgr.deleteComment(commentId);
	}

	onThreadChange(callback: () => void): () => void {
		return this.threadMgr.onThreadChange(callback);
	}

	onCommentChange(callback: () => void): () => void {
		return this.commentMgr.onCommentChange(callback);
	}

	async exportProject(): Promise<ProjectData> {
		return this.sync.exportProject(this.threadMgr.getProjectId());
	}

	async importProject(data: ProjectData): Promise<void> {
		await this.sync.importProject(this.threadMgr.getProjectId(), data);
	}
}
