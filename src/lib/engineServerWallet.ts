import { Engine, type ThirdwebClient } from "thirdweb";
import type { Chain } from "thirdweb/chains";

type EngineWalletResolution = {
  signerAddress: string;
  smartAccountAddress: string;
};

const engineWalletResolutionCache = new Map<string, EngineWalletResolution>();

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
const normalizeAddress = (value: string) => String(value || "").trim().toLowerCase();

const cacheEngineWalletResolution = ({
  signerAddress,
  smartAccountAddress,
}: {
  signerAddress: string;
  smartAccountAddress?: string;
}) => {
  const normalizedSignerAddress = String(signerAddress || "").trim();
  if (!isWalletAddress(normalizedSignerAddress)) {
    return;
  }

  const signerKey = normalizedSignerAddress.toLowerCase();
  engineWalletResolutionCache.set(signerKey, {
    signerAddress: normalizedSignerAddress,
    smartAccountAddress: "",
  });

  const normalizedSmartAccountAddress = String(smartAccountAddress || "").trim();
  if (!isWalletAddress(normalizedSmartAccountAddress)) {
    return;
  }

  // signer/smart가 동일하면 ERC4337 실행옵션으로 사용할 수 없으므로 smart 매핑을 저장하지 않는다.
  if (normalizeAddress(normalizedSmartAccountAddress) === signerKey) {
    return;
  }

  const smartKey = normalizedSmartAccountAddress.toLowerCase();
  engineWalletResolutionCache.set(smartKey, {
    signerAddress: normalizedSignerAddress,
    smartAccountAddress: normalizedSmartAccountAddress,
  });
};

const isUsableResolution = (resolution: EngineWalletResolution) => {
  const normalizedSignerAddress = String(resolution.signerAddress || "").trim();
  if (!isWalletAddress(normalizedSignerAddress)) {
    return false;
  }

  const normalizedSmartAccountAddress = String(resolution.smartAccountAddress || "").trim();
  if (!normalizedSmartAccountAddress) {
    return true;
  }

  if (!isWalletAddress(normalizedSmartAccountAddress)) {
    return false;
  }

  return normalizeAddress(normalizedSmartAccountAddress) !== normalizeAddress(normalizedSignerAddress);
};

const resolveEngineWalletResolution = async ({
  client,
  walletAddress,
}: {
  client: ThirdwebClient;
  walletAddress: string;
}): Promise<EngineWalletResolution> => {
  const normalizedWalletAddress = String(walletAddress || "").trim();
  if (!isWalletAddress(normalizedWalletAddress)) {
    return {
      signerAddress: normalizedWalletAddress,
      smartAccountAddress: "",
    };
  }

  const cacheKey = normalizedWalletAddress.toLowerCase();
  const cached = engineWalletResolutionCache.get(cacheKey);
  if (cached && isUsableResolution(cached)) {
    return cached;
  }

  const pageLimit = 200;
  try {
    let page = 1;
    while (page <= 100) {
      const response = await Engine.getServerWallets({
        client,
        page,
        limit: pageLimit,
      });

      const accounts = Array.isArray(response?.accounts) ? response.accounts : [];
      for (const account of accounts) {
        cacheEngineWalletResolution({
          signerAddress: String(account?.address || "").trim(),
          smartAccountAddress: String(account?.smartAccountAddress || "").trim(),
        });
      }

      const matched = engineWalletResolutionCache.get(cacheKey);
      if (matched) {
        return matched;
      }

      const totalCount = Number(response?.pagination?.totalCount || 0);
      const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageLimit) : page;
      if (page >= totalPages) {
        break;
      }
      page += 1;
    }
  } catch (error) {
    console.error("resolveEngineWalletResolution: failed to fetch engine server wallets", error);
  }

  const fallback = {
    signerAddress: normalizedWalletAddress,
    smartAccountAddress: "",
  };
  engineWalletResolutionCache.set(cacheKey, fallback);
  return fallback;
};

export const createEngineServerWallet = async ({
  client,
  walletAddress,
  chain,
}: {
  client: ThirdwebClient;
  walletAddress: string;
  chain?: Chain;
}) => {
  const walletResolution = await resolveEngineWalletResolution({
    client,
    walletAddress,
  });

  const executionOptions = walletResolution.smartAccountAddress
    ? {
        type: "ERC4337" as const,
        signerAddress: walletResolution.signerAddress,
        smartAccountAddress: walletResolution.smartAccountAddress,
      }
    : undefined;

  return Engine.serverWallet({
    client,
    address: walletResolution.signerAddress,
    ...(chain ? { chain } : {}),
    ...(executionOptions ? { executionOptions } : {}),
  });
};

export const primeEngineServerWalletResolution = ({
  signerAddress,
  smartAccountAddress,
}: {
  signerAddress: string;
  smartAccountAddress?: string;
}) => {
  cacheEngineWalletResolution({
    signerAddress,
    smartAccountAddress,
  });
};
