import { describe, expect, it, vi } from "vitest";
import { searchFactsByEmbedding } from "../fact-search";

/**
 * Creates a mock Drizzle DB that chains select/from/where/orderBy/limit
 * for testing fact-search queries.
 */
function createMockDb(options: { rows?: Record<string, unknown>[] }) {
	const selectChain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue(options.rows ?? []),
	};

	const db = {
		select: vi.fn().mockReturnValue(selectChain),
		_selectChain: selectChain,
	};

	return db;
}

const baseParams = {
	userId: "user-uuid-1",
	queryVector: [0.1, 0.2, 0.3],
	limit: 5,
};

describe("searchFactsByEmbedding", () => {
	it("returns matching facts ordered by similarity", async () => {
		const rows = [
			{
				id: "fact-1",
				content: "User lives in Berlin",
				factType: "location",
				eventDate: new Date("2026-01-15"),
				similarity: 0.95,
			},
			{
				id: "fact-2",
				content: "User works at Acme Corp",
				factType: "workplace",
				eventDate: new Date("2026-02-01"),
				similarity: 0.82,
			},
		];
		const db = createMockDb({ rows });

		const result = await searchFactsByEmbedding(db as never, baseParams);

		expect(result).toEqual(rows);
		expect(result).toHaveLength(2);
	});

	it("queries with userId filter (NFR-SEC.1)", async () => {
		const db = createMockDb({ rows: [] });

		await searchFactsByEmbedding(db as never, baseParams);

		expect(db.select).toHaveBeenCalledTimes(1);
		expect(db._selectChain.from).toHaveBeenCalledTimes(1);
		expect(db._selectChain.where).toHaveBeenCalledTimes(1);
	});

	it("applies limit to the query", async () => {
		const db = createMockDb({ rows: [] });

		await searchFactsByEmbedding(db as never, { ...baseParams, limit: 10 });

		expect(db._selectChain.limit).toHaveBeenCalledWith(10);
	});

	it("applies orderBy for similarity ranking", async () => {
		const db = createMockDb({ rows: [] });

		await searchFactsByEmbedding(db as never, baseParams);

		expect(db._selectChain.orderBy).toHaveBeenCalledTimes(1);
	});

	it("returns empty array when no facts match", async () => {
		const db = createMockDb({ rows: [] });

		const result = await searchFactsByEmbedding(db as never, baseParams);

		expect(result).toEqual([]);
		expect(result).toHaveLength(0);
	});

	it("accepts optional factTypes filter", async () => {
		const db = createMockDb({ rows: [] });

		await searchFactsByEmbedding(db as never, {
			...baseParams,
			factTypes: ["location", "workplace"],
		});

		expect(db._selectChain.where).toHaveBeenCalledTimes(1);
	});

	it("accepts optional similarityThreshold", async () => {
		const db = createMockDb({ rows: [] });

		await searchFactsByEmbedding(db as never, {
			...baseParams,
			similarityThreshold: 0.7,
		});

		expect(db._selectChain.where).toHaveBeenCalledTimes(1);
	});

	it("works without optional parameters", async () => {
		const rows = [
			{
				id: "fact-1",
				content: "Some fact",
				factType: "other",
				eventDate: new Date("2026-01-01"),
				similarity: 0.88,
			},
		];
		const db = createMockDb({ rows });

		const result = await searchFactsByEmbedding(db as never, baseParams);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("fact-1");
	});
});
