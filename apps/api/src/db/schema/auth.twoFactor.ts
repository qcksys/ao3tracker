import {
    type InferInsertModel,
    type InferSelectModel,
    relations,
} from "drizzle-orm";
import { index, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import {
    createInsertSchema,
    createSelectSchema,
    createUpdateSchema,
} from "drizzle-zod";
import { DB_TABLE_PREFIX } from "~/const";
import { tAuthUser } from "~/db/schema/auth.user";

export const tAuthTwoFactor = mysqlTable(
    `${DB_TABLE_PREFIX}auth_two_factor`,
    {
        id: varchar({ length: 36 }).primaryKey(),
        secret: varchar({ length: 255 }).notNull(),
        backupCodes: text().notNull(),
        userId: varchar({ length: 36 }).notNull(),
    },
    (table) => [
        index("twoFactor_secret_idx").on(table.secret),
        index("twoFactor_userId_idx").on(table.userId),
    ],
);

export const rAuthTwoFactor = relations(tAuthTwoFactor, ({ one }) => ({
    user: one(tAuthUser, {
        fields: [tAuthTwoFactor.userId],
        references: [tAuthUser.id],
    }),
}));

export type TAuthTwoFactorS = InferSelectModel<typeof tAuthTwoFactor>;
export type TAuthTwoFactorI = InferInsertModel<typeof tAuthTwoFactor>;

export const sAuthTwoFactorS = createSelectSchema(tAuthTwoFactor);
export const sAuthTwoFactorI = createInsertSchema(tAuthTwoFactor);
export const sAuthTwoFactorU = createUpdateSchema(tAuthTwoFactor);
