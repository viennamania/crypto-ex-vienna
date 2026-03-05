import { NextResponse, type NextRequest } from 'next/server';

import { updateAgentName } from '@lib/api/agent';
import clientPromise, { dbName } from '@/lib/mongodb';
import {
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const agentcode = toText(body.agentcode);
  const agentName = toText(body.agentName);
  const requestedWalletAddress = toText(body.requesterWalletAddress || body.walletAddress);

  if (!agentcode || !agentName) {
    return NextResponse.json({ error: 'agentcode and agentName are required' }, { status: 400 });
  }

  const signatureAuth = await verifyWalletAuthFromBody({
    body,
    path: '/api/agent/setAgentName',
    method: 'POST',
    storecode: agentcode || 'admin',
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const requesterWalletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : requestedWalletAddress;

  if (!isWalletAddress(requesterWalletAddress)) {
    return NextResponse.json({ error: 'requester wallet address is invalid' }, { status: 400 });
  }

  const client = await clientPromise;
  const agentsCollection = client.db(dbName).collection('agents');
  const agent = await agentsCollection.findOne<Record<string, unknown>>(
    {
      agentcode: {
        $regex: `^${escapeRegex(agentcode)}$`,
        $options: 'i',
      },
    },
    {
      projection: {
        _id: 0,
        adminWalletAddress: 1,
      },
    },
  );

  if (!agent) {
    return NextResponse.json({ error: 'agent not found' }, { status: 404 });
  }

  const adminWalletAddress = toText(agent.adminWalletAddress);
  if (!isWalletAddress(adminWalletAddress)) {
    return NextResponse.json({ error: 'agent admin wallet address is not configured' }, { status: 400 });
  }

  const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
    expectedWalletAddress: adminWalletAddress,
    candidateWalletAddress: requesterWalletAddress,
  });

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Only agent admin wallet can update agent name' }, { status: 403 });
  }

  const result = await updateAgentName({
    walletAddress: requesterWalletAddress,
    agentcode,
    agentName,
  });

  return NextResponse.json({ result });
}
