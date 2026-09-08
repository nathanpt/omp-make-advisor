// Row shape mirrors the live database (schema.sql + applied migrations).
export interface UserRow {
	id: string;
	email: string;
	created_at: number;
	is_suspended: number;
	suspension_reason: string | null;
}

export const SELECT_USER_BY_EMAIL =
	"SELECT id, email, created_at, is_suspended, suspension_reason FROM users WHERE email = $1";
