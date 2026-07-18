import type { Comment, CommentThread } from './comment';
import type { User } from './user';

export type OpType =
	| 'thread:create'
	| 'thread:update'
	| 'thread:delete'
	| 'thread:resolve'
	| 'thread:reopen'
	| 'comment:create'
	| 'comment:update'
	| 'comment:delete';

export interface SyncOp {
	id: string;
	type: OpType;
	entityId: string;
	data: any;
	userId: string;
	timestamp: number;
	version: number;
}

export interface ProjectData {
	threads: CommentThread[];
	comments: Record<string, Comment[]>;
	lastSyncedAt?: number;
	/** 工程元数据（导出时注入，用于跨设备导入校验） */
	projectId?: string;
	projectName?: string;
}

export interface LocalData {
	schemaVersion: 1;
	currentUser: User;
	projects: Record<string, ProjectData>;
}

export type SyncMode = 'local' | 'rest' | 'websocket';
