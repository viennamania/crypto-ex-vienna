import clientPromise from '../mongodb';
import { dbName } from '../mongodb';
import { normalizePolicyContentToHtml } from '../policyContent';

export type Policy = {
  _id?: any;
  slug: string;
  title?: string;
  content?: string[] | string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function getPolicyBySlug(slug: string) {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('policy');
  return collection.findOne({ slug, isActive: { $ne: false } });
}

export async function getAllPolicies() {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('policy');
  return collection.find({}).sort({ updatedAt: -1, createdAt: -1 }).toArray();
}

export async function upsertPolicy(data: Policy) {
  const client = await clientPromise;
  const collection = client.db(dbName).collection('policy');
  const now = new Date().toISOString();

  const payload = {
    slug: data.slug,
    title: data.title || '',
    content: normalizePolicyContentToHtml(data.content),
    isActive: data.isActive !== false,
    updatedAt: now,
  };

  await collection.updateOne(
    { slug: data.slug },
    {
      $set: payload,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return { slug: data.slug };
}
