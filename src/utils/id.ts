export function generateId(): string {
	return crypto.randomUUID().replaceAll('-', '');
}

export function isUuid32(str?: string): str is string {
	if (!str) {
		return false;
	}
	return /^[a-z0-9]{32}$/.test(str.trim());
}
