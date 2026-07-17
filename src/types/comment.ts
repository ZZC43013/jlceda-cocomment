export type PageType = 'schematic' | 'pcb';

export type AnchorType = 'box' | 'arrow';

export interface BBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Point {
	x: number;
	y: number;
}

export interface ThreadAnchor {
	type: AnchorType;
	bbox?: BBox;
	startPoint?: Point;
	endPoint?: Point;
}

export interface RelatedPrimitive {
	type: string;
	id: string;
	label?: string;
}

export type ThreadStatus = 'open' | 'resolved';

export interface CommentThread {
	id: string;
	projectId: string;
	pageId: string;
	pageType: PageType;
	anchor: ThreadAnchor;
	relatedPrimitives: RelatedPrimitive[];
	status: ThreadStatus;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
	resolvedBy?: string;
	resolvedAt?: number;
	version: number;
}

export interface CommentAttachment {
	id: string;
	type: 'image' | 'file';
	name: string;
	dataUrl?: string;
	url?: string;
}

export type CommentAction = 'create' | 'resolve' | 'reopen' | 'edit';

export interface Comment {
	id: string;
	threadId: string;
	authorId: string;
	authorName: string;
	content: string;
	mentions: string[];
	attachments: CommentAttachment[];
	createdAt: number;
	updatedAt: number;
	action?: CommentAction;
}
