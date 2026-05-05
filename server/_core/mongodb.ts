import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;

export function getMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  if (process.env.MONGO_URL) return process.env.MONGO_URL;
  if (process.env.DATABASE_URL?.startsWith("mongodb")) return process.env.DATABASE_URL;
  return "";
}

export function getMongoDbName() {
  return process.env.MONGODB_DB_NAME || "domino";
}

export function isMongoConfigured() {
  return getMongoUri().startsWith("mongodb://") || getMongoUri().startsWith("mongodb+srv://");
}

export async function getMongoClient() {
  const uri = getMongoUri();
  if (!uri) return null;

  if (client) return client;

  connecting ??= MongoClient.connect(uri, {
    appName: process.env.MONGODB_APP_NAME || "domino",
  });

  client = await connecting;
  return client;
}

export async function getMongoDb(): Promise<Db | null> {
  const mongoClient = await getMongoClient();
  return mongoClient?.db(getMongoDbName()) ?? null;
}
