import { createPrismaClient, type BasicsPrismaClient } from "@basics/db";

const globalForPrisma = globalThis as unknown as {
  prisma?: BasicsPrismaClient;
};

export const db: BasicsPrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
