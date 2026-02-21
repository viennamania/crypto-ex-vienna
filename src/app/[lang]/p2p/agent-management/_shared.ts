export type AgentSummary = {
  agentcode: string;
  agentName: string;
  agentLogo: string;
  agentDescription: string;
  adminWalletAddress: string;
  totalStoreCount: number;
};

export type AgentStoreItem = {
  id: string;
  storecode: string;
  storeName: string;
  storeLogo: string;
  usdtToKrwRate: number;
  adminWalletAddress: string;
  paymentWalletAddress: string;
  totalPaymentConfirmedCount: number;
  totalKrwAmount: number;
  totalUsdtAmount: number;
  createdAt: string;
};

export type AgentUserItem = {
  id: string;
  storecode: string;
  storeName: string;
  storeLogo: string;
  avatar: string;
  nickname: string;
  walletAddress: string;
  role: string;
  verified: boolean;
  createdAt: string;
  buyerDepositName: string;
  sellerStatus: string;
  sellerUsdtToKrwRate: number;
};

export type AgentBuyOrderItem = {
  id: string;
  paymentId: string;
  tradeId: string;
  status: string;
  orderProcessing?: string;
  orderProcessingUpdatedAt?: string;
  storecode: string;
  storeName: string;
  storeLogo: string;
  buyerNickname: string;
  buyerDepositName: string;
  sellerNickname: string;
  usdtAmount: number;
  krwAmount: number;
  rate: number;
  platformFeeRate: number;
  platformFeeAmount: number;
  platformFeeWalletAddress: string;
  createdAt: string;
  paymentConfirmedAt: string;
};

export type AgentPaymentsResult = {
  totalCount: number;
  totalKrwAmount: number;
  totalUsdtAmount: number;
  orders: AgentBuyOrderItem[];
};

export type AgentBuyOrdersResult = {
  totalCount: number;
  orders: AgentBuyOrderItem[];
};

export type AgentUsersResult = {
  totalCount: number;
  users: AgentUserItem[];
};

export type AgentStoresResult = {
  totalCount: number;
  stores: AgentStoreItem[];
};

export type AgentDashboardResult = {
  agent: AgentSummary | null;
  buyersCount: number;
  sellersCount: number;
  tradesCount: number;
  storesCount: number;
  storeMembersCount: number;
  paymentsCount: number;
  stores: AgentStoreItem[];
  recentTrades: AgentBuyOrderItem[];
  recentPayments: AgentBuyOrderItem[];
};

export type AgentPaymentStatsPoint = {
  bucket: string;
  label: string;
  count: number;
  usdtAmount: number;
  krwAmount: number;
};

