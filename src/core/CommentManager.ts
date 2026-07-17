import type { Comment, CommentAttachment } from '../types/comment';
import { generateId } from '../utils/id';
import type { ISyncProvider } from '../sync/SyncProvider';
import type { User } from '../types/user';

export class CommentManager {
	private sync: ISyncProvider;
	private currentUser!: User;

	constructor(sync: ISyncProvider) {
		this.sync = sync;
	}

	async init(): Promise<void> {
		this.currentUser = await this.sync.getCurrentUser();
	}

	/**
	 * 刷新当前用户（用户改名/改色后调用）。
	 */
	refreshUser(user: User): void {
		this.currentUser = { ...user };
	}

	async addComment(
		threadId: string,
		content: string,
		attachments: CommentAttachment[] = [],
	): Promise<Comment> {
		const user = this.currentUser;
		const now = Date.now();
		const comment: Comment = {
			id: generateId(),
			threadId,
			authorId: user.id,
			authorName: user.name,
			content: content.trim(),
			mentions: [],
			attachments,
			createdAt: now,
			updatedAt: now,
			action: 'create',
		};
		await this.sync.createComment(comment);
		return comment;
	}

	async getComments(threadId: string): Promise<Comment[]> {
		const list = await this.sync.getComments(threadId);
		return list.sort((a, b) => a.createdAt - b.createdAt);
	}

	async updateComment(commentId: string, content: string): Promise<void> {
		await this.sync.updateComment(commentId, {
			content,
			action: 'edit',
		});
	}

	async deleteComment(commentId: string): Promise<void> {
		await this.sync.deleteComment(commentId);
	}

	onCommentChange(callback: () => void): () => void {
		if (this.sync.onCommentChange) {
			return this.sync.onCommentChange(() => callback());
		}
		return () => {};
	}
}
