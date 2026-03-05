import { describe, expect, it, vi } from "vitest";
import { createDefaultCommandHandlers } from "../handlers";

describe("createDefaultCommandHandlers", () => {
	it("returns an object with start, help, and stop handlers", () => {
		const handlers = createDefaultCommandHandlers();

		expect(handlers).toHaveProperty("start");
		expect(handlers).toHaveProperty("help");
		expect(handlers).toHaveProperty("stop");
		expect(typeof handlers.start).toBe("function");
		expect(typeof handlers.help).toBe("function");
		expect(typeof handlers.stop).toBe("function");
	});

	describe("start handler", () => {
		it("calls reply with a welcome message mentioning Mema", async () => {
			const handlers = createDefaultCommandHandlers();
			const reply = vi.fn();

			await handlers.start(reply);

			expect(reply).toHaveBeenCalledOnce();
			const text = reply.mock.calls[0][0] as string;
			expect(text).toContain("Mema");
		});
	});

	describe("help handler", () => {
		it("calls reply with a help message about remembering", async () => {
			const handlers = createDefaultCommandHandlers();
			const reply = vi.fn();

			await handlers.help(reply);

			expect(reply).toHaveBeenCalledOnce();
			const text = reply.mock.calls[0][0] as string;
			expect(text).toContain("remember");
		});
	});

	describe("stop handler", () => {
		it("calls reply with a pause message mentioning /start to resume", async () => {
			const handlers = createDefaultCommandHandlers();
			const reply = vi.fn();

			await handlers.stop(reply);

			expect(reply).toHaveBeenCalledOnce();
			const text = reply.mock.calls[0][0] as string;
			expect(text).toContain("/start");
			expect(text).toContain("Pausing");
		});
	});

	it("returns independent handler instances per call", () => {
		const handlers1 = createDefaultCommandHandlers();
		const handlers2 = createDefaultCommandHandlers();

		expect(handlers1.start).not.toBe(handlers2.start);
		expect(handlers1.help).not.toBe(handlers2.help);
		expect(handlers1.stop).not.toBe(handlers2.stop);
	});
});