export type AgentPaymentStatsResult = {
  generatedAt: string;
  totals: {
    count: number;
    usdtAmount: number;
    krwAmount: number;
  };
  hourly: {
    hours: number;
    points: AgentPaymentStatsPoint[];
  };
  daily: {
    days: number;
    points: AgentPaymentStatsPoint[];
  };
  monthly: {
    months: number;
    points: AgentPaymentStatsPoint[];
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) => (typeof value === 'string' ? value : '');
const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeBuyOrder = (value: unknown): AgentBuyOrderItem => {
  const source = isRecord(value) ? value : {};
  const buyer = isRecord(source.buyer) ? source.buyer : {};
  const seller = isRecord(source.seller) ? source.seller : {};
  const store = isRecord(source.store) ? source.store : {};
  const platformFee = isRecord(source.platformFee) ? source.platformFee : {};
  const settlement = isRecord(source.settlement) ? source.settlement : {};

  return {
    id: toText(source._id) || toText(source.id),
    paymentId: '',
    tradeId: toText(source.tradeId),
    status: toText(source.status),
    orderProcessing: toText(source.orderProcessing) || toText(source.order_processing),
    orderProcessingUpdatedAt: toText(source.orderProcessingUpdatedAt) || toText(source.order_processing_updated_at),
    storecode: toText(source.storecode),
    storeName: toText(store.storeName) || toText(source.storeName) || toText(source.storecode),
    storeLogo: toText(store.storeLogo) || toText(source.storeLogo),
    buyerNickname: toText(source.nickname),
    buyerDepositName: toText(buyer.depositName),
    sellerNickname: toText(seller.nickname),
    usdtAmount: toNumber(source.usdtAmount),
    krwAmount: toNumber(source.krwAmount),
    rate: toNumber(source.rate),
    platformFeeRate: toNumber(
      source.platformFeeRate
      ?? platformFee.rate
      ?? platformFee.percentage
      ?? settlement.platformFeePercent
      ?? source.tradeFeeRate
      ?? source.centerFeeRate,
    ),
    platformFeeAmount: toNumber(
      source.platformFeeAmount
      ?? platformFee.amountUsdt
      ?? platformFee.amount
      ?? settlement.platformFeeAmount,
    ),
    platformFeeWalletAddress: toText(
      source.platformFeeWalletAddress
      || platformFee.walletAddress
      || platformFee.address
      || settlement.platformFeeWalletAddress,
    ),
    createdAt: toText(source.createdAt),
    paymentConfirmedAt: toText(source.paymentConfirmedAt),
  };
};

const normalizeWalletUsdtPayment = (value: unknown): AgentBuyOrderItem => {
  const source = isRecord(value) ? value : {};
  const store = isRecord(source.store) ? source.store : {};

  return {
    id: toText(source.id) || toText(source._id),
    paymentId: toText(source.paymentId),
    tradeId: toText(source.transactionHash) || toText(source.id) || toText(source._id),
    status: toText(source.status),
    orderProcessing: toText(source.orderProcessing) || toText(source.order_processing) || 'PROCESSING',
    orderProcessingUpdatedAt: toText(source.orderProcessingUpdatedAt) || toText(source.order_processing_updated_at),
    storecode: toText(source.storecode),
    storeName: toText(store.storeName) || toText(source.storeName) || toText(source.storecode),
    storeLogo: toText(store.storeLogo) || toText(source.storeLogo),
    buyerNickname: toText(source.memberNickname),
    buyerDepositName: '',
    sellerNickname: toText(source.toWalletAddress),
    usdtAmount: toNumber(source.usdtAmount),
    krwAmount: toNumber(source.krwAmount),
    rate: toNumber(source.exchangeRate),
    platformFeeRate: toNumber(source.platformFeeRate),
    platformFeeAmount: toNumber(source.platformFeeAmount),
    platformFeeWalletAddress: toText(source.platformFeeWalletAddress),
    createdAt: toText(source.createdAt),
    paymentConfirmedAt: toText(source.confirmedAt),
  };
};

const normalizeUser = (value: unknown): AgentUserItem => {
  const source = isRecord(value) ? value : {};
  const buyer = isRecord(source.buyer) ? source.buyer : {};
  const seller = isRecord(source.seller) ? source.seller : {};
  const store = isRecord(source.store) ? source.store : {};

  return {
    id: toText(source._id) || toText(source.id),
    storecode: toText(source.storecode),
    storeName: toText(store.storeName) || toText(source.storeName),
    storeLogo: toText(store.storeLogo) || toText(source.storeLogo),
    avatar: toText(source.avatar) || toText(source.profileImage),
    nickname: toText(source.nickname),
    walletAddress: toText(source.walletAddress),
    role: toText(source.role) || 'member',
    verified: source.verified === true,
    createdAt: toText(source.createdAt),
    buyerDepositName: toText(buyer.depositName) || toText(buyer?.bankInfo && isRecord(buyer.bankInfo) ? buyer.bankInfo.depositName : ''),
    sellerStatus: toText(seller.sellerStatus) || toText(seller.status),
    sellerUsdtToKrwRate: toNumber(seller.usdtToKrwRate),
  };
};

const normalizeStore = (value: unknown): AgentStoreItem => {
  const source = isRecord(value) ? value : {};

  return {
    id: toText(source._id),
    storecode: toText(source.storecode),
    storeName: toText(source.storeName),
    storeLogo: toText(source.storeLogo),
    usdtToKrwRate: toNumber(source.usdtToKrwRate),
    adminWalletAddress: toText(source.adminWalletAddress),
    paymentWalletAddress: toText(source.paymentWalletAddress),
    totalPaymentConfirmedCount: toNumber(source.totalPaymentConfirmedCount),
    totalKrwAmount: toNumber(source.totalKrwAmount),
    totalUsdtAmount: toNumber(source.totalUsdtAmount),
    createdAt: toText(source.createdAt),
  };
};

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toText((payload as Record<string, unknown>)?.error) || `${url} 요청 실패`);
  }

  return payload;
}

