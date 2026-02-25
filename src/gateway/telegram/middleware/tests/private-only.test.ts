import { describe, expect, it, vi } from "vitest";
import { privateOnly } from "../private-only";

function createMockContext(chatType: string) {
	return {
		chat: { type: chatType },
	} as Parameters<typeof privateOnly>[0];
}

describe("privateOnly middleware", () => {
	it("calls next() for private chat messages", async () => {
		const ctx = createMockContext("private");
		const next = vi.fn().mockResolvedValue(undefined);

		await privateOnly(ctx, next);

		expect(next).toHaveBeenCalledOnce();
	});

	it("does not call next() for group chat messages", async () => {
		const ctx = createMockContext("group");
		const next = vi.fn().mockResolvedValue(undefined);

		await privateOnly(ctx, next);

		expect(next).not.toHaveBeenCalled();
	});

	it("does not call next() for supergroup chat messages", async () => {
		const ctx = createMockContext("supergroup");
		const next = vi.fn().mockResolvedValue(undefined);

		await privateOnly(ctx, next);

		expect(next).not.toHaveBeenCalled();
	});

	it("does not call next() for channel messages", async () => {
		const ctx = createMockContext("channel");
		const next = vi.fn().mockResolvedValue(undefined);

		await privateOnly(ctx, next);

		expect(next).not.toHaveBeenCalled();
	});

	it("does not call next() when chat is undefined", async () => {
		const ctx = { chat: undefined } as Parameters<typeof privateOnly>[0];
		const next = vi.fn().mockResolvedValue(undefined);

		await privateOnly(ctx, next);

		expect(next).not.toHaveBeenCalled();
	});
});
