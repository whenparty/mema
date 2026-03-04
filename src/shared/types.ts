export interface MessageInput {
	text: string;
	externalUserId: string;
	username: string | undefined;
	firstName: string;
	languageCode: string | undefined;
	platformUpdateId: number;
}

export type Intent =
	| "memory.save"
	| "memory.view"
	| "memory.edit"
	| "memory.delete"
	| "memory.delete_entity"
	| "memory.explain"
	| "reminder.create"
	| "reminder.list"
	| "reminder.cancel"
	| "reminder.edit"
	| "chat"
	| "system.delete_account"
	| "system.pause"
	| "system.resume";

export type Complexity = "trivial" | "standard";