export const shortAddress = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

export const toDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

export const formatKrw = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(toNumber(value))}원`;

export const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(toNumber(value))} USDT`;

export async function fetchAgentSummary(agentcode: string): Promise<AgentSummary | null> {
  const normalizedAgentcode = String(agentcode || '').trim();
  if (!normalizedAgentcode) {
    return null;
  }

  const payload = await postJson('/api/agent/getOneAgent', {
    agentcode: normalizedAgentcode,
  });

  const result = isRecord((payload as Record<string, unknown>)?.result)
    ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
    : {};

  if (!toText(result.agentcode)) {
    return null;
  }

  return {
    agentcode: toText(result.agentcode),
    agentName: toText(result.agentName) || toText(result.agentcode),
    agentLogo: toText(result.agentLogo),
    agentDescription: toText(result.agentDescription),
    adminWalletAddress: toText(result.adminWalletAddress),
    totalStoreCount: toNumber(result.totalStoreCount),
  };
}

export async function fetchStoresByAgent(agentcode: string, limit = 300, page = 1): Promise<AgentStoresResult> {
  const payload = await postJson('/api/store/getAllStoresByAgentcode', {
    agentcode,
    limit,
    page,
  });

  const result = isRecord((payload as Record<string, unknown>)?.result)
    ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
    : {};

  const storesRaw = Array.isArray(result.stores) ? result.stores : [];

  return {
    totalCount: toNumber(result.totalCount),
    stores: storesRaw.map((store) => normalizeStore(store)),
  };
}

export async function fetchUsersByAgent(
  agentcode: string,
  {
    storecode = '',
    userType = 'all',
    requireProfile = true,
    includeWalletless = true,
    searchTerm = '',
    sortField = 'createdAt',
    limit = 1000,
    page = 1,
  }: {
    storecode?: string;
    userType?: 'buyer' | 'seller' | 'all';
    requireProfile?: boolean;
    includeWalletless?: boolean;
    searchTerm?: string;
    sortField?: 'nickname' | 'createdAt';
    limit?: number;
    page?: number;
  } = {},
): Promise<AgentUsersResult> {
  const payload = await postJson('/api/user/getAllUsersByStorecode', {
    storecode,
    agentcode,
    userType,
    requireProfile,
    includeWalletless,
    includeUnverified: true,
    searchTerm,
    limit,
    page,
    sortField,
  });

  const result = isRecord((payload as Record<string, unknown>)?.result)
    ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
    : {};

  const usersRaw = Array.isArray(result.users) ? result.users : [];

  return {
    totalCount: toNumber(result.totalCount),
    users: usersRaw.map((user) => normalizeUser(user)),
  };
}

