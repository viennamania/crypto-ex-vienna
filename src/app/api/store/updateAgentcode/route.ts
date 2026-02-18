import { NextResponse, type NextRequest } from 'next/server';

import { updateAgentcode } from '@lib/api/store';
import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeCode = (value: string) => String(value || '').trim().toLowerCase();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const {
    storecode,
    agentcode,
    walletAddress,
    changedByWalletAddress,
    changedByName,
  } = body;

  const normalizedStorecode = String(storecode || '').trim();
  const normalizedAgentcode = String(agentcode || '').trim();
  const normalizedChangedByWalletAddress = String(
    changedByWalletAddress || walletAddress || '',
  ).trim();
  const normalizedChangedByName = String(changedByName || '').trim();

  if (!normalizedStorecode || !normalizedAgentcode) {
    return NextResponse.json({
      error: 'storecode and agentcode are required',
    }, { status: 400 });
  }

  const client = await clientPromise;
  const storeCollection = client.db(dbName).collection('stores');
  const agentCollection = client.db(dbName).collection('agents');
  const historyCollection = client.db(dbName).collection('store_agentcode_change_logs');

  const store = await storeCollection.findOne<any>(
    { storecode: { $regex: `^${escapeRegex(normalizedStorecode)}$`, $options: 'i' } },
    { projection: { _id: 0, storecode: 1, storeName: 1, agentcode: 1 } },
  );
  if (!store) {
    return NextResponse.json({
      error: 'store not found',
    }, { status: 404 });
  }

  const nextAgent = await agentCollection.findOne<any>(
    { agentcode: { $regex: `^${escapeRegex(normalizedAgentcode)}$`, $options: 'i' } },
    { projection: { _id: 0, agentcode: 1, agentName: 1, agentLogo: 1 } },
  );
  if (!nextAgent) {
    return NextResponse.json({
      error: 'agent not found',
    }, { status: 404 });
  }

  const resolvedStorecode = String(store?.storecode || normalizedStorecode).trim();
  const previousAgentcode = String(store?.agentcode || '').trim();
  const resolvedNextAgentcode = String(nextAgent?.agentcode || normalizedAgentcode).trim();
  const isChanged = normalizeCode(previousAgentcode) !== normalizeCode(resolvedNextAgentcode);

  const previousAgent = previousAgentcode
    ? await agentCollection.findOne<any>(
      { agentcode: { $regex: `^${escapeRegex(previousAgentcode)}$`, $options: 'i' } },
      { projection: { _id: 0, agentcode: 1, agentName: 1, agentLogo: 1 } },
    )
    : null;

  const result = await updateAgentcode({
    walletAddress: normalizedChangedByWalletAddress,
    storecode: resolvedStorecode,
    agentcode: resolvedNextAgentcode,
  });

  if (!result) {
    return NextResponse.json({
      error: 'failed to update agentcode',
    }, { status: 500 });
  }

  if (isChanged) {
    await historyCollection.insertOne({
      storecode: resolvedStorecode,
      storeName: String(store?.storeName || ''),
      prevAgentcode: previousAgentcode,
      prevAgentName: String(previousAgent?.agentName || ''),
      prevAgentLogo: String(previousAgent?.agentLogo || ''),
      nextAgentcode: resolvedNextAgentcode,
      nextAgentName: String(nextAgent?.agentName || ''),
      nextAgentLogo: String(nextAgent?.agentLogo || ''),
      changedByWalletAddress: normalizedChangedByWalletAddress,
      changedByName: normalizedChangedByName,
      changedAt: new Date(),
    });
  }

  return NextResponse.json({
    result,
    changed: isChanged,
    previousAgentcode,
    nextAgentcode: resolvedNextAgentcode,
    nextAgentName: String(nextAgent?.agentName || ''),
  });
}
