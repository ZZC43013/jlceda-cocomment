import type { BBox, Point } from '../types/comment';

export interface ViewTransform {
	zoom: number;
	offsetX: number;
	offsetY: number;
	canvasWidth: number;
	canvasHeight: number;
}

export function logicToScreen(
	logicX: number,
	logicY: number,
	view: ViewTransform,
): Point {
	return {
		x: logicX * view.zoom + view.offsetX,
		y: logicY * view.zoom + view.offsetY,
	};
}

export function screenToLogic(
	screenX: number,
	screenY: number,
	view: ViewTransform,
): Point {
	return {
		x: (screenX - view.offsetX) / view.zoom,
		y: (screenY - view.offsetY) / view.zoom,
	};
}

export function logicBBoxToScreen(
	bbox: BBox,
	view: ViewTransform,
): { left: number; top: number; width: number; height: number } {
	const topLeft = logicToScreen(bbox.x, bbox.y, view);
	return {
		left: topLeft.x,
		top: topLeft.y,
		width: bbox.w * view.zoom,
		height: bbox.h * view.zoom,
	};
}

export function screenBBoxToLogic(
	left: number,
	top: number,
	width: number,
	height: number,
	view: ViewTransform,
): BBox {
	const logicTopLeft = screenToLogic(left, top, view);
	return {
		x: logicTopLeft.x,
		y: logicTopLeft.y,
		w: width / view.zoom,
		h: height / view.zoom,
	};
}

export function normalizeBBox(bbox: BBox): BBox {
	const x = Math.min(bbox.x, bbox.x + bbox.w);
	const y = Math.min(bbox.y, bbox.y + bbox.h);
	const w = Math.abs(bbox.w);
	const h = Math.abs(bbox.h);
	return { x, y, w, h };
}