export async function fetchBuyOrdersByAgent(
  agentcode: string,
  limit = 100,
  page = 1,
): Promise<AgentBuyOrdersResult> {
  const payload = await postJson('/api/order/getAllBuyOrders', {
    agentcode,
    storecode: '',
    limit,
    page,
    searchMyOrders: false,
    searchOrderStatusCancelled: false,
    searchOrderStatusCompleted: false,
    searchStoreName: '',
    privateSale: false,
    privateSaleMode: 'all',
    searchBuyer: '',
    searchDepositName: '',
    searchStoreBankAccountNumber: '',
    fromDate: '',
    toDate: '',
  });

  const result = isRecord((payload as Record<string, unknown>)?.result)
    ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
    : {};

  const ordersRaw = Array.isArray(result.orders) ? result.orders : [];

  return {
    totalCount: toNumber(result.totalCount),
    orders: ordersRaw.map((order) => normalizeBuyOrder(order)),
  };
}

export async function fetchPaymentsByAgent(
  agentcode: string,
  limit = 100,
  page = 1,
): Promise<AgentPaymentsResult> {
  const payload = await postJson('/api/order/getAllBuyOrdersByAdmin', {
    agentcode,
    limit,
    page,
    searchNickname: '',
    walletAddress: '',
    storecode: '',
    searchOrderStatusCompleted: true,
    searchBuyer: '',
    searchDepositName: '',
    searchStoreBankAccountNumber: '',
    privateSale: false,
    fromDate: '',
    toDate: '',
  });

  const result = isRecord((payload as Record<string, unknown>)?.result)
    ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
    : {};

  const ordersRaw = Array.isArray(result.orders) ? result.orders : [];

  return {
    totalCount: toNumber(result.totalCount),
    totalKrwAmount: toNumber(result.totalKrwAmount),
    totalUsdtAmount: toNumber(result.totalUsdtAmount),
    orders: ordersRaw.map((order) => normalizeBuyOrder(order)),
  };
}

export async function fetchWalletUsdtPaymentsByAgent(
  agentcode: string,
  {
    storecode = '',
    limit = 20,
    page = 1,
    searchTerm = '',
    status = 'confirmed',
  }: {
    storecode?: string;
    limit?: number;
    page?: number;
    searchTerm?: string;
    status?: 'prepared' | 'confirmed' | 'all';
  } = {},
): Promise<AgentPaymentsResult> {
  const payload = await postJson('/api/payment/getAllWalletUsdtPaymentsByAgentcode', {
    agentcode,
    storecode,
    limit,
    page,
    searchTerm,
    status,
  });

  const result = isRecord((payload as Record<string, unknown>)?.result)
    ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
    : {};

  const paymentsRaw = Array.isArray(result.payments) ? result.payments : [];

  return {
    totalCount: toNumber(result.totalCount),
    totalKrwAmount: toNumber(result.totalKrwAmount),
    totalUsdtAmount: toNumber(result.totalUsdtAmount),
    orders: paymentsRaw.map((payment) => normalizeWalletUsdtPayment(payment)),
  };
}

export async function updateWalletUsdtPaymentOrderProcessing(
  paymentId: string,
  orderProcessing: 'PROCESSING' | 'COMPLETED' = 'COMPLETED',
): Promise<{
  id: string;
  orderProcessing: string;
  orderProcessingUpdatedAt: string;
}> {
  const payload = await postJson('/api/payment/setWalletUsdtPaymentOrderProcessing', {
    paymentId,
    orderProcessing,
  });

  const result = isRecord((payload as Record<string, unknown>)?.result)
    ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
    : {};

  return {
    id: toText(result.id),
    orderProcessing: toText(result.orderProcessing),
    orderProcessingUpdatedAt: toText(result.orderProcessingUpdatedAt),
  };
}

const normalizePaymentStatsPoint = (value: unknown): AgentPaymentStatsPoint => {
  const source = isRecord(value) ? value : {};
  return {
    bucket: toText(source.bucket),
    label: toText(source.label),
    count: toNumber(source.count),
    usdtAmount: toNumber(source.usdtAmount),
    krwAmount: toNumber(source.krwAmount),
  };
};

