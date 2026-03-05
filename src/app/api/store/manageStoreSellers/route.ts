import { NextResponse, type NextRequest } from 'next/server';
import clientPromise, { dbName } from '@/lib/mongodb';
import {
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';

import {
  addStoreSellerWalletAddress,
  getStoreSellerWalletAddresses,
  removeStoreSellerWalletAddress,
} from '@lib/api/store';

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const toText = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => ({}));
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? (bodyRaw as Record<string, unknown>)
        : {};
    const action = String(body?.action || 'get').trim().toLowerCase();
    const storecode = String(body?.storecode || '').trim();
    const walletAddress = String(body?.walletAddress || '').trim();

    if (!storecode) {
      return NextResponse.json({ error: 'storecode is required' }, { status: 400 });
    }

    const signatureAuth = await verifyWalletAuthFromBody({
      body,
      path: '/api/store/manageStoreSellers',
      method: 'POST',
      storecode,
      consumeNonceValue: true,
    });
    if (signatureAuth.ok === false) {
      return signatureAuth.response;
    }

    if (signatureAuth.ok === true) {
      const requesterWalletAddress = signatureAuth.walletAddress;
      const client = await clientPromise;
      const storesCollection = client.db(dbName).collection('stores');
      const agentsCollection = client.db(dbName).collection('agents');
      const store = await storesCollection.findOne<Record<string, unknown>>(
        {
          storecode: {
            $regex: `^${escapeRegex(storecode)}$`,
            $options: 'i',
          },
        },
        {
          projection: {
            _id: 0,
            storecode: 1,
            agentcode: 1,
          },
        },
      );

      if (!store) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
      }

      const agentcode = toText(store.agentcode);
      if (!agentcode) {
        return NextResponse.json({ error: 'Store agentcode is missing' }, { status: 400 });
      }

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

      const adminWalletAddress = toText(agent?.adminWalletAddress);
      if (!adminWalletAddress) {
        return NextResponse.json({ error: 'Agent admin wallet address is not configured' }, { status: 400 });
      }

      const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
        expectedWalletAddress: adminWalletAddress,
        candidateWalletAddress: requesterWalletAddress,
      });
      if (!isAuthorized) {
        return NextResponse.json({ error: 'Only agent admin wallet can manage store sellers' }, { status: 403 });
      }
    }

    if (action === 'get') {
      const result = await getStoreSellerWalletAddresses({ storecode });
      return NextResponse.json({ result });
    }

    if (!isWalletAddress(walletAddress)) {
      return NextResponse.json({ error: 'valid walletAddress is required' }, { status: 400 });
    }

    if (action === 'add') {
      const result = await addStoreSellerWalletAddress({ storecode, sellerWalletAddress: walletAddress });
      return NextResponse.json({ result });
    }

    if (action === 'remove') {
      const result = await removeStoreSellerWalletAddress({ storecode, sellerWalletAddress: walletAddress });
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'failed to manage store sellers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
