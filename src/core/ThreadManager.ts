import type { CommentThread, ThreadStatus, ThreadAnchor, PageType, RelatedPrimitive } from '../types/comment';
import { generateId } from '../utils/id';
import type { ISyncProvider } from '../sync/SyncProvider';
import type { User } from '../types/user';
import type { CommentManager } from './CommentManager';

export interface ThreadFilter {
	pageId?: string;
	pageType?: PageType;
	status?: ThreadStatus;
}

export class ThreadManager {
	private sync: ISyncProvider;
	private currentUser!: User;
	private commentMgr: CommentManager | null = null;
	private projectId: string = 'default';
	private pageId: string = 'default';
	private pageType: PageType = 'pcb';

	constructor(sync: ISyncProvider) {
		this.sync = sync;
	}

	async init(): Promise<void> {
		this.currentUser = await this.sync.getCurrentUser();
	}

	/**
	 * 刷新当前用户（用户改名/改色后调用）。
	 * 与 init() 区分：init 是首次冷启动加载，refreshUser 是热更新。
	 */
	refreshUser(user: User): void {
		this.currentUser = { ...user };
	}

	/**
	 * 由 CommentEngine 在初始化时注入 CommentManager 引用，
	 * 避免 createThread 时动态 new 一个未 init 的实例导致 currentUser 缺失。
	 */
	setCommentManager(cm: CommentManager): void {
		this.commentMgr = cm;
	}

	setProjectContext(projectId: string, pageId: string, pageType: PageType): void {
		this.projectId = projectId;
		this.pageId = pageId;
		this.pageType = pageType;
	}

	getProjectId(): string {
		return this.projectId;
	}

	getPageId(): string {
		return this.pageId;
	}

	getPageType(): PageType {
		return this.pageType;
	}

	getCurrentUser(): User {
		return this.currentUser;
	}

	async createThread(
		anchor: ThreadAnchor,
		firstComment: string,
		relatedPrimitives: RelatedPrimitive[] = [],
	): Promise<CommentThread> {
		const now = Date.now();
		const thread: CommentThread = {
			id: generateId(),
			projectId: this.projectId,
			pageId: this.pageId,
			pageType: this.pageType,
			anchor,
			relatedPrimitives,
			status: 'open',
			createdBy: this.currentUser.id,
			createdAt: now,
			updatedAt: now,
			version: 1,
		};
		await this.sync.createThread(thread);

		// 用引擎持有的 CommentManager（已 init），而非每次动态 new
		if (firstComment.trim() && this.commentMgr) {
			await this.commentMgr.addComment(thread.id, firstComment);
		}

		return thread;
	}

	async getThreads(filter?: ThreadFilter): Promise<CommentThread[]> {
		const all = await this.sync.getThreads(this.projectId);
		let result = all;
		if (filter?.pageId) {
			result = result.filter(t => t.pageId === filter.pageId);
		}
		if (filter?.pageType) {
			result = result.filter(t => t.pageType === filter.pageType);
		}
		if (filter?.status) {
			result = result.filter(t => t.status === filter.status);
		}
		result.sort((a, b) => b.createdAt - a.createdAt);
		return result;
		// 注：搜索逻辑（按评论内容/作者名）在 panel.html 端做，
		// 因为它需要访问评论数据，ThreadManager 这里拿不到。
	}

	async getThread(threadId: string): Promise<CommentThread | null> {
		const threads = await this.sync.getThreads(this.projectId);
		return threads.find(t => t.id === threadId) || null;
	}

	async updateThread(threadId: string, patch: Partial<CommentThread>): Promise<void> {
		await this.sync.updateThread(threadId, patch);
	}

	async deleteThread(threadId: string): Promise<void> {
		await this.sync.deleteThread(threadId);
	}

	async resolveThread(threadId: string): Promise<void> {
		await this.sync.updateThread(threadId, {
			status: 'resolved',
			resolvedBy: this.currentUser.id,
			resolvedAt: Date.now(),
		});
	}

	async reopenThread(threadId: string): Promise<void> {
		await this.sync.updateThread(threadId, {
			status: 'open',
			resolvedBy: undefined,
			resolvedAt: undefined,
		});
	}

	onThreadChange(callback: () => void): () => void {
		if (this.sync.onThreadChange) {
			return this.sync.onThreadChange(() => callback());
		}
		return () => {};
	}
}