export async function fetchWalletUsdtPaymentStatsByAgent(
  agentcode: string,
  {
    hourlyHours = 24,
    dailyDays = 14,
    monthlyMonths = 12,
  }: {
    hourlyHours?: number;
    dailyDays?: number;
    monthlyMonths?: number;
  } = {},
): Promise<AgentPaymentStatsResult> {
  const payload = await postJson('/api/payment/getWalletUsdtPaymentStatsByAgentcode', {
    agentcode,
    hourlyHours,
    dailyDays,
    monthlyMonths,
  });

  const result = isRecord((payload as Record<string, unknown>)?.result)
    ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
    : {};

  const totals = isRecord(result.totals) ? result.totals : {};
  const hourly = isRecord(result.hourly) ? result.hourly : {};
  const daily = isRecord(result.daily) ? result.daily : {};
  const monthly = isRecord(result.monthly) ? result.monthly : {};

  const hourlyPointsRaw = Array.isArray(hourly.points) ? hourly.points : [];
  const dailyPointsRaw = Array.isArray(daily.points) ? daily.points : [];
  const monthlyPointsRaw = Array.isArray(monthly.points) ? monthly.points : [];

  return {
    generatedAt: toText(result.generatedAt),
    totals: {
      count: toNumber(totals.count),
      usdtAmount: toNumber(totals.usdtAmount),
      krwAmount: toNumber(totals.krwAmount),
    },
    hourly: {
      hours: toNumber(hourly.hours),
      points: hourlyPointsRaw.map((point) => normalizePaymentStatsPoint(point)),
    },
    daily: {
      days: toNumber(daily.days),
      points: dailyPointsRaw.map((point) => normalizePaymentStatsPoint(point)),
    },
    monthly: {
      months: toNumber(monthly.months),
      points: monthlyPointsRaw.map((point) => normalizePaymentStatsPoint(point)),
    },
  };
}

export async function fetchAgentDashboard(agentcode: string): Promise<AgentDashboardResult> {
  const normalizedAgentcode = String(agentcode || '').trim();
  if (!normalizedAgentcode) {
    return {
      agent: null,
      buyersCount: 0,
      sellersCount: 0,
      tradesCount: 0,
      storesCount: 0,
      storeMembersCount: 0,
      paymentsCount: 0,
      stores: [],
      recentTrades: [],
      recentPayments: [],
    };
  }

  const [
    agent,
    storesResult,
    buyersResult,
    sellersResult,
    membersResult,
    tradesResult,
    paymentsResult,
  ] = await Promise.all([
    fetchAgentSummary(normalizedAgentcode),
    fetchStoresByAgent(normalizedAgentcode, 100, 1),
    fetchUsersByAgent(normalizedAgentcode, { userType: 'buyer', requireProfile: true, includeWalletless: true, limit: 1, page: 1 }),
    fetchUsersByAgent(normalizedAgentcode, { userType: 'seller', requireProfile: true, includeWalletless: true, limit: 1, page: 1 }),
    fetchUsersByAgent(normalizedAgentcode, { userType: 'all', requireProfile: false, includeWalletless: true, limit: 1, page: 1 }),
    fetchBuyOrdersByAgent(normalizedAgentcode, 12, 1),
    fetchWalletUsdtPaymentsByAgent(normalizedAgentcode, {
      limit: 12,
      page: 1,
      status: 'confirmed',
    }),
  ]);

  return {
    agent,
    buyersCount: buyersResult.totalCount,
    sellersCount: sellersResult.totalCount,
    tradesCount: tradesResult.totalCount,
    storesCount: storesResult.totalCount,
    storeMembersCount: membersResult.totalCount,
    paymentsCount: paymentsResult.totalCount,
    stores: storesResult.stores,
    recentTrades: tradesResult.orders,
    recentPayments: paymentsResult.orders,
  };
}
