import { and, cosineDistance, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { DbClient } from "../client";
import { type FactType, facts } from "../schema/facts";

export interface FactSearchParams {
	userId: string;
	queryVector: number[];
	limit: number;
	factTypes?: FactType[];
	similarityThreshold?: number;
}

export interface FactSearchResult {
	id: string;
	content: string;
	factType: FactType;
	eventDate: Date;
	similarity: number;
}

export async function searchFactsByEmbedding(
	db: DbClient,
	params: FactSearchParams,
): Promise<FactSearchResult[]> {
	const similarity = sql<number>`1 - ${cosineDistance(facts.embedding, params.queryVector)}`;

	const conditions = [
		eq(facts.userId, params.userId),
		eq(facts.status, "active"),
		isNotNull(facts.embedding),
	];

	if (params.factTypes && params.factTypes.length > 0) {
		conditions.push(inArray(facts.factType, params.factTypes));
	}

	if (params.similarityThreshold !== undefined) {
		conditions.push(gt(similarity, params.similarityThreshold));
	}

	const results = await db
		.select({
			id: facts.id,
			content: facts.content,
			factType: facts.factType,
			eventDate: facts.eventDate,
			similarity,
		})
		.from(facts)
		.where(and(...conditions))
		.orderBy(desc(similarity))
		.limit(params.limit);

	return results;
}
