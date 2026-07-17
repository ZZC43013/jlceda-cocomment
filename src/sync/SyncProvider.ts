import type { Comment, CommentThread } from '../types/comment';
import type { ProjectData, SyncOp, SyncMode, LocalData } from '../types/sync';
import type { User } from '../types/user';

export interface ISyncProvider {
	getMode(): SyncMode;
	getThreads(projectId: string): Promise<CommentThread[]>;
	createThread(thread: CommentThread): Promise<void>;
	updateThread(threadId: string, patch: Partial<CommentThread>): Promise<void>;
	deleteThread(threadId: string): Promise<void>;
	getComments(threadId: string): Promise<Comment[]>;
	createComment(comment: Comment): Promise<void>;
	updateComment(commentId: string, patch: Partial<Comment>): Promise<void>;
	deleteComment(commentId: string): Promise<void>;
	onThreadChange?(callback: (op: SyncOp) => void): () => void;
	onCommentChange?(callback: (op: SyncOp) => void): () => void;
	getCurrentUser(): Promise<User>;
	setCurrentUser(user: User): Promise<void>;
	exportProject(projectId: string): Promise<ProjectData>;
	importProject(projectId: string, data: ProjectData): Promise<void>;
	getAllData(): Promise<LocalData>;
}
