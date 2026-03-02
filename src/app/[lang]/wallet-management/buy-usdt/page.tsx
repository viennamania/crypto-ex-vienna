'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Manrope, Playfair_Display } from 'next/font/google';
import { toast } from 'react-hot-toast';
import { getContract } from 'thirdweb';
import { balanceOf } from 'thirdweb/extensions/erc20';
import { ethereum, polygon, arbitrum, bsc, type Chain } from 'thirdweb/chains';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';
import { getUserPhoneNumber } from 'thirdweb/wallets/in-app';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';

import { client } from '@/app/client';
import { useClientWallets } from '@/lib/useClientWallets';
import { useClientSettings } from '@/components/ClientSettingsProvider';
import WalletConnectPrompt from '@/components/wallet-management/WalletConnectPrompt';
import WalletSummaryCard from '@/components/wallet-management/WalletSummaryCard';
import WalletManagementBottomNav from '@/components/wallet-management/WalletManagementBottomNav';
import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';

type NetworkKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';

type NetworkOption = {
  id: NetworkKey;
  label: string;
  chain: Chain;
  contractAddress: string;
  tokenDecimals: number;
};

type SellerItem = {
  walletAddress: string;
  nickname: string;
  avatar: string;
  rate: number;
  currentUsdtBalance: number;
  paymentMethods: string[];
  bankInfo: {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
    contactMemo?: string;
  };
};

type StoreDisplayInfo = {
  storecode: string;
  storeName: string;
  storeLogo: string;
};

type StoreMemberProfile = {
  nickname: string;
  buyer: Record<string, unknown> | null;
};

type BuyerProfile = {
  nickname: string;
  avatar: string;
  depositName: string;
  buyer: Record<string, unknown> | null;
};

type PrivateTradeOrder = {
  orderId: string;
  tradeId: string;
  status: string;
  createdAt: string;
  acceptedAt: string;
  paymentRequestedAt: string;
  paymentConfirmedAt: string;
  cancelledAt: string;
  krwAmount: number;
  usdtAmount: number;
  paymentMethod: string;
  paymentBankName: string;
  paymentAccountNumber: string;
  paymentAccountHolder: string;
  paymentContactMemo: string;
  isContactTransfer: boolean;
  consentChannelUrl: string;
  consentStatus: string;
  consentAccepted: boolean;
  consentAcceptedAt: string;
  consentRequestedAt: string;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
};

type PrivateTradeStatusResult = {
  isTrading: boolean;
  status: string | null;
  order: PrivateTradeOrder | null;
};

type BuyHistoryItem = {
  id: string;
  tradeId: string;
  status: string;
  usdtAmount: number;
  krwAmount: number;
  rate: number;
  createdAt: string;
  paymentRequestedAt: string;
  paymentConfirmedAt: string;
  cancelledAt: string;
  sellerWalletAddress: string;
  sellerNickname: string;
  sellerBankName: string;
  sellerAccountNumber: string;
  paymentMethod: string;
};

type PurchaseCompleteJackpot = {
  orderKey: string;
  tradeId: string;
  usdtAmount: number;
};

type EscrowFlowPhase =
  | 'IDLE'
  | 'SUBMITTING'
  | 'ORDERED'
  | 'ACCEPTED'
  | 'PAYMENT_REQUESTED'
  | 'COMPLETED';

type EscrowFlowStepState = 'pending' | 'active' | 'completed';

type EscrowFlowStepItem = {
  key: string;
  title: string;
  description: string;
  state: EscrowFlowStepState;
};

type CancelTradeProgressPhase = 'idle' | 'processing' | 'completed' | 'error';
type CancelTradeProgressStepState = 'pending' | 'active' | 'completed' | 'error';
type CancelTradeProgressStepItem = {
  key: string;
  title: string;
  description: string;
  state: CancelTradeProgressStepState;
  updatedAt: string;
  detail?: string;
};
type CancelTradeProgressApiEvent =
  | {
      type: 'progress';
      step?: string;
      title?: string;
      description?: string;
      status?: 'processing' | 'completed' | 'error';
      occurredAt?: string;
      detail?: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'result';
      payload?: {
        result?: boolean;
      };
    }
  | {
      type: 'error';
      status?: number;
      payload?: {
        error?: string;
        message?: string;
        detail?: string;
      };
    };

type BuyOrderProgressPhase = 'idle' | 'processing' | 'completed' | 'error';
type BuyOrderProgressStepState = 'pending' | 'active' | 'completed' | 'error';
type BuyOrderProgressStepItem = {
  key: string;
  title: string;
  description: string;
  state: BuyOrderProgressStepState;
  updatedAt: string;
  detail?: string;
};
type BuyOrderProgressResultPayload = {
  result?: boolean;
  created?: boolean;
  reason?: string;
  order?: Record<string, unknown> | null;
};
type BuyOrderProgressApiEvent =
  | {
      type: 'progress';
      step?: string;
      title?: string;
      description?: string;
      status?: 'processing' | 'completed' | 'error';
      occurredAt?: string;
      detail?: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'result';
      payload?: BuyOrderProgressResultPayload;
    }
  | {
      type: 'error';
      status?: number;
      payload?: {
        error?: string;
        message?: string;
        detail?: string;
      };
    };

const displayFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const WALLET_AUTH_OPTIONS = ['phone'];
const QUICK_BUY_AMOUNTS = [10, 30, 50, 100, 300, 500];
const TRADABLE_STATUSES = new Set(['ordered', 'accepted', 'paymentRequested']);
const PRIVATE_TRADE_PAYMENT_WINDOW_MS = 30 * 60 * 1000;
const BUYER_PROFILE_LOADING_MIN_MS = 5000;
const STORE_MEMBER_LINKING_MIN_MS = 5000;
const JACKPOT_AUTO_HIDE_MS = 5200;
const PRIVATE_TRADE_STATUS_LABEL: Record<string, string> = {
  ordered: '주문 대기',
  accepted: '주문 수락됨',
  paymentRequested: '입금 요청',
};
const BUY_HISTORY_STATUS_LABEL: Record<string, string> = {
  ordered: '주문 대기',
  accepted: '주문 수락됨',
  paymentRequested: '입금 요청',
  paymentConfirmed: '구매완료',
  cancelled: '취소됨',
};
const ESCROW_FLOW_STEP_DEFINITIONS = [
  {
    key: 'submit',
    title: '구매 신청 접수',
    description: '구매 조건 확인 후 주문을 생성합니다.',
  },
  {
    key: 'escrow-lock',
    title: '에스크로 잠금 처리',
    description: '판매자 에스크로에서 구매용 에스크로로 USDT를 잠급니다.',
  },
  {
    key: 'consent-check',
    title: '이용동의 확인',
    description: '주문 채팅에서 "동의함" 입력 여부를 확인합니다.',
  },
  {
    key: 'deposit-check',
    title: '입금 확인 대기',
    description: '판매자 계좌 입금 후 확인이 진행됩니다.',
  },
  {
    key: 'completed',
    title: '구매 완료',
    description: '입금 확인 후 USDT 정산이 완료됩니다.',
  },
] as const;
const CANCEL_TRADE_PROGRESS_STEP_DEFINITIONS = [
  {
    key: 'REQUEST_VALIDATED',
    title: '요청 검증',
    description: '취소 요청 정보를 검증합니다.',
  },
  {
    key: 'ORDER_VALIDATED',
    title: '주문 확인',
    description: '취소 가능한 주문 상태를 확인합니다.',
  },
  {
    key: 'ESCROW_WALLET_VALIDATED',
    title: '에스크로 지갑 확인',
    description: '회수 대상 에스크로 지갑을 확인합니다.',
  },
  {
    key: 'ROLLBACK_AMOUNT_VALIDATED',
    title: '회수 수량 확인',
    description: '회수할 USDT 수량을 검증합니다.',
  },
  {
    key: 'ENGINE_READY',
    title: '서버 지갑 준비',
    description: '온체인 취소 처리를 위한 서버 지갑을 준비합니다.',
  },
  {
    key: 'ROLLBACK_TRANSFER_SUBMITTED',
    title: '에스크로 회수 요청',
    description: '구매 에스크로에서 판매자 에스크로로 전송을 요청합니다.',
  },
  {
    key: 'ROLLBACK_TRANSFER_CONFIRMED',
    title: '에스크로 회수 확인',
    description: '온체인 회수 전송 확정을 확인합니다.',
  },
  {
    key: 'ORDER_CANCELLED',
    title: '주문 취소 반영',
    description: '주문 상태를 취소로 반영합니다.',
  },
  {
    key: 'SELLER_SNAPSHOT_UPDATED',
    title: '판매자 동기화',
    description: '판매자 주문 스냅샷을 동기화합니다.',
  },
  {
    key: 'BUYER_STATUS_UPDATED',
    title: '구매자 상태 동기화',
    description: '구매자 주문 상태를 동기화합니다.',
  },
  {
    key: 'BUYER_REPUTATION_UPDATED',
    title: '구매자 이력 반영',
    description: '구매자 취소 이력 및 신뢰도 정보를 반영합니다.',
  },
  {
    key: 'CANCEL_COMPLETED',
    title: '취소 처리 완료',
    description: '거래 취소가 최종 완료되었습니다.',
  },
];
const BUY_ORDER_PROGRESS_STEP_DEFINITIONS = [
  {
    key: 'REQUEST_VALIDATED',
    title: '요청 검증',
    description: '구매 주문 요청값을 확인합니다.',
  },
  {
    key: 'ACTIVE_ORDER_CHECKING',
    title: '기존 거래 확인',
    description: '진행중인 동일 거래가 있는지 확인합니다.',
  },
  {
    key: 'ORDER_CREATE_STARTED',
    title: '주문 생성 시작',
    description: '새 구매 주문 생성을 시작합니다.',
  },
  {
    key: 'SELLER_VALIDATED',
    title: '판매자 확인',
    description: '판매자 정보와 에스크로 지갑을 확인합니다.',
  },
  {
    key: 'BUYER_VALIDATED',
    title: '구매자 확인',
    description: '구매자 지갑 및 입금자명 정보를 확인합니다.',
  },
  {
    key: 'AMOUNT_VALIDATED',
    title: '주문 금액 확정',
    description: 'USDT/KRW 주문 금액과 환율 정보를 확정합니다.',
  },
  {
    key: 'PLATFORM_FEE_VALIDATED',
    title: '수수료 설정 확인',
    description: '플랫폼 수수료 및 락업 수량을 확인합니다.',
  },
  {
    key: 'BUYER_ESCROW_WALLET_CREATED',
    title: '구매 에스크로 지갑 생성',
    description: '구매자 전용 에스크로 지갑을 생성합니다.',
  },
  {
    key: 'ESCROW_TRANSFER_SUBMITTED',
    title: '에스크로 전송 요청',
    description: '판매자 에스크로에서 구매 에스크로로 전송을 요청합니다.',
  },
  {
    key: 'ESCROW_TRANSFER_CONFIRMED',
    title: '에스크로 전송 확인',
    description: '온체인 전송 확인을 완료합니다.',
  },
  {
    key: 'ORDER_INSERTED',
    title: '주문 생성 완료',
    description: '주문을 저장하고 입금요청 상태로 전환합니다.',
  },
  {
    key: 'ORDER_STATUS_CHECKING',
    title: '주문 상태 조회',
    description: '최종 주문 상태를 확인합니다.',
  },
  {
    key: 'ORDER_READY',
    title: '주문 준비 완료',
    description: '주문이 입금요청 상태로 준비되었습니다.',
  },
  {
    key: 'CONSENT_REQUEST_MESSAGE',
    title: '동의 요청 메시지 발송',
    description: '판매자 채팅으로 동의 요청 메시지를 전송합니다.',
  },
  {
    key: 'BUY_ORDER_RESULT_READY',
    title: '구매 신청 완료',
    description: '구매 신청이 정상 처리되었습니다.',
  },
] as const;
const SENDBIRD_APP_ID =
  process.env.NEXT_PUBLIC_SENDBIRD_APP_ID ||
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID ||
  '';

const createInitialCancelTradeProgressSteps = (): CancelTradeProgressStepItem[] =>
  CANCEL_TRADE_PROGRESS_STEP_DEFINITIONS.map((item) => ({
    key: item.key,
    title: item.title,
    description: item.description,
    state: item.key === 'REQUEST_VALIDATED' ? 'active' : 'pending',
    updatedAt: '',
  }));

const createInitialBuyOrderProgressSteps = (): BuyOrderProgressStepItem[] =>
  BUY_ORDER_PROGRESS_STEP_DEFINITIONS.map((item) => ({
    key: item.key,
    title: item.title,
    description: item.description,
    state: item.key === 'REQUEST_VALIDATED' ? 'active' : 'pending',
    updatedAt: '',
  }));

const getEscrowFlowStepStatusLabel = (state: EscrowFlowStepState) => {
  if (state === 'completed') return '완료';
  if (state === 'active') return '진행중';
  return '대기';
};

const getEscrowFlowStepStyle = (state: EscrowFlowStepState) => {
  if (state === 'completed') {
    return {
      container: 'border-emerald-200 bg-emerald-50',
      badge: 'border-emerald-500 bg-emerald-500 text-white',
      title: 'text-emerald-800',
      description: 'text-emerald-700',
      status: 'text-emerald-700',
    };
  }
  if (state === 'active') {
    return {
      container: 'border-cyan-300 bg-cyan-50',
      badge: 'border-cyan-500 bg-cyan-500 text-white',
      title: 'text-cyan-800',
      description: 'text-cyan-700',
      status: 'text-cyan-700',
    };
  }
  return {
    container: 'border-slate-200 bg-slate-50',
    badge: 'border-slate-300 bg-white text-slate-500',
    title: 'text-slate-700',
    description: 'text-slate-500',
    status: 'text-slate-500',
  };
};

const getCancelTradeProgressStatusLabel = (state: CancelTradeProgressStepState) => {
  if (state === 'completed') return '완료';
  if (state === 'active') return '진행중';
  if (state === 'error') return '실패';
  return '대기';
};

const getCancelTradeProgressStyle = (state: CancelTradeProgressStepState) => {
  if (state === 'completed') {
    return {
      container: 'border-emerald-200 bg-emerald-50/70',
      badge: 'border-emerald-300 bg-emerald-100 text-emerald-700',
      title: 'text-emerald-900',
      description: 'text-emerald-700',
      status: 'text-emerald-700',
    };
  }
  if (state === 'active') {
    return {
      container: 'border-cyan-200 bg-cyan-50/70',
      badge: 'border-cyan-300 bg-cyan-100 text-cyan-700',
      title: 'text-cyan-900',
      description: 'text-cyan-700',
      status: 'text-cyan-700',
    };
  }
  if (state === 'error') {
    return {
      container: 'border-rose-200 bg-rose-50/80',
      badge: 'border-rose-300 bg-rose-100 text-rose-700',
      title: 'text-rose-900',
      description: 'text-rose-700',
      status: 'text-rose-700',
    };
  }
  return {
    container: 'border-slate-200 bg-white/90',
    badge: 'border-slate-300 bg-slate-100 text-slate-600',
    title: 'text-slate-700',
    description: 'text-slate-500',
    status: 'text-slate-500',
  };
};

const NETWORK_BY_KEY: Record<NetworkKey, NetworkOption> = {
  ethereum: {
    id: 'ethereum',
    label: 'Ethereum',
    chain: ethereum,
    contractAddress: ethereumContractAddressUSDT,
    tokenDecimals: 6,
  },
  polygon: {
    id: 'polygon',
    label: 'Polygon',
    chain: polygon,
    contractAddress: polygonContractAddressUSDT,
    tokenDecimals: 6,
  },
  arbitrum: {
    id: 'arbitrum',
    label: 'Arbitrum',
    chain: arbitrum,
    contractAddress: arbitrumContractAddressUSDT,
    tokenDecimals: 6,
  },
  bsc: {
    id: 'bsc',
    label: 'BSC',
    chain: bsc,
    contractAddress: bscContractAddressUSDT,
    tokenDecimals: 18,
  },
};

const shortAddress = (value: string) => {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const formatTimeAgo = (value: string, nowMs?: number) => {
  if (!value) return '-';
  const targetMs = Date.parse(value);
  if (!Number.isFinite(targetMs)) return '-';

  const baseNowMs = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  const diffMs = Math.max(0, baseNowMs - targetMs);
  if (diffMs < 60 * 1000) return '방금';

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}초 전`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}일 전`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}개월 전`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}년 전`;
};

const LINKABLE_TOKEN_REGEX =
  /(https?:\/\/[^\s]+|www\.[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s-]{7,}\d)/gi;
const URL_ONLY_REGEX = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i;
const EMAIL_ONLY_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PHONE_ONLY_REGEX = /^\+?\d[\d\s-]{7,}\d$/;

const splitTrailingPunctuation = (value: string) => {
  const match = value.match(/([),.;!?]+)$/);
  if (!match) {
    return { core: value, trailing: '' };
  }
  return {
    core: value.slice(0, -match[1].length),
    trailing: match[1],
  };
};

const renderTextWithAutoLinks = (text?: string | null, linkClassName?: string) => {
  if (!text) return null;
  const lines = text.split(/\r?\n/);

  return lines.map((line, lineIndex) => {
    const tokens = line.split(LINKABLE_TOKEN_REGEX);
    return (
      <React.Fragment key={`memo-line-${lineIndex}`}>
        {tokens.map((token, tokenIndex) => {
          if (!token) return null;

          const { core, trailing } = splitTrailingPunctuation(token);
          let href = '';
          if (URL_ONLY_REGEX.test(core)) {
            href = core.startsWith('http') ? core : `https://${core}`;
          } else if (EMAIL_ONLY_REGEX.test(core)) {
            href = `mailto:${core}`;
          } else if (PHONE_ONLY_REGEX.test(core)) {
            href = `tel:${core.replace(/[^+\d]/g, '')}`;
          }

          if (!href) {
            return (
              <React.Fragment key={`memo-token-${lineIndex}-${tokenIndex}`}>
                {token}
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={`memo-token-${lineIndex}-${tokenIndex}`}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName || 'underline underline-offset-2'}
              >
                {core}
              </a>
              {trailing}
            </React.Fragment>
          );
        })}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
};

const normalizeUsdtInput = (value: string) => {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const hasTrailingDot = cleaned.endsWith('.');
  const [wholeRaw, decimalRaw = ''] = cleaned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '');
  const decimal = decimalRaw.slice(0, 6);
  if (hasTrailingDot) {
    return `${whole || '0'}.`;
  }
  if (decimal.length > 0) {
    return `${whole || '0'}.${decimal}`;
  }
  return whole;
};

const normalizeKrwInput = (value: string) => {
  const cleaned = value.replace(/,/g, '').replace(/[^\d]/g, '');
  if (!cleaned) return '';
  return cleaned.replace(/^0+(?=\d)/, '');
};

const formatKrwInputWithComma = (value: string) => {
  const digits = normalizeKrwInput(value);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const formatUsdtInputFromNumber = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(6);
};

const formatUsdtDisplay = (value: number | string | null | undefined) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return '0.000000';
  }
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
};

const toDateTime = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

const formatCountdownClock = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const toTrimmedString = (value: unknown) => String(value ?? '').trim();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const waitFor = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), ms);
  });
const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const normalizeWalletAddress = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!WALLET_ADDRESS_REGEX.test(raw)) return '';
  return raw;
};
const normalizeWalletAddressList = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value: unknown) => {
    const normalized = normalizeWalletAddress(value);
    if (!normalized) return;
    const lowered = normalized.toLowerCase();
    if (seen.has(lowered)) return;
    seen.add(lowered);
    result.push(normalized);
  });
  return result;
};

const resolveBuyerBankSnapshot = (buyer: unknown) => {
  const safeBuyer = isRecord(buyer) ? buyer : null;
  const bankInfo = isRecord(safeBuyer?.bankInfo) ? safeBuyer.bankInfo : null;

  const bankName = toTrimmedString(bankInfo?.bankName ?? safeBuyer?.depositBankName);
  const accountNumber = toTrimmedString(
    bankInfo?.accountNumber ?? safeBuyer?.depositBankAccountNumber,
  );
  const accountHolder = toTrimmedString(
    bankInfo?.accountHolder ?? bankInfo?.depositName ?? safeBuyer?.depositName,
  );

  return {
    bankName,
    accountNumber,
    accountHolder,
  };
};

const normalizeSellerFromUser = (rawUser: unknown): SellerItem | null => {
  if (!isRecord(rawUser)) return null;

  const seller = isRecord(rawUser.seller) ? rawUser.seller : null;
  const walletAddress = normalizeWalletAddress(rawUser.walletAddress);
  const parsedRate = Number(seller?.usdtToKrwRate || 0);
  const rate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 1;
  const enabled = seller?.enabled === true;
  const status = String(seller?.status || '');
  const currentUsdtBalance = Number(rawUser.currentUsdtBalance || 0);
  if (!walletAddress || !enabled || status !== 'confirmed') {
    return null;
  }

  const paymentMethods = Array.isArray(seller?.paymentMethods)
    ? seller.paymentMethods.map((item: unknown) => String(item))
    : [];
  const bankInfo = (seller?.bankInfo && typeof seller.bankInfo === 'object')
    ? (seller.bankInfo as Record<string, unknown>)
    : {};

  return {
    walletAddress,
    nickname: String(rawUser.nickname || '').trim() || '판매자',
    avatar: String(rawUser.avatar || '').trim(),
    rate,
    currentUsdtBalance: Number.isFinite(currentUsdtBalance) ? Math.max(0, currentUsdtBalance) : 0,
    paymentMethods,
    bankInfo: {
      bankName: String(bankInfo?.bankName || ''),
      accountNumber: String(bankInfo?.accountNumber || ''),
      accountHolder: String(bankInfo?.accountHolder || ''),
      contactMemo: String(bankInfo?.contactMemo || ''),
    },
  };
};

const normalizeBuyHistoryOrder = (order: unknown): BuyHistoryItem | null => {
  if (!isRecord(order)) return null;
  const seller = isRecord(order?.seller) ? order.seller : null;
  const sellerBankInfo = isRecord(seller?.bankInfo) ? seller.bankInfo : null;
  const tradeId = toTrimmedString(order.tradeId);
  const id =
    toTrimmedString(order._id) ||
    toTrimmedString(order.orderId) ||
    tradeId;
  if (!id) return null;

  return {
    id,
    tradeId,
    status: toTrimmedString(order.status),
    usdtAmount: Number(order.usdtAmount || 0),
    krwAmount: Number(order.krwAmount || 0),
    rate: Number(order.rate || 0),
    createdAt: toTrimmedString(order.createdAt),
    paymentRequestedAt: toTrimmedString(order.paymentRequestedAt),
    paymentConfirmedAt: toTrimmedString(order.paymentConfirmedAt),
    cancelledAt: toTrimmedString(order.cancelledAt),
    sellerWalletAddress: toTrimmedString(seller?.walletAddress),
    sellerNickname: toTrimmedString(seller?.nickname),
    sellerBankName: toTrimmedString(sellerBankInfo?.bankName),
    sellerAccountNumber: toTrimmedString(sellerBankInfo?.accountNumber),
    paymentMethod: toTrimmedString(order.paymentMethod),
  };
};

const extractBuyHistoryOrders = (data: unknown): BuyHistoryItem[] => {
  const payload = isRecord(data) ? data : null;
  const result = isRecord(payload?.result) ? payload.result : null;
  const orders: unknown[] = Array.isArray(result?.orders) ? result.orders : [];
  return orders
    .map((order: unknown): BuyHistoryItem | null => normalizeBuyHistoryOrder(order))
    .filter((item: BuyHistoryItem | null): item is BuyHistoryItem => item !== null);
};

export default function BuyUsdtPage({
  params,
}: {
  params: { lang: string };
}) {
  const lang = params?.lang || 'ko';
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const sellerFromQuery = String(searchParams?.get('seller') || '').trim();
  const disconnectRedirectPath = useMemo(() => {
    const query = new URLSearchParams();
    if (storecode) {
      query.set('storecode', storecode);
    }
    const queryString = query.toString();
    return `/${lang}/wallet-management${queryString ? `?${queryString}` : ''}`;
  }, [lang, storecode]);

  const { chain } = useClientSettings();
  const activeAccount = useActiveAccount();
  const { wallet, wallets, smartAccountEnabled } = useClientWallets({
    authOptions: WALLET_AUTH_OPTIONS,
    sponsorGas: true,
    defaultSmsCountryCode: 'KR',
  });

  const activeNetwork = useMemo(
    () => NETWORK_BY_KEY[chain] ?? NETWORK_BY_KEY.polygon,
    [chain],
  );
  const contract = useMemo(
    () =>
      getContract({
        client,
        chain: activeNetwork.chain,
        address: activeNetwork.contractAddress,
      }),
    [activeNetwork],
  );

  const [balance, setBalance] = useState(0);

  const [sellers, setSellers] = useState<SellerItem[]>([]);
  const [sellerPickerSellers, setSellerPickerSellers] = useState<SellerItem[]>([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [sellersError, setSellersError] = useState<string | null>(null);
  const [selectedSellerWallet, setSelectedSellerWallet] = useState(sellerFromQuery);
  const [configuredSellerWalletCount, setConfiguredSellerWalletCount] = useState(0);
  const [selectedStoreInfo, setSelectedStoreInfo] = useState<StoreDisplayInfo | null>(null);
  const [sellerKeyword, setSellerKeyword] = useState('');
  const [sellerPickerOpen, setSellerPickerOpen] = useState(false);
  const [sellerSortOption, setSellerSortOption] = useState<'rate' | 'balance'>('rate');

  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile | null>(null);
  const [loadingBuyerProfile, setLoadingBuyerProfile] = useState(false);
  const [buyerProfileModalOpen, setBuyerProfileModalOpen] = useState(false);
  const [buyerNicknameInput, setBuyerNicknameInput] = useState('');
  const [buyerDepositNameInput, setBuyerDepositNameInput] = useState('');
  const [savingBuyerProfile, setSavingBuyerProfile] = useState(false);
  const [buyerProfileModalForceNextStep, setBuyerProfileModalForceNextStep] = useState(false);
  const [storeMemberProfile, setStoreMemberProfile] = useState<StoreMemberProfile | null>(null);
  const [loadingStoreMemberProfile, setLoadingStoreMemberProfile] = useState(false);
  const [storeMemberProfileError, setStoreMemberProfileError] = useState<string | null>(null);
  const [storeMemberLinkNicknameInput, setStoreMemberLinkNicknameInput] = useState('');
  const [storeMemberLinkPasswordInput, setStoreMemberLinkPasswordInput] = useState('');
  const [linkingStoreMember, setLinkingStoreMember] = useState(false);
  const storeMemberProfileRequestIdRef = useRef(0);

  const [amountInput, setAmountInput] = useState('');
  const [krwInput, setKrwInput] = useState('');
  const [lastEditedAmountType, setLastEditedAmountType] = useState<'usdt' | 'krw'>('usdt');
  const [selectedQuickAmount, setSelectedQuickAmount] = useState<number | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submittingBuy, setSubmittingBuy] = useState(false);
  const [buyOrderProgressPhase, setBuyOrderProgressPhase] =
    useState<BuyOrderProgressPhase>('idle');
  const [buyOrderProgressSummary, setBuyOrderProgressSummary] = useState('구매 신청 전입니다.');
  const [buyOrderProgressSteps, setBuyOrderProgressSteps] =
    useState<BuyOrderProgressStepItem[]>(() => createInitialBuyOrderProgressSteps());
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelingTrade, setCancelingTrade] = useState(false);
  const [cancelTradeProgressPhase, setCancelTradeProgressPhase] =
    useState<CancelTradeProgressPhase>('idle');
  const [cancelTradeProgressSummary, setCancelTradeProgressSummary] = useState('취소 요청 전입니다.');
  const [cancelTradeProgressSteps, setCancelTradeProgressSteps] =
    useState<CancelTradeProgressStepItem[]>(() => createInitialCancelTradeProgressSteps());

  const [chatSessionToken, setChatSessionToken] = useState<string | null>(null);
  const [chatChannelUrl, setChatChannelUrl] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatRefreshToken, setChatRefreshToken] = useState(0);
  const [privateTradeStatus, setPrivateTradeStatus] = useState<PrivateTradeStatusResult | null>(null);
  const [loadingPrivateTradeStatus, setLoadingPrivateTradeStatus] = useState(false);
  const [countdownNowMs, setCountdownNowMs] = useState<number>(() => Date.now());
  const [buyTab, setBuyTab] = useState<'buy' | 'history'>('buy');
  const [buyHistory, setBuyHistory] = useState<BuyHistoryItem[]>([]);
  const [loadingBuyHistory, setLoadingBuyHistory] = useState(false);
  const [latestBuyHistoryItem, setLatestBuyHistoryItem] = useState<BuyHistoryItem | null>(null);
  const [loadingLatestBuyHistory, setLoadingLatestBuyHistory] = useState(false);
  const [latestHistoryNowMs, setLatestHistoryNowMs] = useState<number>(() => Date.now());
  const [purchaseCompleteJackpot, setPurchaseCompleteJackpot] = useState<PurchaseCompleteJackpot | null>(null);
  const [recentEscrowCompletedTradeId, setRecentEscrowCompletedTradeId] = useState('');
  const buyOrderProgressListRef = useRef<HTMLDivElement | null>(null);
  const cancelTradeProgressListRef = useRef<HTMLDivElement | null>(null);
  const privateTradeStatusRequestIdRef = useRef(0);
  const buyerProfileRequestIdRef = useRef(0);
  const buyerProfileLoadingRequestIdRef = useRef(0);
  const paymentRequestedWatchRef = useRef<{ orderId: string; tradeId: string; usdtAmount: number } | null>(null);
  const jackpotShownOrderKeysRef = useRef<Set<string>>(new Set());

  const openSellerPicker = useCallback(() => {
    setSellerKeyword('');
    setSellerPickerOpen(true);
  }, []);

  const selectedSeller = useMemo(
    () =>
      sellers.find(
        (item) => item.walletAddress.toLowerCase() === selectedSellerWallet.toLowerCase(),
      ) ||
      sellerPickerSellers.find(
        (item) => item.walletAddress.toLowerCase() === selectedSellerWallet.toLowerCase(),
      ) ||
      null,
    [sellerPickerSellers, sellers, selectedSellerWallet],
  );
  const activePrivateTradeOrder = useMemo(
    () => (privateTradeStatus?.isTrading && privateTradeStatus.order ? privateTradeStatus.order : null),
    [privateTradeStatus],
  );
  const activePrivateTradeChannelUrl = useMemo(
    () => toTrimmedString(activePrivateTradeOrder?.consentChannelUrl),
    [activePrivateTradeOrder?.consentChannelUrl],
  );
  const activePrivateTradeConsentAccepted = useMemo(() => {
    if (!activePrivateTradeOrder) return false;
    const status = toTrimmedString(activePrivateTradeOrder.consentStatus).toLowerCase();
    return activePrivateTradeOrder.consentAccepted === true || status === 'accepted';
  }, [activePrivateTradeOrder]);
  const activePrivateTradeConsentRequestedAt = useMemo(
    () => toTrimmedString(activePrivateTradeOrder?.consentRequestedAt),
    [activePrivateTradeOrder?.consentRequestedAt],
  );
  const activePrivateTradeConsentAcceptedAt = useMemo(
    () => toTrimmedString(activePrivateTradeOrder?.consentAcceptedAt),
    [activePrivateTradeOrder?.consentAcceptedAt],
  );
  const hasActivePrivateTradeOrder = Boolean(activePrivateTradeOrder?.orderId);
  const hasActivePrivateTradeChatChannel = Boolean(
    activePrivateTradeOrder?.orderId && activePrivateTradeChannelUrl,
  );
  const activeTradeDepositInfo = useMemo(() => {
    if (!activePrivateTradeOrder) return null;

    const bankName = String(
      activePrivateTradeOrder.paymentBankName || selectedSeller?.bankInfo?.bankName || '',
    ).trim();
    const accountNumber = String(
      activePrivateTradeOrder.paymentAccountNumber || selectedSeller?.bankInfo?.accountNumber || '',
    ).trim();
    const accountHolder = String(
      activePrivateTradeOrder.paymentAccountHolder || selectedSeller?.bankInfo?.accountHolder || '',
    ).trim();
    const contactMemo = String(
      activePrivateTradeOrder.paymentContactMemo || selectedSeller?.bankInfo?.contactMemo || '',
    ).trim();
    const paymentMethod = String(activePrivateTradeOrder.paymentMethod || '').trim().toLowerCase();
    const isContactTransfer =
      Boolean(activePrivateTradeOrder.isContactTransfer)
      || bankName === '연락처송금'
      || paymentMethod === 'contact';

    return {
      bankName,
      accountNumber,
      accountHolder,
      contactMemo,
      isContactTransfer,
    };
  }, [activePrivateTradeOrder, selectedSeller?.bankInfo]);
  const filteredSellers = useMemo(() => {
    const sorted = [...sellerPickerSellers];
    if (sellerSortOption === 'rate') {
      sorted.sort((a, b) => {
        if (a.rate !== b.rate) return a.rate - b.rate;
        return b.currentUsdtBalance - a.currentUsdtBalance;
      });
    } else {
      sorted.sort((a, b) => {
        if (b.currentUsdtBalance !== a.currentUsdtBalance) return b.currentUsdtBalance - a.currentUsdtBalance;
        return a.rate - b.rate;
      });
    }

    const keyword = sellerKeyword.trim().toLowerCase();
    if (!keyword) return sorted;
    return sorted.filter((item) => {
      return (
        item.nickname.toLowerCase().includes(keyword) ||
        item.walletAddress.toLowerCase().includes(keyword)
      );
    });
  }, [sellerKeyword, sellerPickerSellers, sellerSortOption]);

  const usdtAmount = useMemo(() => {
    const parsed = Number(amountInput);
    if (!Number.isFinite(parsed)) return 0;
    return parsed > 0 ? parsed : 0;
  }, [amountInput]);
  const krwAmount = useMemo(() => {
    const parsed = Number(krwInput);
    if (!Number.isFinite(parsed)) return 0;
    return parsed > 0 ? Math.floor(parsed) : 0;
  }, [krwInput]);
  const krwDisplayInput = useMemo(() => formatKrwInputWithComma(krwInput), [krwInput]);
  const estimatedKrwAmount = useMemo(() => {
    if (krwAmount > 0) return krwAmount;
    if (!selectedSeller || usdtAmount <= 0) return 0;
    return Math.floor(usdtAmount * selectedSeller.rate);
  }, [krwAmount, selectedSeller, usdtAmount]);
  const buyerProfileNickname = useMemo(() => toTrimmedString(buyerProfile?.nickname), [buyerProfile?.nickname]);
  const buyerDepositName = useMemo(() => toTrimmedString(buyerProfile?.depositName), [buyerProfile?.depositName]);
  const hasBuyerProfileForPurchase = useMemo(
    () => Boolean(buyerProfileNickname && buyerDepositName),
    [buyerProfileNickname, buyerDepositName],
  );
  const fallbackBuyerNickname = useMemo(() => {
    if (!activeAccount?.address) return '';
    return `user_${activeAccount.address.replace(/^0x/i, '').slice(0, 6)}`;
  }, [activeAccount?.address]);
  const isStoreScopedPurchase = useMemo(
    () => Boolean(storecode && storecode.toLowerCase() !== 'admin'),
    [storecode],
  );
  const buyerProfileLookupStorecode = useMemo(
    () => storecode || 'admin',
    [storecode],
  );
  const hasStoreMemberProfile = Boolean(storeMemberProfile);
  const storeMemberBankSnapshot = useMemo(
    () => resolveBuyerBankSnapshot(storeMemberProfile?.buyer),
    [storeMemberProfile?.buyer],
  );
  const storeMemberAccountHolder = toTrimmedString(storeMemberBankSnapshot.accountHolder);
  const needsStoreMemberLinkForPurchase = isStoreScopedPurchase && !hasStoreMemberProfile;
  const shouldShowBuyerProfileNextStep = !loadingBuyerProfile && (
    buyerProfileModalForceNextStep
    || !hasBuyerProfileForPurchase
    || needsStoreMemberLinkForPurchase
  );
  const canBuyByStoreMemberRule = !isStoreScopedPurchase || hasStoreMemberProfile;
  const buyerDisplayName = useMemo(() => {
    if (buyerProfileNickname) return buyerProfileNickname;
    return fallbackBuyerNickname;
  }, [buyerProfileNickname, fallbackBuyerNickname]);
  const hasEnoughSellerBalance = Boolean(
    selectedSeller && usdtAmount > 0 && usdtAmount <= selectedSeller.currentUsdtBalance,
  );
  const isSelectedSellerBuyer = Boolean(
    activeAccount?.address &&
      selectedSeller?.walletAddress &&
      activeAccount.address.toLowerCase() === selectedSeller.walletAddress.toLowerCase(),
  );
  const canSubmitBuy = Boolean(
    activeAccount?.address &&
      canBuyByStoreMemberRule &&
      hasBuyerProfileForPurchase &&
      selectedSeller &&
      !isSelectedSellerBuyer &&
      usdtAmount > 0 &&
      estimatedKrwAmount > 0 &&
      hasEnoughSellerBalance &&
      !submittingBuy,
  );
  const shouldShowSelfSellerChatAlert = Boolean(
    activeAccount?.address &&
      selectedSeller &&
      isSelectedSellerBuyer,
  );
  const shouldHideSellerReselectControls = configuredSellerWalletCount === 1;
  const canCancelActiveTrade = Boolean(
    activePrivateTradeOrder?.orderId && activePrivateTradeOrder.status === 'paymentRequested',
  );
  const cancelTradeProgressPhaseMeta = useMemo(() => {
    if (cancelTradeProgressPhase === 'completed') {
      return {
        container: 'border-emerald-200 bg-emerald-50/70',
        badge: 'border-emerald-300 bg-emerald-100 text-emerald-700',
        summary: 'text-emerald-700',
        label: '완료',
      };
    }
    if (cancelTradeProgressPhase === 'processing') {
      return {
        container: 'border-cyan-200 bg-cyan-50/70',
        badge: 'border-cyan-300 bg-cyan-100 text-cyan-700',
        summary: 'text-cyan-700',
        label: '진행중',
      };
    }
    if (cancelTradeProgressPhase === 'error') {
      return {
        container: 'border-rose-200 bg-rose-50/70',
        badge: 'border-rose-300 bg-rose-100 text-rose-700',
        summary: 'text-rose-700',
        label: '오류',
      };
    }
    return {
      container: 'border-slate-200 bg-white/90',
      badge: 'border-slate-300 bg-slate-100 text-slate-600',
      summary: 'text-slate-600',
      label: '대기',
    };
  }, [cancelTradeProgressPhase]);
  const buyOrderProgressPhaseMeta = useMemo(() => {
    if (buyOrderProgressPhase === 'completed') {
      return {
        container: 'border-emerald-200 bg-emerald-50/70',
        badge: 'border-emerald-300 bg-emerald-100 text-emerald-700',
        summary: 'text-emerald-700',
        label: '완료',
      };
    }
    if (buyOrderProgressPhase === 'processing') {
      return {
        container: 'border-cyan-200 bg-cyan-50/70',
        badge: 'border-cyan-300 bg-cyan-100 text-cyan-700',
        summary: 'text-cyan-700',
        label: '진행중',
      };
    }
    if (buyOrderProgressPhase === 'error') {
      return {
        container: 'border-rose-200 bg-rose-50/70',
        badge: 'border-rose-300 bg-rose-100 text-rose-700',
        summary: 'text-rose-700',
        label: '오류',
      };
    }
    return {
      container: 'border-slate-200 bg-white/90',
      badge: 'border-slate-300 bg-slate-100 text-slate-600',
      summary: 'text-slate-600',
      label: '대기',
    };
  }, [buyOrderProgressPhase]);
  const paymentRequestCountdown = useMemo(() => {
    if (!activePrivateTradeOrder || activePrivateTradeOrder.status !== 'paymentRequested') {
      return null;
    }

    const startedAtRaw =
      activePrivateTradeOrder.paymentRequestedAt || activePrivateTradeOrder.createdAt || '';
    const startedAtMs = Date.parse(startedAtRaw);
    if (!Number.isFinite(startedAtMs)) {
      return null;
    }

    const deadlineMs = startedAtMs + PRIVATE_TRADE_PAYMENT_WINDOW_MS;
    const remainingMs = Math.max(0, deadlineMs - countdownNowMs);
    const elapsedMs = Math.max(0, countdownNowMs - startedAtMs);
    const remainingRatio = Math.min(
      1,
      Math.max(0, 1 - elapsedMs / PRIVATE_TRADE_PAYMENT_WINDOW_MS),
    );

    return {
      startedAtMs,
      deadlineMs,
      remainingMs,
      remainingRatio,
      isExpired: remainingMs <= 0,
    };
  }, [activePrivateTradeOrder, countdownNowMs]);
  const paymentRequestStartedAtMs = paymentRequestCountdown?.startedAtMs ?? 0;
  const buyTabLabel = useMemo(
    () => (buyTab === 'buy' ? '구매하기' : '구매내역'),
    [buyTab],
  );
  const latestBuyHistoryDisplayAt = useMemo(() => {
    if (!latestBuyHistoryItem) return '';
    return (
      latestBuyHistoryItem.paymentConfirmedAt ||
      latestBuyHistoryItem.cancelledAt ||
      latestBuyHistoryItem.paymentRequestedAt ||
      latestBuyHistoryItem.createdAt
    );
  }, [latestBuyHistoryItem]);
  const latestBuyHistoryTimeAgo = useMemo(
    () => formatTimeAgo(latestBuyHistoryDisplayAt, latestHistoryNowMs),
    [latestBuyHistoryDisplayAt, latestHistoryNowMs],
  );
  const isLatestBuyJustNow = latestBuyHistoryTimeAgo === '방금';
  const latestBuyHistoryItemId = latestBuyHistoryItem?.id || '';
  const latestHistoryPollingMs = activePrivateTradeOrder?.status === 'paymentRequested' ? 4000 : 15000;

  const primaryLabel = useMemo(() => {
    if (submittingBuy) {
      return '구매 신청 처리 중...';
    }
    if (!activeAccount?.address) {
      return '지갑 연결 후 진행';
    }
    if (isStoreScopedPurchase && loadingStoreMemberProfile) {
      return '가맹점 회원 확인 중...';
    }
    if (isStoreScopedPurchase && !hasStoreMemberProfile) {
      return '가맹점 회원 연동 필요';
    }
    if (!hasBuyerProfileForPurchase) {
      return '구매자 정보 불러오는중';
    }
    if (!selectedSeller) {
      return sellerFromQuery ? '판매자 정보 확인 필요' : '판매자 선택하기';
    }
    if (isSelectedSellerBuyer) {
      return '판매자 다시 선택하기';
    }
    if (usdtAmount <= 0) {
      return '구매 수량/금액 입력하기';
    }
    if (!hasEnoughSellerBalance) {
      return '판매 가능 수량 초과';
    }
    return `${formatUsdtDisplay(usdtAmount)} USDT 구매 신청`;
  }, [
    submittingBuy,
    activeAccount?.address,
    isStoreScopedPurchase,
    loadingStoreMemberProfile,
    hasStoreMemberProfile,
    hasBuyerProfileForPurchase,
    selectedSeller,
    sellerFromQuery,
    isSelectedSellerBuyer,
    usdtAmount,
    hasEnoughSellerBalance,
  ]);

  const escrowFlowPhase = useMemo<EscrowFlowPhase>(() => {
    if (submittingBuy) {
      return 'SUBMITTING';
    }

    const activeStatus = String(activePrivateTradeOrder?.status || '').trim();
    if (activeStatus === 'ordered') {
      return 'ORDERED';
    }
    if (activeStatus === 'accepted') {
      return 'ACCEPTED';
    }
    if (activeStatus === 'paymentRequested') {
      return 'PAYMENT_REQUESTED';
    }

    const latestTradeId = String(latestBuyHistoryItem?.tradeId || '').trim();
    const latestStatus = String(latestBuyHistoryItem?.status || '').trim();
    if (
      recentEscrowCompletedTradeId
      && latestStatus === 'paymentConfirmed'
      && latestTradeId
      && latestTradeId === recentEscrowCompletedTradeId
    ) {
      return 'COMPLETED';
    }

    return 'IDLE';
  }, [
    submittingBuy,
    activePrivateTradeOrder?.status,
    latestBuyHistoryItem?.status,
    latestBuyHistoryItem?.tradeId,
    recentEscrowCompletedTradeId,
  ]);

  const escrowFlowStatusLabel = useMemo(() => {
    if (escrowFlowPhase === 'SUBMITTING') return '에스크로 처리 시작';
    if (escrowFlowPhase === 'ORDERED' || escrowFlowPhase === 'ACCEPTED') return '에스크로 잠금 진행중';
    if (escrowFlowPhase === 'PAYMENT_REQUESTED') return '입금 확인 대기';
    if (escrowFlowPhase === 'COMPLETED') return '구매 완료';
    return '구매 신청 전';
  }, [escrowFlowPhase]);

  const escrowFlowSummary = useMemo(() => {
    if (escrowFlowPhase === 'SUBMITTING') {
      return '구매 신청과 에스크로 잠금 요청을 처리 중입니다.';
    }
    if (escrowFlowPhase === 'ORDERED') {
      return '주문 생성 후 에스크로 잠금이 진행되고 있습니다.';
    }
    if (escrowFlowPhase === 'ACCEPTED') {
      return activePrivateTradeConsentAccepted
        ? '이용동의가 완료되었습니다. 입금 안내를 확인해 주세요.'
        : '주문 채팅에서 "동의함"을 입력하면 입금 단계로 진행됩니다.';
    }
    if (escrowFlowPhase === 'PAYMENT_REQUESTED') {
      if (paymentRequestCountdown?.isExpired) {
        return '입금 제한 시간이 만료되었습니다. 거래 취소 후 다시 신청해 주세요.';
      }
      if (!activePrivateTradeConsentAccepted) {
        return '이용동의 확인 대기중입니다. 주문 채팅에 "동의함"을 입력해 주세요.';
      }
      return '입금 정보 확인 후 30분 내 입금을 완료해 주세요.';
    }
    if (escrowFlowPhase === 'COMPLETED') {
      return '입금 확인이 완료되어 구매가 정상 종료되었습니다.';
    }
    return '구매 버튼을 누르면 에스크로 처리 단계가 실시간으로 표시됩니다.';
  }, [activePrivateTradeConsentAccepted, escrowFlowPhase, paymentRequestCountdown?.isExpired]);

  const escrowFlowSteps = useMemo<EscrowFlowStepItem[]>(() => {
    let stepStates: EscrowFlowStepState[] = ['active', 'pending', 'pending', 'pending', 'pending'];

    if (escrowFlowPhase === 'SUBMITTING') {
      stepStates = ['active', 'pending', 'pending', 'pending', 'pending'];
    } else if (escrowFlowPhase === 'ORDERED') {
      stepStates = ['completed', 'active', 'pending', 'pending', 'pending'];
    } else if (escrowFlowPhase === 'ACCEPTED') {
      stepStates = activePrivateTradeConsentAccepted
        ? ['completed', 'completed', 'completed', 'active', 'pending']
        : ['completed', 'completed', 'active', 'pending', 'pending'];
    } else if (escrowFlowPhase === 'PAYMENT_REQUESTED') {
      stepStates = activePrivateTradeConsentAccepted
        ? ['completed', 'completed', 'completed', 'active', 'pending']
        : ['completed', 'completed', 'active', 'pending', 'pending'];
    } else if (escrowFlowPhase === 'COMPLETED') {
      stepStates = ['completed', 'completed', 'completed', 'completed', 'completed'];
    }

    return ESCROW_FLOW_STEP_DEFINITIONS.map((step, index) => {
      let description: string = step.description;
      if (step.key === 'consent-check') {
        if (activePrivateTradeConsentAccepted) {
          const acceptedAtLabel = formatDateTime(activePrivateTradeConsentAcceptedAt);
          description = acceptedAtLabel !== '-'
            ? `구매자가 이용동의를 완료했습니다. (${acceptedAtLabel})`
            : '구매자가 이용동의를 완료했습니다.';
        } else {
          const requestedAtLabel = formatDateTime(activePrivateTradeConsentRequestedAt);
          description = requestedAtLabel !== '-'
            ? `주문 채팅에서 "동의함" 입력을 기다리는 중입니다. (요청 ${requestedAtLabel})`
            : '주문 채팅에서 "동의함" 입력을 기다리는 중입니다.';
        }
      }
      return {
        key: step.key,
        title: step.title,
        description,
        state: stepStates[index] || 'pending',
      };
    });
  }, [
    activePrivateTradeConsentAccepted,
    activePrivateTradeConsentAcceptedAt,
    activePrivateTradeConsentRequestedAt,
    escrowFlowPhase,
  ]);

  const loadBalance = useCallback(async () => {
    if (!activeAccount?.address) {
      setBalance(0);
      return;
    }

    try {
      const result = await balanceOf({
        contract,
        address: activeAccount.address,
      });
      setBalance(Number(result) / 10 ** activeNetwork.tokenDecimals);
    } catch (error) {
      console.error('Failed to load buyer usdt balance', error);
    }
  }, [activeAccount?.address, contract, activeNetwork.tokenDecimals]);

  const loadSellers = useCallback(async () => {
    setLoadingSellers(true);
    setSellersError(null);
    try {
      let walletAddressesFilter: string[] = [];
      let shouldPickSingleFallbackSeller = false;

      if (storecode) {
        const storeResponse = await fetch('/api/store/getOneStore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storecode }),
        });
        const storeData = await storeResponse.json().catch(() => ({}));
        if (!storeResponse.ok) {
          throw new Error(String(storeData?.error || '가맹점 정보를 불러오지 못했습니다.'));
        }

        const storeResult = isRecord(storeData?.result) ? storeData.result : null;
        if (storeResult) {
          setSelectedStoreInfo({
            storecode: toTrimmedString(storeResult.storecode || storecode),
            storeName: toTrimmedString(storeResult.storeName || storecode),
            storeLogo: toTrimmedString(storeResult.storeLogo),
          });
        } else {
          setSelectedStoreInfo(null);
        }
        walletAddressesFilter = normalizeWalletAddressList(
          Array.isArray(storeResult?.sellerWalletAddresses) ? storeResult.sellerWalletAddresses : [],
        );
        if (walletAddressesFilter.length === 0) {
          shouldPickSingleFallbackSeller = true;
        }
      } else {
        setSelectedStoreInfo(null);
      }
      setConfiguredSellerWalletCount(walletAddressesFilter.length);

      const sellerRequestBody: Record<string, unknown> = {
        storecode: walletAddressesFilter.length > 0 ? (storecode || 'admin') : 'admin',
        limit: shouldPickSingleFallbackSeller ? 200 : Math.max(40, walletAddressesFilter.length),
        page: 1,
      };
      if (walletAddressesFilter.length > 0) {
        sellerRequestBody.walletAddresses = walletAddressesFilter;
      }

      const response = await fetch('/api/user/getAllSellersForBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sellerRequestBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '판매자 목록을 불러오지 못했습니다.');
      }
      const source: unknown[] = Array.isArray(data?.result?.users) ? data.result.users : [];

      const normalizedAll = source
        .map((rawUser) => normalizeSellerFromUser(rawUser))
        .filter((item): item is SellerItem => item !== null);

      const normalized = walletAddressesFilter.length > 0
        ? normalizedAll.filter((item) =>
          walletAddressesFilter.some((walletAddress) => walletAddress.toLowerCase() === item.walletAddress.toLowerCase()))
        : normalizedAll;
      const sellerFromQueryMatch = sellerFromQuery
        ? normalized.find((item) => item.walletAddress.toLowerCase() === sellerFromQuery.toLowerCase()) || null
        : null;

      let pickerSellers = [...normalized];
      if (walletAddressesFilter.length > 0) {
        const orderMap = new Map<string, number>();
        walletAddressesFilter.forEach((walletAddress, index) => {
          orderMap.set(walletAddress.toLowerCase(), index);
        });
        pickerSellers.sort((a, b) => {
          const aIndex = orderMap.get(a.walletAddress.toLowerCase());
          const bIndex = orderMap.get(b.walletAddress.toLowerCase());
          return (aIndex ?? Number.MAX_SAFE_INTEGER) - (bIndex ?? Number.MAX_SAFE_INTEGER);
        });
      } else {
        pickerSellers.sort((a, b) => {
          if (sellerSortOption === 'rate') {
            if (a.rate !== b.rate) return a.rate - b.rate;
            return b.currentUsdtBalance - a.currentUsdtBalance;
          }
          if (b.currentUsdtBalance !== a.currentUsdtBalance) {
            return b.currentUsdtBalance - a.currentUsdtBalance;
          }
          return a.rate - b.rate;
        });
      }

      setSellerPickerSellers(pickerSellers);

      let nextSellers = pickerSellers;
      if (walletAddressesFilter.length === 0) {
        if (shouldPickSingleFallbackSeller) {
          if (sellerFromQueryMatch) {
            nextSellers = [sellerFromQueryMatch];
          } else if (nextSellers.length > 1) {
            nextSellers = [nextSellers[0]];
          }
        } else if (sellerFromQueryMatch && nextSellers.length > 1) {
          nextSellers = [
            sellerFromQueryMatch,
            ...nextSellers.filter((item) => item.walletAddress.toLowerCase() !== sellerFromQueryMatch.walletAddress.toLowerCase()),
          ];
        }
      }

      setSellers(nextSellers);
      setSelectedSellerWallet((prev) => {
        if (sellerFromQuery) {
          const matched = nextSellers.find(
            (item) => item.walletAddress.toLowerCase() === sellerFromQuery.toLowerCase(),
          );
          if (matched) return matched.walletAddress;
        }
        if (walletAddressesFilter.length === 1) {
          const matchedSingle = nextSellers.find(
            (item) => item.walletAddress.toLowerCase() === walletAddressesFilter[0].toLowerCase(),
          );
          return matchedSingle?.walletAddress || walletAddressesFilter[0];
        }
        if (prev && nextSellers.some((item) => item.walletAddress.toLowerCase() === prev.toLowerCase())) {
          return prev;
        }
        return nextSellers[0]?.walletAddress || '';
      });
    } catch (error) {
      console.error('Failed to load sellers', error);
      setSellersError(error instanceof Error ? error.message : '판매자 목록을 불러오지 못했습니다.');
      setSellers([]);
      setSellerPickerSellers([]);
      setSelectedStoreInfo(null);
    } finally {
      setLoadingSellers(false);
    }
  }, [sellerFromQuery, sellerSortOption, storecode]);

  const loadPrivateTradeStatus = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = privateTradeStatusRequestIdRef.current + 1;
    privateTradeStatusRequestIdRef.current = requestId;
    const isSilent = options?.silent === true;
    const isLatestRequest = () => requestId === privateTradeStatusRequestIdRef.current;

    if (!activeAccount?.address || !selectedSeller?.walletAddress) {
      if (isLatestRequest()) {
        setPrivateTradeStatus(null);
      }
      return;
    }

    if (!isSilent && isLatestRequest()) {
      setLoadingPrivateTradeStatus(true);
    }
    try {
      const response = await fetch('/api/order/getPrivateTradeStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerWalletAddress: activeAccount.address,
          sellerWalletAddress: selectedSeller.walletAddress,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '거래 상태를 조회하지 못했습니다.');
      }

      if (!isLatestRequest()) {
        return;
      }

      const result = data?.result && typeof data.result === 'object'
        ? (data.result as PrivateTradeStatusResult)
        : null;
      const status = String(result?.order?.status || result?.status || '');

      if (result?.isTrading && result?.order && TRADABLE_STATUSES.has(status)) {
        setPrivateTradeStatus({
          isTrading: true,
          status: status || null,
          order: result.order,
        });
      } else {
        setPrivateTradeStatus(null);
      }
    } catch (error) {
      console.error('Failed to load private trade status', error);
      if (isLatestRequest()) {
        setPrivateTradeStatus(null);
      }
    } finally {
      if (!isSilent && isLatestRequest()) {
        setLoadingPrivateTradeStatus(false);
      }
    }
  }, [activeAccount?.address, selectedSeller?.walletAddress]);

  const loadBuyerProfile = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const requestId = buyerProfileRequestIdRef.current + 1;
    buyerProfileRequestIdRef.current = requestId;
    const loadingStartedAt = Date.now();
    if (!silent) {
      buyerProfileLoadingRequestIdRef.current = requestId;
    }

    if (!activeAccount?.address) {
      setBuyerProfile(null);
      if (!silent && requestId === buyerProfileLoadingRequestIdRef.current) {
        setLoadingBuyerProfile(false);
      }
      return;
    }
    if (!silent) {
      setLoadingBuyerProfile(true);
    }
    try {
      const response = await fetch('/api/user/getUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: buyerProfileLookupStorecode,
          walletAddress: activeAccount.address,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '회원 정보를 불러오지 못했습니다.');
      }
      if (requestId !== buyerProfileRequestIdRef.current) {
        return;
      }
      if (data?.result && typeof data.result === 'object') {
        const result = data.result as Record<string, unknown>;
        const buyerRaw = result.buyer;
        const buyer =
          buyerRaw && typeof buyerRaw === 'object'
            ? (buyerRaw as Record<string, unknown>)
            : null;
        const bankInfoRaw = buyer?.bankInfo;
        const bankInfo =
          bankInfoRaw && typeof bankInfoRaw === 'object'
            ? (bankInfoRaw as Record<string, unknown>)
            : null;
        const depositName = toTrimmedString(
          bankInfo?.accountHolder ?? bankInfo?.depositName ?? buyer?.depositName,
        );
        setBuyerProfile({
          nickname: toTrimmedString(result.nickname),
          avatar: toTrimmedString(result.avatar),
          depositName,
          buyer,
        });
      } else {
        setBuyerProfile(null);
      }
    } catch (error) {
      console.error('Failed to load buyer profile', error);
      if (requestId !== buyerProfileRequestIdRef.current) {
        return;
      }
      setBuyerProfile(null);
    } finally {
      if (!silent) {
        const elapsed = Date.now() - loadingStartedAt;
        const remaining = Math.max(0, BUYER_PROFILE_LOADING_MIN_MS - elapsed);
        if (remaining > 0) {
          await waitFor(remaining);
        }
        if (requestId === buyerProfileLoadingRequestIdRef.current) {
          setLoadingBuyerProfile(false);
        }
      }
    }
  }, [activeAccount?.address, buyerProfileLookupStorecode]);

  const loadStoreMemberProfile = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const requestId = storeMemberProfileRequestIdRef.current + 1;
    storeMemberProfileRequestIdRef.current = requestId;

    if (!activeAccount?.address || !isStoreScopedPurchase) {
      setStoreMemberProfile(null);
      setStoreMemberProfileError(null);
      if (!silent) {
        setLoadingStoreMemberProfile(false);
      }
      return;
    }

    if (!silent) {
      setLoadingStoreMemberProfile(true);
    }
    try {
      const response = await fetch('/api/user/getUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode,
          walletAddress: activeAccount.address,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '가맹점 회원 정보를 조회하지 못했습니다.');
      }

      if (requestId !== storeMemberProfileRequestIdRef.current) {
        return;
      }

      const member = data?.result;
      if (member && typeof member === 'object') {
        setStoreMemberProfile({
          nickname: toTrimmedString(member?.nickname),
          buyer:
            member?.buyer && typeof member.buyer === 'object'
              ? (member.buyer as Record<string, unknown>)
              : null,
        });
        setStoreMemberProfileError(null);
        setStoreMemberLinkNicknameInput('');
        setStoreMemberLinkPasswordInput('');
      } else {
        setStoreMemberProfile(null);
        setStoreMemberProfileError(null);
      }
    } catch (error) {
      console.error('Failed to load store member profile', error);
      if (requestId !== storeMemberProfileRequestIdRef.current) {
        return;
      }
      setStoreMemberProfile(null);
      setStoreMemberProfileError(
        error instanceof Error ? error.message : '가맹점 회원 정보를 불러오지 못했습니다.',
      );
    } finally {
      if (!silent && requestId === storeMemberProfileRequestIdRef.current) {
        setLoadingStoreMemberProfile(false);
      }
    }
  }, [activeAccount?.address, isStoreScopedPurchase, storecode]);

  const upsertAdminBuyerProfile = useCallback(
    async ({
      nicknameInput,
      depositNameInput,
      sourceBuyer,
      mobileOverride,
    }: {
      nicknameInput?: string;
      depositNameInput: string;
      sourceBuyer?: Record<string, unknown> | null;
      mobileOverride?: string;
    }) => {
      if (!activeAccount?.address) {
        throw new Error('지갑을 먼저 연결해 주세요.');
      }

      const nickname = toTrimmedString(nicknameInput || buyerProfileNickname || fallbackBuyerNickname);
      const depositName = toTrimmedString(depositNameInput);
      if (!nickname) {
        throw new Error('구매자 정보를 확인해 주세요.');
      }
      if (!depositName) {
        throw new Error('입금자명을 입력해 주세요.');
      }

      const thirdwebMobile = toTrimmedString(mobileOverride);

      const setUserResponse = await fetch('/api/user/setUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: 'admin',
          walletAddress: activeAccount.address,
          nickname,
          ...(thirdwebMobile ? { mobile: thirdwebMobile } : {}),
        }),
      });
      const setUserData = await setUserResponse.json().catch(() => ({}));
      if (!setUserResponse.ok || !setUserData?.result) {
        throw new Error(setUserData?.error || '구매자 정보 저장에 실패했습니다.');
      }

      const existingBuyer: Record<string, unknown> =
        buyerProfile?.buyer && typeof buyerProfile.buyer === 'object'
          ? { ...buyerProfile.buyer }
          : {};
      const existingBank = resolveBuyerBankSnapshot(existingBuyer);
      const sourceBank = resolveBuyerBankSnapshot(sourceBuyer);
      const bankName = toTrimmedString(sourceBank.bankName || existingBank.bankName);
      const accountNumber = toTrimmedString(sourceBank.accountNumber || existingBank.accountNumber);

      const existingBankInfoRaw = existingBuyer.bankInfo;
      const existingBankInfo: Record<string, unknown> =
        existingBankInfoRaw && typeof existingBankInfoRaw === 'object'
          ? { ...(existingBankInfoRaw as Record<string, unknown>) }
          : {};

      const updateBuyerResponse = await fetch('/api/user/updateBuyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: 'admin',
          walletAddress: activeAccount.address,
          bankName: bankName || undefined,
          accountNumber: accountNumber || undefined,
          accountHolder: depositName,
          buyer: {
            ...existingBuyer,
            ...(sourceBuyer || {}),
            depositName,
            depositBankName: bankName || existingBuyer.depositBankName,
            depositBankAccountNumber: accountNumber || existingBuyer.depositBankAccountNumber,
            bankInfo: {
              ...existingBankInfo,
              ...(sourceBuyer && isRecord(sourceBuyer.bankInfo) ? sourceBuyer.bankInfo : {}),
              accountHolder: depositName,
              ...(bankName ? { bankName } : {}),
              ...(accountNumber ? { accountNumber } : {}),
            },
          },
        }),
      });
      const updateBuyerData = await updateBuyerResponse.json().catch(() => ({}));
      if (!updateBuyerResponse.ok || !updateBuyerData?.result) {
        throw new Error(updateBuyerData?.error || '구매자 입금자명 저장에 실패했습니다.');
      }
    },
    [activeAccount?.address, buyerProfile?.buyer, buyerProfileNickname, fallbackBuyerNickname],
  );

  const loadBuyHistory = useCallback(async () => {
    if (!activeAccount?.address) {
      setBuyHistory([]);
      return;
    }

    setLoadingBuyHistory(true);
    try {
      const response = await fetch('/api/order/getAllBuyOrders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: 'admin',
          walletAddress: activeAccount.address,
          searchMyOrders: true,
          privateSaleMode: 'private',
          limit: 12,
          page: 1,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '구매 내역을 불러오지 못했습니다.');
      }

      setBuyHistory(extractBuyHistoryOrders(data));
    } catch (error) {
      console.error('Failed to load buy history', error);
      setBuyHistory([]);
    } finally {
      setLoadingBuyHistory(false);
    }
  }, [activeAccount?.address]);

  const loadLatestBuyHistory = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!activeAccount?.address) {
      setLatestBuyHistoryItem(null);
      setLoadingLatestBuyHistory(false);
      return;
    }

    if (!silent) {
      setLoadingLatestBuyHistory(true);
    }
    try {
      const response = await fetch('/api/order/getAllBuyOrders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: 'admin',
          walletAddress: activeAccount.address,
          searchMyOrders: true,
          searchOrderStatusCompleted: true,
          searchOrderStatusCancelled: false,
          privateSaleMode: 'private',
          limit: 1,
          page: 1,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '최근 구매 내역을 불러오지 못했습니다.');
      }

      const latest = extractBuyHistoryOrders(data)[0] ?? null;
      setLatestBuyHistoryItem(latest);
    } catch (error) {
      console.error('Failed to load latest buy history', error);
      if (!silent) {
        setLatestBuyHistoryItem(null);
      }
    } finally {
      if (!silent) {
        setLoadingLatestBuyHistory(false);
      }
    }
  }, [activeAccount?.address]);

  const connectSellerChat = useCallback(async () => {
    if (!activeAccount?.address || !selectedSeller?.walletAddress || !SENDBIRD_APP_ID || isSelectedSellerBuyer) {
      setChatSessionToken(null);
      setChatChannelUrl(null);
      setChatError(null);
      return;
    }
    if (!buyerDisplayName) {
      return;
    }
    if (!activePrivateTradeChannelUrl) {
      setChatSessionToken(null);
      setChatChannelUrl(null);
      setChatError(null);
      return;
    }

    setChatLoading(true);
    setChatError(null);
    try {
      await fetch('/api/sendbird/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeAccount.address,
          nickname: buyerDisplayName,
          ...(buyerProfile?.avatar ? { profileUrl: buyerProfile.avatar } : {}),
        }),
      }).catch(() => null);

      const sessionResponse = await fetch('/api/sendbird/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeAccount.address,
          nickname: buyerDisplayName,
          ...(buyerProfile?.avatar ? { profileUrl: buyerProfile.avatar } : {}),
        }),
      });
      const sessionData = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || !sessionData?.sessionToken) {
        throw new Error(sessionData?.error || '채팅 세션 토큰 발급에 실패했습니다.');
      }

      setChatSessionToken(String(sessionData.sessionToken));
      setChatChannelUrl(activePrivateTradeChannelUrl);
    } catch (error) {
      console.error('Failed to connect seller chat', error);
      setChatSessionToken(null);
      setChatChannelUrl(null);
      setChatError(error instanceof Error ? error.message : '채팅을 연결하지 못했습니다.');
    } finally {
      setChatLoading(false);
    }
  }, [
    activeAccount?.address,
    selectedSeller?.walletAddress,
    isSelectedSellerBuyer,
    buyerDisplayName,
    buyerProfile?.avatar,
    activePrivateTradeChannelUrl,
  ]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  useEffect(() => {
    loadBalance();
    if (!activeAccount?.address) return;
    const interval = setInterval(() => {
      loadBalance();
    }, 12000);
    return () => clearInterval(interval);
  }, [activeAccount?.address, loadBalance]);

  useEffect(() => {
    loadBuyerProfile();
  }, [loadBuyerProfile]);

  useEffect(() => {
    loadStoreMemberProfile();
  }, [loadStoreMemberProfile]);

  useEffect(() => {
    if (sellerFromQuery) {
      setSelectedSellerWallet(sellerFromQuery);
    }
  }, [sellerFromQuery]);

  useEffect(() => {
    loadPrivateTradeStatus();
  }, [loadPrivateTradeStatus]);

  useEffect(() => {
    if (buyTab !== 'history') return;
    loadBuyHistory();
  }, [buyTab, loadBuyHistory]);

  useEffect(() => {
    if (!activeAccount?.address) return;

    loadLatestBuyHistory();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadLatestBuyHistory({ silent: true });
    }, latestHistoryPollingMs);

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.hidden) return;
      loadLatestBuyHistory({ silent: true });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeAccount?.address, loadLatestBuyHistory, latestHistoryPollingMs]);

  useEffect(() => {
    setLatestHistoryNowMs(Date.now());
    if (!latestBuyHistoryItemId) return;

    const interval = setInterval(() => {
      setLatestHistoryNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [latestBuyHistoryItemId]);

  useEffect(() => {
    if (!activePrivateTradeOrder?.orderId) return;
    if (activePrivateTradeOrder.status !== 'paymentRequested') return;

    paymentRequestedWatchRef.current = {
      orderId: activePrivateTradeOrder.orderId,
      tradeId: activePrivateTradeOrder.tradeId || '',
      usdtAmount: Number(activePrivateTradeOrder.usdtAmount || 0),
    };
  }, [
    activePrivateTradeOrder?.orderId,
    activePrivateTradeOrder?.status,
    activePrivateTradeOrder?.tradeId,
    activePrivateTradeOrder?.usdtAmount,
  ]);

  useEffect(() => {
    if (!latestBuyHistoryItem || latestBuyHistoryItem.status !== 'paymentConfirmed') return;

    const watchingOrder = paymentRequestedWatchRef.current;
    if (!watchingOrder?.orderId && !watchingOrder?.tradeId) return;

    const matchedByOrderId = Boolean(
      watchingOrder?.orderId && latestBuyHistoryItem.id && watchingOrder.orderId === latestBuyHistoryItem.id,
    );
    const matchedByTradeId = Boolean(
      watchingOrder?.tradeId && latestBuyHistoryItem.tradeId && watchingOrder.tradeId === latestBuyHistoryItem.tradeId,
    );
    if (!matchedByOrderId && !matchedByTradeId) return;

    const orderKey = latestBuyHistoryItem.id || latestBuyHistoryItem.tradeId || watchingOrder.orderId || watchingOrder.tradeId;
    if (!orderKey || jackpotShownOrderKeysRef.current.has(orderKey)) return;
    jackpotShownOrderKeysRef.current.add(orderKey);

    setPurchaseCompleteJackpot({
      orderKey,
      tradeId: latestBuyHistoryItem.tradeId || watchingOrder.tradeId || '',
      usdtAmount: Number(latestBuyHistoryItem.usdtAmount || watchingOrder.usdtAmount || 0),
    });
    paymentRequestedWatchRef.current = null;
  }, [latestBuyHistoryItem]);

  useEffect(() => {
    if (!purchaseCompleteJackpot?.orderKey) return;

    const timeout = setTimeout(() => {
      setPurchaseCompleteJackpot(null);
    }, JACKPOT_AUTO_HIDE_MS);

    return () => clearTimeout(timeout);
  }, [purchaseCompleteJackpot?.orderKey]);

  useEffect(() => {
    const completedTradeId = String(purchaseCompleteJackpot?.tradeId || '').trim();
    if (!completedTradeId) return;
    setRecentEscrowCompletedTradeId(completedTradeId);
  }, [purchaseCompleteJackpot?.tradeId]);

  useEffect(() => {
    setRecentEscrowCompletedTradeId('');
  }, [selectedSellerWallet]);

  useEffect(() => {
    if (!activePrivateTradeOrder?.orderId) return;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadPrivateTradeStatus({ silent: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [activePrivateTradeOrder?.orderId, loadPrivateTradeStatus]);

  useEffect(() => {
    if (!selectedSeller || selectedSeller.rate <= 0) return;

    if (lastEditedAmountType === 'usdt') {
      const nextKrwInput = usdtAmount > 0 ? String(Math.floor(usdtAmount * selectedSeller.rate)) : '';
      if (nextKrwInput !== krwInput) {
        setKrwInput(nextKrwInput);
      }
      return;
    }

    const nextUsdtInput =
      krwAmount > 0 ? formatUsdtInputFromNumber(krwAmount / selectedSeller.rate) : '';
    if (nextUsdtInput !== amountInput) {
      setAmountInput(nextUsdtInput);
    }
  }, [
    selectedSeller,
    lastEditedAmountType,
    usdtAmount,
    krwAmount,
    krwInput,
    amountInput,
  ]);

  useEffect(() => {
    connectSellerChat();
  }, [connectSellerChat, chatRefreshToken]);

  useEffect(() => {
    if (activePrivateTradeOrder?.orderId) {
      setConfirmOpen(false);
    }
  }, [activePrivateTradeOrder?.orderId]);

  useEffect(() => {
    if (!activePrivateTradeOrder?.orderId) {
      setCancelConfirmOpen(false);
    }
  }, [activePrivateTradeOrder?.orderId]);

  useEffect(() => {
    if (!paymentRequestStartedAtMs) return;

    const interval = setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [paymentRequestStartedAtMs]);

  const onSelectQuickAmount = (value: number) => {
    setSelectedQuickAmount(value);
    setAmountInput(value.toFixed(6));
    setLastEditedAmountType('usdt');
  };

  const openBuyerProfileModal = () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }

    setBuyerProfileModalForceNextStep(false);
    setBuyerNicknameInput(buyerProfileNickname || fallbackBuyerNickname);
    setBuyerDepositNameInput(buyerDepositName || storeMemberAccountHolder);
    if (storeMemberProfile?.nickname) {
      setStoreMemberLinkNicknameInput(storeMemberProfile.nickname);
    }
    void loadBuyerProfile();
    if (isStoreScopedPurchase) {
      void loadStoreMemberProfile();
    }
    setBuyerProfileModalOpen(true);
  };

  const submitBuyerProfile = async () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (savingBuyerProfile) return;

    const nickname = toTrimmedString(buyerNicknameInput || buyerProfileNickname || fallbackBuyerNickname);
    const depositName = toTrimmedString(buyerDepositNameInput);

    if (isStoreScopedPurchase && !hasStoreMemberProfile) {
      toast.error('가맹점 회원정보 연동을 먼저 완료해 주세요.');
      return;
    }
    if (!nickname) {
      toast.error('구매자 정보를 확인해 주세요.');
      return;
    }
    if (!depositName) {
      toast.error('입금자명을 입력해 주세요.');
      return;
    }

    setSavingBuyerProfile(true);
    try {
      let thirdwebMobile = '';
      try {
        thirdwebMobile = String(await getUserPhoneNumber({ client }) || '').trim();
      } catch (phoneError) {
        console.warn('Failed to read thirdweb phone number for buyer profile', phoneError);
      }

      await upsertAdminBuyerProfile({
        nicknameInput: nickname,
        depositNameInput: depositName,
        sourceBuyer: storeMemberProfile?.buyer || undefined,
        mobileOverride: thirdwebMobile,
      });

      await loadBuyerProfile();
      setBuyerProfileModalOpen(false);
      toast.success('구매자 정보를 저장했습니다.');
    } catch (error) {
      console.error('Failed to save buyer profile', error);
      toast.error(error instanceof Error ? error.message : '구매자 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingBuyerProfile(false);
    }
  };

  const linkStoreMemberForPurchase = async () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!isStoreScopedPurchase) {
      return;
    }
    if (!storecode) {
      toast.error('가맹점 코드를 확인해 주세요.');
      return;
    }
    if (linkingStoreMember) return;

    const nickname = toTrimmedString(storeMemberLinkNicknameInput);
    const password = toTrimmedString(storeMemberLinkPasswordInput);
    const depositNameInput = toTrimmedString(buyerDepositNameInput);
    if (nickname.length < 2) {
      toast.error('가맹점 회원 아이디를 2자 이상 입력해 주세요.');
      return;
    }
    if (!password) {
      toast.error('가맹점 회원 비밀번호를 입력해 주세요.');
      return;
    }

    const linkingStartedAt = Date.now();
    setLinkingStoreMember(true);
    setStoreMemberProfileError(null);
    try {
      let thirdwebMobile = '';
      try {
        thirdwebMobile = String(await getUserPhoneNumber({ client }) || '').trim();
      } catch (phoneError) {
        console.warn('Failed to read thirdweb phone number for store member link', phoneError);
      }

      const response = await fetch('/api/user/linkWalletByStorecodeNicknamePassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode,
          walletAddress: activeAccount.address,
          mobile: thirdwebMobile,
          ...(depositNameInput ? { depositName: depositNameInput } : {}),
          nickname,
          password,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.error || '회원 인증에 실패했습니다.');
      }

      const linkedMember = data?.result && typeof data.result === 'object'
        ? (data.result as Record<string, unknown>)
        : null;
      const linkedBuyer =
        linkedMember?.buyer && typeof linkedMember.buyer === 'object'
          ? (linkedMember.buyer as Record<string, unknown>)
          : null;
      const linkedSnapshot = resolveBuyerBankSnapshot(linkedBuyer);
      const linkedDepositName = toTrimmedString(
        linkedSnapshot.accountHolder || data?.depositName || depositNameInput,
      );
      if (!linkedDepositName) {
        await Promise.all([loadStoreMemberProfile(), loadBuyerProfile()]);
        setStoreMemberLinkPasswordInput('');
        setStoreMemberProfileError('회원 연동은 완료되었습니다. 입금자명을 입력한 뒤 저장하기를 눌러주세요.');
        return;
      }

      const memberNickname = toTrimmedString(linkedMember?.nickname);
      await upsertAdminBuyerProfile({
        nicknameInput: buyerNicknameInput || buyerProfileNickname || memberNickname || fallbackBuyerNickname,
        depositNameInput: linkedDepositName,
        sourceBuyer: linkedBuyer || undefined,
        mobileOverride: thirdwebMobile,
      });

      if (!toTrimmedString(buyerNicknameInput) && memberNickname) {
        setBuyerNicknameInput(memberNickname);
      }
      setBuyerDepositNameInput(linkedDepositName);
      setStoreMemberLinkPasswordInput('');

      await Promise.all([loadStoreMemberProfile(), loadBuyerProfile()]);
      toast.success('가맹점 회원 연동 및 구매자 정보 반영이 완료되었습니다.');
    } catch (error) {
      console.error('Failed to link store member for purchase', error);
      const message = error instanceof Error ? error.message : '가맹점 회원 연동 중 오류가 발생했습니다.';
      setStoreMemberProfileError(message);
    } finally {
      const elapsed = Date.now() - linkingStartedAt;
      const remaining = Math.max(0, STORE_MEMBER_LINKING_MIN_MS - elapsed);
      if (remaining > 0) {
        await waitFor(remaining);
      }
      setLinkingStoreMember(false);
    }
  };

  const onPrimaryAction = () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (isStoreScopedPurchase && loadingStoreMemberProfile) {
      toast.error('가맹점 회원 여부를 확인 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (isStoreScopedPurchase && !hasStoreMemberProfile) {
      openBuyerProfileModal();
      toast.error('가맹점 회원정보를 먼저 연동해야 구매할 수 있습니다.');
      return;
    }
    if (!hasBuyerProfileForPurchase) {
      openBuyerProfileModal();
      toast.error('구매자 정보(입금자명)를 먼저 입력해 주세요.');
      return;
    }
    if (!selectedSeller) {
      openSellerPicker();
      toast.error('판매자를 먼저 선택해 주세요.');
      return;
    }
    if (isSelectedSellerBuyer) {
      openSellerPicker();
      toast.error('현재 지갑과 동일한 판매자는 선택할 수 없습니다. 다른 판매자를 선택해 주세요.');
      return;
    }
    if (activePrivateTradeOrder?.orderId) {
      const statusLabel = PRIVATE_TRADE_STATUS_LABEL[activePrivateTradeOrder.status] || '진행중';
      toast.error(`${statusLabel} 거래가 진행중입니다. 기존 거래를 완료한 뒤 새 주문을 신청해 주세요.`);
      return;
    }
    if (usdtAmount <= 0) {
      amountInputRef.current?.focus();
      toast.error('구매할 USDT 수량을 입력해 주세요.');
      return;
    }
    if (!hasEnoughSellerBalance) {
      toast.error('판매자가 제공 가능한 수량을 초과했습니다.');
      return;
    }
    resetBuyOrderProgressFlow();
    setConfirmOpen(true);
  };

  const submitBuyOrder = async () => {
    if (activePrivateTradeOrder?.orderId) {
      toast.error('같은 판매자와 진행중인 거래가 있어 새 주문을 생성할 수 없습니다.');
      return;
    }
    if (isStoreScopedPurchase && !hasStoreMemberProfile) {
      toast.error('가맹점 회원정보 연동 후 구매할 수 있습니다.');
      return;
    }
    if (isSelectedSellerBuyer) {
      toast.error('현재 지갑과 동일한 판매자는 선택할 수 없습니다. 판매자를 다시 선택해 주세요.');
      return;
    }
    if (
      !activeAccount?.address ||
      !canBuyByStoreMemberRule ||
      !hasBuyerProfileForPurchase ||
      !selectedSeller ||
      usdtAmount <= 0 ||
      !hasEnoughSellerBalance ||
      submittingBuy
    ) {
      return;
    }
    const sellerRate = Number(selectedSeller.rate || 0);
    const normalizedSubmitUsdtAmount =
      lastEditedAmountType === 'krw'
        ? Math.floor((krwAmount / sellerRate) * 1_000_000) / 1_000_000
        : Math.floor(usdtAmount * 1_000_000) / 1_000_000;
    const normalizedSubmitKrwAmount =
      lastEditedAmountType === 'krw'
        ? krwAmount
        : Math.floor(normalizedSubmitUsdtAmount * sellerRate);
    if (
      !Number.isFinite(normalizedSubmitUsdtAmount) ||
      normalizedSubmitUsdtAmount <= 0 ||
      !Number.isFinite(normalizedSubmitKrwAmount) ||
      normalizedSubmitKrwAmount <= 0
    ) {
      toast.error('구매 금액 계산에 실패했습니다. 수량/금액을 다시 입력해 주세요.');
      return;
    }

    const markBuyOrderProgressError = (message: string) => {
      const occurredAt = new Date().toISOString();
      setBuyOrderProgressPhase('error');
      setBuyOrderProgressSummary(message);
      setBuyOrderProgressSteps((prev) => {
        const activeIndex = prev.findIndex((item) => item.state === 'active');
        if (activeIndex < 0) {
          return prev;
        }
        return prev.map((item, index) => (
          index === activeIndex
            ? {
                ...item,
                state: 'error',
                updatedAt: item.updatedAt || occurredAt,
                detail: item.detail || message,
              }
            : item
        ));
      });
    };

    setRecentEscrowCompletedTradeId('');
    setSubmittingBuy(true);
    setBuyOrderProgressSteps(createInitialBuyOrderProgressSteps());
    setBuyOrderProgressPhase('processing');
    setBuyOrderProgressSummary('요청 검증 단계를 처리중입니다.');
    try {
      const response = await fetch('/api/order/buyOrderPrivateSale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerWalletAddress: activeAccount.address,
          sellerWalletAddress: selectedSeller.walletAddress,
          usdtAmount: normalizedSubmitUsdtAmount,
          krwAmount: normalizedSubmitKrwAmount,
          liveProgress: true,
          ...(storecode ? { storecode } : {}),
        }),
      });

      let resultPayload: BuyOrderProgressResultPayload | null = null;
      let streamErrorMessage = '';
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('application/x-ndjson')) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('실시간 구매 신청 진행 상태를 읽을 수 없습니다.');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        const handleStreamLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return;
          }
          try {
            const parsed = JSON.parse(trimmed) as BuyOrderProgressApiEvent;
            if (parsed.type === 'progress') {
              applyBuyOrderProgressEvent(parsed);
              return;
            }
            if (parsed.type === 'result') {
              if (parsed.payload && typeof parsed.payload === 'object') {
                resultPayload = parsed.payload as BuyOrderProgressResultPayload;
              }
              return;
            }
            if (parsed.type === 'error') {
              streamErrorMessage = resolveBuyOrderApiErrorMessage(parsed.payload);
              markBuyOrderProgressError(streamErrorMessage);
            }
          } catch (parseError) {
            console.warn('submitBuyOrder progress line parse failed', parseError);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(0), { stream: !done });

          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            handleStreamLine(line);
            newlineIndex = buffer.indexOf('\n');
          }

          if (done) {
            break;
          }
        }

        if (buffer.trim()) {
          handleStreamLine(buffer);
        }
      } else {
        const payload = await response.json().catch(() => ({}));
        resultPayload = payload && typeof payload === 'object'
          ? (payload as BuyOrderProgressResultPayload)
          : null;
        if (!response.ok) {
          streamErrorMessage = resolveBuyOrderApiErrorMessage(
            payload && typeof payload === 'object'
              ? (payload as { message?: string; detail?: string; error?: string })
              : undefined,
          );
        }
      }

      if (!response.ok) {
        throw new Error(streamErrorMessage || '구매 신청에 실패했습니다.');
      }

      if (!resultPayload?.result) {
        throw new Error(streamErrorMessage || '구매 신청 결과를 확인하지 못했습니다.');
      }

      applyBuyOrderProgressEvent({
        type: 'progress',
        step: 'BUY_ORDER_RESULT_READY',
        title: '구매 신청 완료',
        description: '구매 신청이 정상 처리되었습니다.',
        status: 'completed',
        occurredAt: new Date().toISOString(),
      });

      const order = resultPayload?.order && typeof resultPayload.order === 'object'
        ? resultPayload.order
        : null;
      const orderStatus = String(order?.status || '');

      if (order && TRADABLE_STATUSES.has(orderStatus)) {
        setPrivateTradeStatus({
          isTrading: true,
          status: orderStatus || null,
          order: order as PrivateTradeOrder,
        });
      } else {
        setPrivateTradeStatus(null);
      }

      const createdNewOrder = resultPayload?.created === true;
      toast.success(
        createdNewOrder
          ? '구매 신청이 완료되었습니다.'
          : '이미 진행중인 거래가 있습니다.',
      );
      setConfirmOpen(false);
      resetBuyOrderProgressFlow();
      setAmountInput('');
      setKrwInput('');
      setLastEditedAmountType('usdt');
      setSelectedQuickAmount(null);
      await Promise.all([
        loadSellers(),
        loadPrivateTradeStatus(),
        loadLatestBuyHistory(),
      ]);
      setChatRefreshToken((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to submit buy order', error);
      const message = error instanceof Error ? error.message : '구매 신청 처리 중 오류가 발생했습니다.';
      markBuyOrderProgressError(message);
      toast.error(message);
    } finally {
      setSubmittingBuy(false);
    }
  };

  const copyDepositField = useCallback(async (value: string, label: string) => {
    const text = String(value || '').trim();
    if (!text) {
      toast.error(`${label} 정보가 없습니다.`);
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success(`${label} 복사 완료`);
    } catch (error) {
      console.error('Failed to copy deposit field', error);
      toast.error(`${label} 복사에 실패했습니다.`);
    }
  }, []);

  const resetBuyOrderProgressFlow = useCallback(() => {
    setBuyOrderProgressSteps(createInitialBuyOrderProgressSteps());
    setBuyOrderProgressSummary('구매 신청 전입니다.');
    setBuyOrderProgressPhase('idle');
  }, []);

  const closeBuyOrderConfirmModal = useCallback(() => {
    if (submittingBuy) return;
    setConfirmOpen(false);
    resetBuyOrderProgressFlow();
  }, [submittingBuy, resetBuyOrderProgressFlow]);

  const resolveBuyOrderApiErrorMessage = useCallback(
    (payload?: { message?: string; detail?: string; error?: string }) =>
      payload?.message
      || payload?.detail
      || payload?.error
      || '구매 신청 처리에 실패했습니다.',
    [],
  );

  const resolveBuyOrderProgressDetail = useCallback(
    (event: Extract<BuyOrderProgressApiEvent, { type: 'progress' }>) => {
      const detail = typeof event.detail === 'string' ? event.detail.trim() : '';
      if (detail) return detail;

      const data = event.data;
      if (!data || typeof data !== 'object') {
        return '';
      }

      const transactionHash =
        typeof data.transactionHash === 'string' ? data.transactionHash.trim() : '';
      const transactionId =
        typeof data.transactionId === 'string' ? data.transactionId.trim() : '';
      const tradeId = typeof data.tradeId === 'string' ? data.tradeId.trim() : '';
      const orderId = typeof data.orderId === 'string' ? data.orderId.trim() : '';
      const channelUrl = typeof data.channelUrl === 'string' ? data.channelUrl.trim() : '';

      if (transactionHash) return `Tx: ${transactionHash}`;
      if (transactionId) return `Queue: ${transactionId}`;
      if (tradeId) return `TID: ${tradeId}`;
      if (orderId) return `OID: ${orderId}`;
      if (channelUrl) return `채널: ${channelUrl}`;
      return '';
    },
    [],
  );

  const applyBuyOrderProgressEvent = useCallback(
    (event: Extract<BuyOrderProgressApiEvent, { type: 'progress' }>) => {
      const stepKey = typeof event.step === 'string' ? event.step.trim() : '';
      const incomingTitle = typeof event.title === 'string' ? event.title.trim() : '';
      const incomingDescription =
        typeof event.description === 'string' ? event.description.trim() : '';
      const occurredAt =
        typeof event.occurredAt === 'string' && event.occurredAt
          ? event.occurredAt
          : new Date().toISOString();
      const status =
        event.status === 'completed' || event.status === 'error' || event.status === 'processing'
          ? event.status
          : 'processing';
      const nextState: BuyOrderProgressStepState =
        status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'active';
      const detail = resolveBuyOrderProgressDetail(event);

      setBuyOrderProgressSteps((prev) => {
        const stepIndex = prev.findIndex((item) => item.key === stepKey);
        const withSettledActive = prev.map((item, index) => {
          if (
            item.state === 'active'
            && status !== 'error'
            && (stepIndex < 0 || index !== stepIndex)
          ) {
            return {
              ...item,
              state: 'completed' as BuyOrderProgressStepState,
              updatedAt: item.updatedAt || occurredAt,
            };
          }
          return item;
        });

        if (!stepKey) {
          return withSettledActive;
        }

        if (stepIndex >= 0) {
          return withSettledActive.map((item, index) => {
            if (index !== stepIndex) {
              return item;
            }
            return {
              ...item,
              title: incomingTitle || item.title,
              description: incomingDescription || item.description,
              state: nextState,
              updatedAt: occurredAt,
              detail: detail || item.detail,
            };
          });
        }

        return [
          ...withSettledActive,
          {
            key: stepKey,
            title: incomingTitle || stepKey,
            description: incomingDescription || '',
            state: nextState,
            updatedAt: occurredAt,
            ...(detail ? { detail } : {}),
          },
        ];
      });

      const stepTitle = incomingTitle || stepKey || '구매 신청 처리';
      if (status === 'error') {
        setBuyOrderProgressPhase('error');
        setBuyOrderProgressSummary(`${stepTitle} 단계에서 오류가 발생했습니다.`);
        return;
      }

      if (stepKey === 'BUY_ORDER_RESULT_READY' && status === 'completed') {
        setBuyOrderProgressPhase('completed');
        setBuyOrderProgressSummary('구매 신청이 완료되었습니다.');
        return;
      }

      setBuyOrderProgressPhase('processing');
      setBuyOrderProgressSummary(
        status === 'completed'
          ? `${stepTitle} 단계를 완료했습니다.`
          : `${stepTitle} 단계를 처리중입니다.`,
      );
    },
    [resolveBuyOrderProgressDetail],
  );

  useEffect(() => {
    if (!confirmOpen) {
      return;
    }

    const container = buyOrderProgressListRef.current;
    if (!container) {
      return;
    }

    const targetStep =
      buyOrderProgressSteps.find((step) => step.state === 'active' || step.state === 'error')
      || [...buyOrderProgressSteps].reverse().find((step) => step.state === 'completed');
    if (!targetStep) {
      return;
    }

    const target = container.querySelector<HTMLElement>(
      `[data-buy-order-progress-step="${targetStep.key}"]`,
    );
    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetCenterTop =
        container.scrollTop
        + (targetRect.top - containerRect.top)
        + (targetRect.height / 2);
      const centeredTop = targetCenterTop - (container.clientHeight / 2);
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const nextTop = Math.max(0, Math.min(centeredTop, maxTop));
      container.scrollTo({
        top: nextTop,
        behavior: 'auto',
      });
    });
  }, [buyOrderProgressSteps, confirmOpen]);

  const resetCancelTradeProgressFlow = useCallback(() => {
    setCancelTradeProgressSteps(createInitialCancelTradeProgressSteps());
    setCancelTradeProgressSummary('취소 요청 전입니다.');
    setCancelTradeProgressPhase('idle');
  }, []);

  const closeCancelTradeModal = useCallback(() => {
    if (cancelingTrade) return;
    setCancelConfirmOpen(false);
    resetCancelTradeProgressFlow();
  }, [cancelingTrade, resetCancelTradeProgressFlow]);

  const resolveCancelTradeApiErrorMessage = useCallback(
    (payload?: { message?: string; detail?: string; error?: string }) =>
      payload?.message
      || payload?.detail
      || payload?.error
      || '거래 취소 처리에 실패했습니다.',
    [],
  );

  const resolveCancelTradeProgressDetail = useCallback(
    (event: Extract<CancelTradeProgressApiEvent, { type: 'progress' }>) => {
      const detail = typeof event.detail === 'string' ? event.detail.trim() : '';
      if (detail) return detail;

      const data = event.data;
      if (!data || typeof data !== 'object') {
        return '';
      }

      const transactionHash =
        typeof data.transactionHash === 'string' ? data.transactionHash.trim() : '';
      const transactionId =
        typeof data.transactionId === 'string' ? data.transactionId.trim() : '';
      const rollbackUsdtAmount = Number(data.rollbackUsdtAmount);
      const tradeId = typeof data.tradeId === 'string' ? data.tradeId.trim() : '';

      if (transactionHash) return `Tx: ${transactionHash}`;
      if (transactionId) return `Queue: ${transactionId}`;
      if (Number.isFinite(rollbackUsdtAmount) && rollbackUsdtAmount > 0) {
        return `회수 ${formatUsdtDisplay(rollbackUsdtAmount)} USDT`;
      }
      if (tradeId) return `TID: ${tradeId}`;
      return '';
    },
    [],
  );

  const applyCancelTradeProgressEvent = useCallback(
    (event: Extract<CancelTradeProgressApiEvent, { type: 'progress' }>) => {
      const stepKey = typeof event.step === 'string' ? event.step.trim() : '';
      const incomingTitle = typeof event.title === 'string' ? event.title.trim() : '';
      const incomingDescription =
        typeof event.description === 'string' ? event.description.trim() : '';
      const occurredAt =
        typeof event.occurredAt === 'string' && event.occurredAt
          ? event.occurredAt
          : new Date().toISOString();
      const status =
        event.status === 'completed' || event.status === 'error' || event.status === 'processing'
          ? event.status
          : 'processing';
      const nextState: CancelTradeProgressStepState =
        status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'active';
      const detail = resolveCancelTradeProgressDetail(event);

      setCancelTradeProgressSteps((prev) => {
        const stepIndex = prev.findIndex((item) => item.key === stepKey);
        const withSettledActive = prev.map((item, index) => {
          if (
            item.state === 'active'
            && status !== 'error'
            && (stepIndex < 0 || index !== stepIndex)
          ) {
            return {
              ...item,
              state: 'completed' as CancelTradeProgressStepState,
              updatedAt: item.updatedAt || occurredAt,
            };
          }
          return item;
        });

        if (!stepKey) {
          return withSettledActive;
        }

        if (stepIndex >= 0) {
          return withSettledActive.map((item, index) => {
            if (index !== stepIndex) {
              return item;
            }
            return {
              ...item,
              title: incomingTitle || item.title,
              description: incomingDescription || item.description,
              state: nextState,
              updatedAt: occurredAt,
              detail: detail || item.detail,
            };
          });
        }

        return [
          ...withSettledActive,
          {
            key: stepKey,
            title: incomingTitle || stepKey,
            description: incomingDescription || '',
            state: nextState,
            updatedAt: occurredAt,
            ...(detail ? { detail } : {}),
          },
        ];
      });

      const stepTitle = incomingTitle || stepKey || '취소 처리';
      if (status === 'error') {
        setCancelTradeProgressPhase('error');
        setCancelTradeProgressSummary(`${stepTitle} 단계에서 오류가 발생했습니다.`);
        return;
      }

      if ((stepKey === 'CANCEL_COMPLETED' || stepKey === 'CANCEL_RESULT_READY') && status === 'completed') {
        setCancelTradeProgressPhase('completed');
        setCancelTradeProgressSummary('거래 취소가 완료되었습니다.');
        return;
      }

      setCancelTradeProgressPhase('processing');
      setCancelTradeProgressSummary(
        status === 'completed'
          ? `${stepTitle} 단계를 완료했습니다.`
          : `${stepTitle} 단계를 처리중입니다.`,
      );
    },
    [resolveCancelTradeProgressDetail],
  );

  useEffect(() => {
    if (!cancelConfirmOpen) {
      return;
    }

    const container = cancelTradeProgressListRef.current;
    if (!container) {
      return;
    }

    const targetStep =
      cancelTradeProgressSteps.find((step) => step.state === 'active' || step.state === 'error')
      || [...cancelTradeProgressSteps].reverse().find((step) => step.state === 'completed');
    if (!targetStep) {
      return;
    }

    const target = container.querySelector<HTMLElement>(
      `[data-cancel-trade-progress-step="${targetStep.key}"]`,
    );
    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetCenterTop =
        container.scrollTop
        + (targetRect.top - containerRect.top)
        + (targetRect.height / 2);
      const centeredTop = targetCenterTop - (container.clientHeight / 2);
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const nextTop = Math.max(0, Math.min(centeredTop, maxTop));
      container.scrollTo({
        top: nextTop,
        behavior: 'auto',
      });
    });
  }, [cancelTradeProgressSteps, cancelConfirmOpen]);

  const openCancelTradeModal = () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!activePrivateTradeOrder?.orderId) {
      toast.error('취소할 진행중 거래가 없습니다.');
      return;
    }
    if (!canCancelActiveTrade) {
      toast.error('현재 거래 상태에서는 취소할 수 없습니다.');
      return;
    }
    resetCancelTradeProgressFlow();
    setCancelConfirmOpen(true);
  };

  const resolvePublicIpAddress = useCallback(async () => {
    try {
      let resolvedIpAddress = '';

      try {
        const response = await fetch('/api/server/getServerInfo', {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          resolvedIpAddress = String((payload as { ipAddress?: string })?.ipAddress || '').trim();
        }
      } catch (serverIpError) {
        console.error('Failed to fetch server side ip address', serverIpError);
      }

      if (!resolvedIpAddress) {
        const ipifyResponse = await fetch('https://api64.ipify.org?format=json', {
          method: 'GET',
          cache: 'no-store',
        });
        const ipifyPayload = await ipifyResponse.json().catch(() => ({}));
        if (ipifyResponse.ok) {
          resolvedIpAddress = String((ipifyPayload as { ip?: string })?.ip || '').trim();
        }
      }

      return resolvedIpAddress;
    } catch (fetchPublicIpError) {
      console.error('Failed to resolve public ip address', fetchPublicIpError);
      return '';
    }
  }, []);

  const cancelActiveTradeOrder = async () => {
    if (!activeAccount?.address || !activePrivateTradeOrder?.orderId || !selectedSeller?.walletAddress) {
      toast.error('취소할 거래 정보를 찾지 못했습니다.');
      return;
    }
    if (!canCancelActiveTrade) {
      toast.error('현재 거래 상태에서는 취소할 수 없습니다.');
      return;
    }
    if (cancelingTrade) return;

    const markCancelProgressError = (message: string) => {
      const occurredAt = new Date().toISOString();
      setCancelTradeProgressPhase('error');
      setCancelTradeProgressSummary(message);
      setCancelTradeProgressSteps((prev) => {
        const activeIndex = prev.findIndex((item) => item.state === 'active');
        if (activeIndex < 0) {
          return prev;
        }
        return prev.map((item, index) => (
          index === activeIndex
            ? {
                ...item,
                state: 'error',
                updatedAt: item.updatedAt || occurredAt,
                detail: item.detail || message,
              }
            : item
        ));
      });
    };

    setCancelingTrade(true);
    setCancelTradeProgressSteps(createInitialCancelTradeProgressSteps());
    setCancelTradeProgressPhase('processing');
    setCancelTradeProgressSummary('요청 검증 단계를 처리중입니다.');
    try {
      const cancelledByIpAddress = await resolvePublicIpAddress();
      const cancelledByUserAgent =
        typeof window !== 'undefined' ? String(window.navigator.userAgent || '').trim() : '';

      const response = await fetch('/api/order/cancelPrivateBuyOrderByBuyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: activePrivateTradeOrder.orderId,
          buyerWalletAddress: activeAccount.address,
          sellerWalletAddress: selectedSeller.walletAddress,
          cancelledByIpAddress,
          cancelledByUserAgent,
          liveProgress: true,
        }),
      });

      let resultPayload: { result?: boolean } | null = null;
      let streamErrorMessage = '';
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/x-ndjson')) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('실시간 취소 진행 상태를 읽을 수 없습니다.');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        const handleStreamLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return;
          }
          try {
            const parsed = JSON.parse(trimmed) as CancelTradeProgressApiEvent;
            if (parsed.type === 'progress') {
              applyCancelTradeProgressEvent(parsed);
              return;
            }
            if (parsed.type === 'result') {
              if (parsed.payload && typeof parsed.payload === 'object') {
                resultPayload = parsed.payload as { result?: boolean };
              }
              return;
            }
            if (parsed.type === 'error') {
              streamErrorMessage = resolveCancelTradeApiErrorMessage(parsed.payload);
              markCancelProgressError(streamErrorMessage);
            }
          } catch (parseError) {
            console.warn('cancelActiveTradeOrder progress line parse failed', parseError);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(0), { stream: !done });

          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            handleStreamLine(line);
            newlineIndex = buffer.indexOf('\n');
          }

          if (done) {
            break;
          }
        }

        if (buffer.trim()) {
          handleStreamLine(buffer);
        }
      } else {
        const payload = await response.json().catch(() => ({}));
        resultPayload = payload && typeof payload === 'object'
          ? (payload as { result?: boolean })
          : null;
      }

      if (!response.ok) {
        throw new Error(streamErrorMessage || '거래 취소에 실패했습니다.');
      }

      if (!resultPayload?.result) {
        throw new Error(streamErrorMessage || '거래 취소 결과를 확인하지 못했습니다.');
      }

      applyCancelTradeProgressEvent({
        type: 'progress',
        step: 'CANCEL_RESULT_READY',
        title: '취소 결과 반영',
        description: '거래 취소 요청이 정상 처리되었습니다.',
        status: 'completed',
        occurredAt: new Date().toISOString(),
      });

      toast.success('진행중 거래를 취소했습니다.');
      privateTradeStatusRequestIdRef.current += 1;
      setPrivateTradeStatus(null);
      setCancelConfirmOpen(false);
      resetCancelTradeProgressFlow();
      setAmountInput('');
      setKrwInput('');
      setLastEditedAmountType('usdt');
      setSelectedQuickAmount(null);
      await Promise.all([loadPrivateTradeStatus(), loadSellers(), loadLatestBuyHistory()]);
      setChatRefreshToken((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to cancel private trade order', error);
      const message = error instanceof Error ? error.message : '거래 취소 처리 중 오류가 발생했습니다.';
      markCancelProgressError(message);
      toast.error(message);
    } finally {
      setCancelingTrade(false);
    }
  };

  return (
    <main
      className={`${displayFont.variable} ${bodyFont.variable} relative min-h-screen overflow-hidden bg-[radial-gradient(130%_130%_at_100%_0%,#cffafe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-900`}
      style={{ fontFamily: 'var(--font-body), "Avenir Next", "Segoe UI", sans-serif' }}
    >
      <AutoConnect client={client} wallets={[wallet]} />

      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-300/40 blur-3xl" />
      <div className="pointer-events-none absolute top-24 right-0 h-80 w-80 rounded-full bg-blue-300/30 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[430px] px-4 pb-28 pt-8">
        <div className="mb-8">
          <p className="mb-2 inline-flex rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
            Wallet Management
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: '"SUIT Variable", "Pretendard", "Noto Sans KR", sans-serif' }}
          >
            USDT 구매
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            판매자를 선택하고 채팅으로 조건을 확인한 뒤, 구매 신청을 안전하게 진행할 수 있습니다.
          </p>
        </div>

        {activeAccount?.address ? (
          <WalletSummaryCard
            walletAddress={activeAccount.address}
            usdtBalanceDisplay={
              `${formatUsdtDisplay(balance)} USDT`
            }
            modeLabel={buyTabLabel}
            smartAccountEnabled={smartAccountEnabled}
            disconnectRedirectPath={disconnectRedirectPath}
          />
        ) : (
          <div className="mb-6 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)] backdrop-blur">
            <WalletConnectPrompt
              wallets={wallets}
              chain={activeNetwork.chain}
              lang={lang}
              title="USDT 구매를 시작하려면 지갑을 연결하세요."
              description="연결 후 판매자 채팅과 구매 신청 기능이 활성화됩니다."
            />
          </div>
        )}

        <div className="grid gap-5">
          <section className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="mb-5 grid grid-cols-2 gap-2">
              {[
                { key: 'buy', label: '구매하기' },
                { key: 'history', label: '구매내역' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setBuyTab(tab.key as 'buy' | 'history')}
                  className={`inline-flex h-10 items-center justify-center rounded-xl border text-xs font-semibold transition ${
                    buyTab === tab.key
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {buyTab === 'buy' ? (
              <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">STEP 1</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">판매자 선택 및 구매 신청</h2>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">구매자 정보</p>

              {loadingBuyerProfile ? (
                <div className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="relative inline-flex h-5 w-5 items-center justify-center">
                      <span className="absolute h-5 w-5 rounded-full border-2 border-cyan-300/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 animate-ping" />
                    </span>
                    <p className="text-sm font-semibold text-cyan-800">나의 지갑과 연동된 구매자 정보를 조회중입니다...</p>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 pl-7">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:240ms]" />
                    <span className="text-[11px] font-semibold text-cyan-700">검색 중...</span>
                  </div>
                </div>
              ) : hasBuyerProfileForPurchase ? (
                <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-slate-500">입금자명</p>
                    <p className="mt-1 text-center text-2xl font-extrabold leading-tight tracking-tight text-slate-900">
                      {buyerDepositName || '-'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    <span className="text-xs font-semibold text-rose-700">
                      조회 결과: 등록된 구매자 정보가 없습니다.
                    </span>
                  </div>

                  <div className="mt-3 rounded-2xl border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#fffbeb_100%)] px-3 py-3">
                    <p className="text-xs font-semibold text-amber-800">
                      구매 신청 전에 구매자 정보(입금자명)를 먼저 입력해 주세요.
                    </p>
                    {isStoreScopedPurchase && !hasStoreMemberProfile && (
                      <p className="mt-1 text-xs font-semibold text-amber-800">
                        가맹점 회원정보 연동이 먼저 완료되어야 구매를 진행할 수 있습니다.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={openBuyerProfileModal}
                      className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-amber-300 bg-white text-sm font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-50"
                    >
                      구매자 정보 입력하기
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="mt-2 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">최근 구매 1건</p>

              {!activeAccount?.address ? (
                <p className="mt-1 text-[11px] text-slate-500">지갑 연결 후 최근 구매 내역을 확인할 수 있습니다.</p>
              ) : loadingLatestBuyHistory ? (
                <p className="mt-1 text-[11px] text-slate-500">최근 구매 내역을 불러오는 중입니다...</p>
              ) : latestBuyHistoryItem ? (
                <>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="max-w-[55%] truncate text-[11px] font-semibold text-slate-700">
                      {latestBuyHistoryItem.sellerNickname || shortAddress(latestBuyHistoryItem.sellerWalletAddress) || '-'}
                    </span>
                    <span
                      className={`text-[12px] font-extrabold ${
                        isLatestBuyJustNow ? 'text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {latestBuyHistoryTimeAgo}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-end justify-between gap-2">
                    <span className="text-base font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
                      {formatUsdtDisplay(latestBuyHistoryItem.usdtAmount)} USDT
                    </span>
                    <span className="text-base font-bold leading-none text-slate-800 tabular-nums">
                      {latestBuyHistoryItem.krwAmount.toLocaleString()} KRW
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-end text-[10px] font-semibold text-slate-400">
                    {latestBuyHistoryItem.tradeId ? `#${latestBuyHistoryItem.tradeId}` : `#${latestBuyHistoryItem.id.slice(-6)}`}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">아직 완료된 구매 내역이 없습니다.</p>
              )}
            </div>

            {!loadingSellers && !shouldHideSellerReselectControls && (
              <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setSellerSortOption('rate')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    sellerSortOption === 'rate'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  최저 환율 우선
                </button>
                <button
                  type="button"
                  onClick={() => setSellerSortOption('balance')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    sellerSortOption === 'balance'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  보유량 우선
                </button>
              </div>
            )}

            {sellerFromQuery && !loadingSellers && !selectedSeller && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                요청한 판매자 정보를 찾지 못했습니다.
              </p>
            )}

            {sellersError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                {sellersError}
              </p>
            )}

            {selectedSeller ? (
              isSelectedSellerBuyer ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                  <p className="text-sm font-semibold text-rose-700">
                    현재 선택한 판매자는 구매자와 동일한 계정입니다.
                  </p>
                  <p className="mt-1 text-xs text-rose-600">
                    자기 자신과는 거래할 수 없습니다. 판매자를 다시 선택해 주세요.
                  </p>
                  <button
                    type="button"
                    onClick={openSellerPicker}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    다른 판매자 선택
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 overflow-hidden rounded-xl border border-cyan-200 bg-white">
                      {selectedSeller.avatar ? (
                        <Image
                          src={selectedSeller.avatar}
                          alt={selectedSeller.nickname}
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-cyan-700">
                          SELL
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{selectedSeller.nickname}</p>
                      <p className="truncate text-xs text-slate-500">{shortAddress(selectedSeller.walletAddress)}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-white/80 bg-white px-3 py-2">
                      <p className="text-slate-500">판매 환율</p>
                      <p className="mt-1 text-right text-xl font-extrabold leading-tight text-slate-900">
                        {selectedSeller.rate.toLocaleString(undefined, { maximumFractionDigits: 0 })} KRW
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/80 bg-white px-3 py-2">
                      <p className="text-slate-500">판매 가능 수량</p>
                      <p className="mt-1 text-right text-xl font-extrabold leading-tight text-emerald-700">
                        {formatUsdtDisplay(selectedSeller.currentUsdtBalance)} USDT
                      </p>
                    </div>
                  </div>

                  {selectedSeller.paymentMethods.length > 0 && (
                    <p className="mt-2 text-xs text-slate-600">
                      결제 수단: {selectedSeller.paymentMethods.join(', ')}
                    </p>
                  )}
                  {(selectedSeller.bankInfo.bankName || selectedSeller.bankInfo.accountNumber) && (
                    <p className="mt-1 text-xs text-slate-600">
                      입금 계좌: {selectedSeller.bankInfo.bankName || '-'} {selectedSeller.bankInfo.accountNumber || ''}
                    </p>
                  )}

                  <div
                    className={`mt-3 rounded-xl border px-3 py-3 ${
                      paymentRequestCountdown?.isExpired
                        ? 'border-rose-300 bg-rose-50/70'
                        : 'border-cyan-200 bg-white/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">에스크로 처리 절차</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          escrowFlowPhase === 'COMPLETED'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : escrowFlowPhase === 'PAYMENT_REQUESTED'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-cyan-200 bg-cyan-50 text-cyan-700'
                        }`}
                      >
                        {escrowFlowStatusLabel}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-[11px] font-medium ${
                        paymentRequestCountdown?.isExpired ? 'text-rose-700' : 'text-slate-600'
                      }`}
                    >
                      {escrowFlowSummary}
                    </p>

                    <div className="mt-3 space-y-2">
                      {escrowFlowSteps.map((step, index) => {
                        const style = getEscrowFlowStepStyle(step.state);
                        return (
                          <div
                            key={step.key}
                            className={`rounded-lg border px-2.5 py-2 ${style.container}`}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${style.badge}`}
                              >
                                {step.state === 'completed' ? '✓' : index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-xs font-semibold ${style.title}`}>{step.title}</p>
                                  <span className={`text-[10px] font-semibold ${style.status}`}>
                                    {getEscrowFlowStepStatusLabel(step.state)}
                                  </span>
                                </div>
                                <p className={`mt-0.5 text-[11px] ${style.description}`}>
                                  {step.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-700">거래 상태</p>
                    </div>
                    {loadingPrivateTradeStatus ? (
                      <p className="mt-2 text-slate-500">선택한 판매자와의 진행중 거래를 조회하고 있습니다.</p>
                    ) : activePrivateTradeOrder ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {PRIVATE_TRADE_STATUS_LABEL[activePrivateTradeOrder.status] || activePrivateTradeOrder.status}
                          </p>
                          {(activePrivateTradeOrder.tradeId || activePrivateTradeOrder.orderId) && (
                            <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              #{activePrivateTradeOrder.tradeId || activePrivateTradeOrder.orderId.slice(-6)}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex items-end justify-between border-b border-slate-200 pb-2">
                          <p className="text-[11px] text-slate-500">입금 금액</p>
                          <p className="text-xl font-bold text-slate-900">
                            {activePrivateTradeOrder.krwAmount.toLocaleString()} KRW
                          </p>
                        </div>
                        <div className="mt-2 flex items-end justify-between">
                          <span className="text-slate-500">주문 수량</span>
                          <span className="text-2xl font-extrabold leading-none text-slate-900 tabular-nums">
                            {formatUsdtDisplay(activePrivateTradeOrder.usdtAmount)} USDT
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">입금 요청 시각</span>
                          <span className="font-semibold text-slate-700">
                            {formatDateTime(activePrivateTradeOrder.paymentRequestedAt || activePrivateTradeOrder.createdAt)}
                          </span>
                        </div>

                        {paymentRequestCountdown && (
                          <div
                            className={`mt-3 rounded-xl border px-3 py-2.5 ${
                              paymentRequestCountdown.isExpired
                                ? 'border-rose-300 bg-rose-50'
                                : 'border-amber-200 bg-amber-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-600">입금 제한 시간</span>
                              <span
                                className={`text-sm font-bold tabular-nums ${
                                  paymentRequestCountdown.isExpired ? 'text-rose-700' : 'text-amber-700'
                                }`}
                              >
                                {formatCountdownClock(paymentRequestCountdown.remainingMs)}
                              </span>
                            </div>

                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-amber-200">
                              <div
                                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                                  paymentRequestCountdown.isExpired
                                    ? 'bg-rose-500'
                                    : 'bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400 animate-pulse'
                                }`}
                                style={{ width: `${(paymentRequestCountdown.remainingRatio * 100).toFixed(2)}%` }}
                              />
                            </div>

                            <p
                              className={`mt-2 text-[11px] font-semibold ${
                                paymentRequestCountdown.isExpired ? 'text-rose-700' : 'text-amber-700'
                              }`}
                            >
                              30분 내로 입금하지 않으면 주문이 자동으로 취소됩니다.
                            </p>
                          </div>
                        )}

                        <div className="mt-3 space-y-2.5 border-t border-slate-200 pt-3 text-xs">
                          {activeTradeDepositInfo?.isContactTransfer ? (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">결제 방식</span>
                                <span className="font-semibold text-slate-900">연락처송금</span>
                              </div>
                              {activeTradeDepositInfo.accountNumber && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500">연락처</span>
                                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                                    {activeTradeDepositInfo.accountNumber}
                                    <button
                                      type="button"
                                      onClick={() => copyDepositField(activeTradeDepositInfo.accountNumber, '연락처')}
                                      className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:border-slate-400"
                                    >
                                      복사
                                    </button>
                                  </span>
                                </div>
                              )}
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500">연락처 메모</span>
                                  <button
                                    type="button"
                                    onClick={() => copyDepositField(activeTradeDepositInfo.contactMemo, '연락처 메모')}
                                    className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:border-slate-400"
                                  >
                                    복사
                                  </button>
                                </div>
                                <div
                                  className={`mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed ${
                                    activeTradeDepositInfo.contactMemo
                                      ? 'animate-pulse text-amber-700'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {activeTradeDepositInfo.contactMemo
                                    ? renderTextWithAutoLinks(
                                        activeTradeDepositInfo.contactMemo,
                                        'font-semibold underline decoration-slate-400 underline-offset-2 break-all hover:text-slate-700',
                                      )
                                    : '-'}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-4">
                                <span className="pt-1 text-[12px] font-medium text-slate-500">은행</span>
                                <span className="text-right text-lg font-extrabold leading-tight text-slate-900">
                                  {activeTradeDepositInfo?.bankName || '-'}
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <span className="pt-1 text-[12px] font-medium text-slate-500">계좌번호</span>
                                <span className="flex flex-wrap items-center justify-end gap-2 text-right text-lg font-extrabold leading-tight text-slate-900">
                                  <span className="break-all">{activeTradeDepositInfo?.accountNumber || '-'}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyDepositField(activeTradeDepositInfo?.accountNumber || '', '입금 계좌')}
                                    className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
                                  >
                                    복사
                                  </button>
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <span className="pt-1 text-[12px] font-medium text-slate-500">예금주</span>
                                <span className="text-right text-lg font-extrabold leading-tight text-slate-900">
                                  {activeTradeDepositInfo?.accountHolder || '-'}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        <p className="mt-2 text-[11px] text-slate-600">
                          입금 후 판매자 채팅에서 입금 확인을 요청해 주세요.
                        </p>

                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-rose-700">
                              입금 전 주문 취소가 필요하면 아래 버튼을 눌러 진행하세요.
                            </span>
                            <button
                              type="button"
                              onClick={openCancelTradeModal}
                              disabled={!canCancelActiveTrade || cancelingTrade}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-500 bg-rose-600 px-3 text-xs font-extrabold text-white shadow-[0_14px_24px_-18px_rgba(225,29,72,0.9)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:border-rose-200 disabled:bg-rose-200 disabled:text-rose-500"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path
                                  d="M18 6L6 18M6 6l12 12"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              {cancelingTrade ? '취소 처리 중...' : '거래 취소'}
                            </button>
                          </div>
                          {!canCancelActiveTrade && (
                            <p className="mt-1 text-[11px] font-semibold text-rose-600">
                              입금 요청 상태에서만 취소 가능합니다.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-slate-500">현재 이 판매자와 진행중인 거래가 없습니다.</p>
                    )}

                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">판매자 채팅</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">실시간 채팅</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            구매신청 완료 후 생성된 주문 채팅에서 판매자와 거래 정보를 확인하세요.
                          </p>
                        </div>
                        {!shouldShowSelfSellerChatAlert && hasActivePrivateTradeChatChannel && (
                          <button
                            type="button"
                            onClick={() => setChatRefreshToken((prev) => prev + 1)}
                            disabled={chatLoading}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {chatLoading ? '연결 중...' : '재연결'}
                          </button>
                        )}
                      </div>

                      {!activeAccount?.address && (
                        <p className="mt-3 text-xs text-slate-500">지갑 연결 후 판매자 채팅을 사용할 수 있습니다.</p>
                      )}
                      {shouldShowSelfSellerChatAlert && (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm">
                          <p className="font-semibold text-rose-700">현재 선택한 판매자는 구매자와 동일한 계정입니다.</p>
                          <p className="mt-1 text-xs text-rose-600">자기 자신과는 거래할 수 없습니다. 판매자를 다시 선택해 주세요.</p>
                        </div>
                      )}
                      {activeAccount?.address && !isSelectedSellerBuyer && !SENDBIRD_APP_ID && (
                        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                          채팅 설정이 비어 있어 연결할 수 없습니다. NEXT_PUBLIC_SENDBIRD_APP_ID 설정을 확인해 주세요.
                        </p>
                      )}
                      {activeAccount?.address && !isSelectedSellerBuyer && SENDBIRD_APP_ID && (
                        <div className="mt-3 h-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          {chatError ? (
                            <div className="px-4 py-4 text-xs font-semibold text-rose-600">{chatError}</div>
                          ) : !hasActivePrivateTradeOrder ? (
                            <div className="px-4 py-4 text-xs text-slate-500">
                              구매신청을 완료하면 주문 전용 채팅 채널이 생성됩니다.
                            </div>
                          ) : !hasActivePrivateTradeChatChannel ? (
                            <div className="px-4 py-4 text-xs text-slate-500">
                              주문 채팅 채널을 준비 중입니다. 잠시 후 다시 확인해 주세요.
                            </div>
                          ) : !buyerDisplayName || loadingBuyerProfile ? (
                            <div className="px-4 py-4 text-xs text-slate-500">내 회원 정보를 불러오는 중입니다...</div>
                          ) : !chatSessionToken || !chatChannelUrl ? (
                            <div className="px-4 py-4 text-xs text-slate-500">
                              {chatLoading ? '채팅을 준비 중입니다...' : '주문 채팅 채널을 연결하는 중입니다...'}
                            </div>
                          ) : (
                            <SendbirdProvider
                              appId={SENDBIRD_APP_ID}
                              userId={activeAccount.address}
                              accessToken={chatSessionToken}
                              theme="light"
                            >
                              <GroupChannel channelUrl={chatChannelUrl} />
                            </SendbirdProvider>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={openSellerPicker}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    다른 판매자 선택
                  </button>
                </div>
              )
            ) : (
              <>
                {loadingSellers && (
                  <p className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700">
                    판매자 정보를 불러오는 중입니다.
                  </p>
                )}
                {!loadingSellers && (
                  <button
                    type="button"
                    onClick={openSellerPicker}
                    disabled={sellerPickerSellers.length === 0}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-cyan-700 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    판매자 선택하기
                  </button>
                )}
              </>
            )}

            {!isSelectedSellerBuyer && (
              activePrivateTradeOrder ? (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">같은 판매자와 진행중인 거래가 있어 새 주문을 생성할 수 없습니다.</p>
                  <p className="mt-1 text-xs text-amber-800">
                    기존 거래를 완료하거나 취소한 뒤 새 구매 신청이 가능합니다.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">구매 수량 (USDT)</p>
                    {selectedSeller && (
                      <button
                        type="button"
                        onClick={() => {
                          const max = selectedSeller.currentUsdtBalance;
                          setAmountInput(max > 0 ? max.toFixed(6) : '');
                          setLastEditedAmountType('usdt');
                          setSelectedQuickAmount(null);
                        }}
                        disabled={isSelectedSellerBuyer}
                        className="text-xs font-semibold text-emerald-600 underline decoration-emerald-200 underline-offset-2 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                      >
                        최대
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <input
                      ref={amountInputRef}
                      disabled={!selectedSeller || submittingBuy || isSelectedSellerBuyer}
                      value={amountInput}
                      onChange={(event) => {
                        setAmountInput(normalizeUsdtInput(event.target.value));
                        setLastEditedAmountType('usdt');
                        setSelectedQuickAmount(null);
                      }}
                      onBlur={() => {
                        const normalized = Number(normalizeUsdtInput(amountInput));
                        if (!Number.isFinite(normalized) || normalized <= 0) {
                          setAmountInput('');
                          return;
                        }
                        setAmountInput(normalized.toFixed(6));
                      }}
                      placeholder="0.000000"
                      className="w-full bg-transparent text-right text-5xl font-semibold text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                      inputMode="decimal"
                    />
                    <span className="pb-1 text-sm font-semibold text-slate-500">USDT</span>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">구매 금액 (KRW)</p>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <input
                      disabled={!selectedSeller || submittingBuy || isSelectedSellerBuyer}
                      value={krwDisplayInput}
                      onChange={(event) => {
                        setKrwInput(normalizeKrwInput(event.target.value));
                        setLastEditedAmountType('krw');
                        setSelectedQuickAmount(null);
                      }}
                      placeholder="0"
                      className="w-full bg-transparent text-right text-5xl font-semibold text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                      inputMode="numeric"
                    />
                    <span className="pb-1 text-sm font-semibold text-slate-500">KRW</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {QUICK_BUY_AMOUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!selectedSeller || submittingBuy || isSelectedSellerBuyer}
                      onClick={() => onSelectQuickAmount(value)}
                      className={`h-10 rounded-xl border text-sm font-semibold transition ${
                        selectedQuickAmount === value
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                      } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                    >
                      {value.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">선택 판매자</span>
                    <span className="font-semibold text-slate-800">{selectedSeller?.nickname || '미선택'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-slate-500">판매 환율</span>
                    <span className="font-semibold text-slate-800">
                      {selectedSeller
                        ? `${selectedSeller.rate.toLocaleString(undefined, { maximumFractionDigits: 0 })} KRW`
                        : '-'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-slate-500">구매 금액</span>
                    <span className="font-semibold text-slate-800">
                      {estimatedKrwAmount > 0 ? `${estimatedKrwAmount.toLocaleString()}원` : '0원'}
                    </span>
                  </div>
                </div>

                  {!hasEnoughSellerBalance && usdtAmount > 0 && (
                    <p className="mt-3 text-sm font-medium text-rose-600">
                      판매 가능 수량을 초과했습니다. 판매자 잔여 수량을 확인해 주세요.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={onPrimaryAction}
                    disabled={submittingBuy}
                    className={`mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-white transition ${
                      canSubmitBuy
                        ? 'bg-cyan-700 shadow-[0_16px_34px_-20px_rgba(14,116,144,0.85)] hover:-translate-y-0.5 hover:bg-cyan-600'
                        : 'bg-slate-900 hover:bg-slate-800'
                    } disabled:cursor-not-allowed disabled:bg-slate-300`}
                  >
                    {primaryLabel}
                  </button>
                  <p className="mt-2 text-xs text-slate-500">
                    {isStoreScopedPurchase && !hasStoreMemberProfile
                      ? '가맹점 회원정보 연동 후 구매자 정보(입금자명)를 확인하고 주문을 진행하세요.'
                      : '구매자 정보(입금자명)를 확인하고, 판매자와 구매 수량/금액을 점검한 뒤 신청하세요.'}
                  </p>
                </>
              )
            )}
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">내 최근 구매 내역</h2>
                  <button
                    type="button"
                    onClick={loadBuyHistory}
                    disabled={loadingBuyHistory}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingBuyHistory ? '조회 중...' : '새로고침'}
                  </button>
                </div>

                {loadingBuyHistory && (
                  <p className="text-sm text-slate-500">구매 내역을 불러오는 중입니다...</p>
                )}
                {!loadingBuyHistory && buyHistory.length === 0 && (
                  <p className="text-sm text-slate-500">아직 구매 내역이 없습니다.</p>
                )}

                {!loadingBuyHistory && buyHistory.length > 0 && (
                  <div className="space-y-3">
                    {buyHistory.map((item) => {
                      const statusLabel = BUY_HISTORY_STATUS_LABEL[item.status] || item.status || '-';
                      const displayAt =
                        item.paymentConfirmedAt || item.cancelledAt || item.paymentRequestedAt || item.createdAt;
                      return (
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">거래 상태</p>
                              <p className="mt-0.5 text-sm font-semibold text-slate-900">{statusLabel}</p>
                            </div>
                            <span className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {item.tradeId ? `#${item.tradeId}` : item.id.slice(-6)}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-slate-500">구매 수량</p>
                              <p className="mt-1 text-right text-lg font-bold tabular-nums text-slate-900">
                                {formatUsdtDisplay(item.usdtAmount)} USDT
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-slate-500">구매 금액</p>
                              <p className="mt-1 text-right text-lg font-bold tabular-nums text-slate-900">
                                {item.krwAmount.toLocaleString()} KRW
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">판매자</span>
                              <span className="font-semibold text-slate-800">
                                {item.sellerNickname || shortAddress(item.sellerWalletAddress) || '-'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">입금 계좌</span>
                              <span className="font-semibold text-slate-800">
                                {item.sellerBankName || '-'} {item.sellerAccountNumber || ''}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">환율</span>
                              <span className="font-semibold text-slate-800">
                                {item.rate > 0 ? `1 USDT = ${item.rate.toLocaleString()} KRW` : '-'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">완료 시각</span>
                              <span className="font-semibold text-slate-800">{formatDateTime(displayAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

        </div>
      </div>

      <WalletManagementBottomNav lang={lang} active="buy" />

      {purchaseCompleteJackpot && (
        <div className="fixed inset-0 z-[10010] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: 26 }).map((_, index) => {
              const left = (index * 17) % 100;
              const delayMs = (index % 8) * 140;
              const durationMs = 1800 + (index % 6) * 260;
              const size = 7 + (index % 4) * 2;
              const colors = ['#facc15', '#fb7185', '#22d3ee', '#34d399', '#f59e0b'];
              return (
                <span
                  key={`jackpot-particle-${purchaseCompleteJackpot.orderKey}-${index}`}
                  className="absolute top-[-16%] rounded-full opacity-90"
                  style={{
                    left: `${left}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: colors[index % colors.length],
                    animationName: 'jackpotFall',
                    animationDuration: `${durationMs}ms`,
                    animationTimingFunction: 'linear',
                    animationDelay: `${delayMs}ms`,
                    animationIterationCount: 'infinite',
                  }}
                />
              );
            })}
          </div>
          <div
            className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-emerald-200/80 bg-[radial-gradient(130%_130%_at_20%_0%,#dcfce7_0%,#ffffff_55%,#ecfeff_100%)] px-5 py-6 text-center shadow-[0_44px_120px_-40px_rgba(16,185,129,0.8)]"
            style={{ animation: 'jackpotPop 560ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          >
            <div className="pointer-events-none absolute -top-10 -left-10 h-32 w-32 rounded-full bg-emerald-300/30 blur-2xl" />
            <div className="pointer-events-none absolute -right-12 -bottom-10 h-36 w-36 rounded-full bg-cyan-300/30 blur-2xl" />

            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Purchase Completed</p>
            <h3 className="mt-2 text-3xl font-black tracking-tight text-slate-900 [text-shadow:0_2px_0_rgba(255,255,255,0.75)]">
              구매 완료!
            </h3>
            <p className="mt-4 text-sm font-semibold text-slate-500">구매 수량</p>
            <p className="mt-1 text-4xl font-extrabold leading-none tracking-tight text-emerald-700 tabular-nums">
              {formatUsdtDisplay(purchaseCompleteJackpot.usdtAmount)}
              <span className="ml-1 text-xl font-bold text-emerald-600">USDT</span>
            </p>
            {purchaseCompleteJackpot.tradeId && (
              <p className="mt-3 text-xs font-semibold text-slate-500">거래번호 #{purchaseCompleteJackpot.tradeId}</p>
            )}
            <button
              type="button"
              onClick={() => setPurchaseCompleteJackpot(null)}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:text-emerald-800"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {sellerPickerOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_40px_100px_-45px_rgba(2,132,199,0.8)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                  판매자 선택
                </p>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">구매할 판매자를 선택해 주세요</h3>
              </div>
              <button
                type="button"
                onClick={() => setSellerPickerOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                닫기
              </button>
            </div>

            <input
              value={sellerKeyword}
              onChange={(event) => setSellerKeyword(event.target.value)}
              placeholder="판매자 닉네임 또는 지갑주소 검색"
              className="mt-4 h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-cyan-500"
            />

            <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setSellerSortOption('rate')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sellerSortOption === 'rate'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                최저 환율 우선
              </button>
              <button
                type="button"
                onClick={() => setSellerSortOption('balance')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sellerSortOption === 'balance'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                보유량 우선
              </button>
            </div>

            <div className="mt-3 max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/85">
              {loadingSellers && (
                <div className="px-4 py-5 text-sm text-slate-500">판매자 목록을 불러오는 중입니다...</div>
              )}

              {!loadingSellers && filteredSellers.length === 0 && (
                <div className="px-4 py-5 text-sm text-slate-500">검색 결과가 없습니다.</div>
              )}

              {!loadingSellers && filteredSellers.map((seller) => {
                const selected = seller.walletAddress.toLowerCase() === selectedSellerWallet.toLowerCase();
                return (
                  <button
                    key={seller.walletAddress}
                    type="button"
                    onClick={() => {
                      setSelectedSellerWallet(seller.walletAddress);
                      setSellerPickerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 ${
                      selected ? 'bg-cyan-50/80' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                        {seller.avatar ? (
                          <Image
                            src={seller.avatar}
                            alt={seller.nickname}
                            width={36}
                            height={36}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-500">
                            SELL
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{seller.nickname}</p>
                        <p className="truncate text-[11px] text-slate-500">{shortAddress(seller.walletAddress)}</p>
                      </div>
                      <div className="shrink-0 space-y-1">
                        <div className="inline-flex min-w-[92px] flex-col justify-center rounded-xl border border-cyan-200 bg-cyan-50 px-2 py-1.5">
                          <span className="text-[10px] font-semibold text-cyan-700/90">환율</span>
                          <span className="block w-full text-right text-sm font-extrabold leading-tight text-cyan-800 tabular-nums">
                            {seller.rate.toLocaleString(undefined, { maximumFractionDigits: 0 })} KRW
                          </span>
                        </div>
                        <div className="inline-flex min-w-[92px] flex-col justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                          <span className="text-[10px] font-semibold text-emerald-700/90">보유량</span>
                          <span className="block w-full text-right text-sm font-extrabold leading-tight text-emerald-800 tabular-nums">
                            {formatUsdtDisplay(seller.currentUsdtBalance)} USDT
                          </span>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${
                        selected
                          ? 'bg-cyan-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {selected ? '선택됨' : '선택'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {cancelConfirmOpen && activePrivateTradeOrder && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/55 px-4 py-3 backdrop-blur-sm sm:items-center sm:py-4">
          <button
            type="button"
            aria-label="취소 확인 닫기"
            onClick={closeCancelTradeModal}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-[430px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border border-rose-200 bg-white p-5 shadow-[0_40px_100px_-45px_rgba(225,29,72,0.45)] sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <p className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              거래 취소 확인
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">진행중 거래를 취소할까요?</h3>
            <p className="mt-2 text-sm text-slate-600">
              거래를 취소하면 결제 진행이 중단되며, 취소 처리 완료까지 잠시 시간이 걸릴 수 있습니다.
            </p>
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
              <p className="font-semibold">
                경고: 구매자 요청으로 취소하면 아래 불이익이 반영됩니다.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] font-medium text-rose-700">
                <li>구매자 신뢰도 점수가 1점 차감됩니다.</li>
                <li>구매자 취소 건수가 1회 증가하고 취소 이력이 저장됩니다.</li>
                <li>반복 취소 시 거래 제한 등 추가 정책이 적용될 수 있습니다.</li>
              </ul>
            </div>

            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">거래 상태</span>
                <span className="font-semibold text-slate-800">
                  {PRIVATE_TRADE_STATUS_LABEL[activePrivateTradeOrder.status] || activePrivateTradeOrder.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">구매 수량</span>
                <span className="font-semibold text-slate-800">
                  {formatUsdtDisplay(activePrivateTradeOrder.usdtAmount)} USDT
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">구매 금액</span>
                <span className="font-semibold text-slate-800">
                  {activePrivateTradeOrder.krwAmount.toLocaleString()}원
                </span>
              </div>
            </div>

            <div className={`mt-4 rounded-xl border px-3 py-3 ${cancelTradeProgressPhaseMeta.container}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  취소 진행 상태
                </p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cancelTradeProgressPhaseMeta.badge}`}>
                  {cancelTradeProgressPhaseMeta.label}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                취소 API 단계를 실시간으로 표시합니다.
              </p>
              <p className={`mt-1 text-[11px] font-semibold ${cancelTradeProgressPhaseMeta.summary}`}>
                {cancelTradeProgressSummary}
              </p>

              <div
                ref={cancelTradeProgressListRef}
                className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-1"
              >
                {cancelTradeProgressSteps.map((step, index) => {
                  const style = getCancelTradeProgressStyle(step.state);
                  return (
                    <div
                      key={step.key}
                      data-cancel-trade-progress-step={step.key}
                      className={`rounded-lg border px-2.5 py-2 ${style.container}`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${style.badge}`}
                        >
                          {step.state === 'completed' ? '✓' : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-semibold ${style.title}`}>{step.title}</p>
                            <span className={`text-[10px] font-semibold ${style.status}`}>
                              {getCancelTradeProgressStatusLabel(step.state)}
                            </span>
                          </div>
                          <p className={`mt-0.5 text-[11px] ${style.description}`}>
                            {step.description}
                          </p>
                          {(step.updatedAt || step.detail) && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                              {step.updatedAt && (
                                <span className="font-semibold tabular-nums">
                                  {formatDateTime(step.updatedAt)}
                                </span>
                              )}
                              {step.detail && (
                                <span className="truncate font-semibold">{step.detail}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {cancelingTrade && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                거래 취소를 처리 중입니다. 완료될 때까지 이 창을 닫지 마세요.
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeCancelTradeModal}
                disabled={cancelingTrade}
                className="h-11 rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={cancelActiveTradeOrder}
                disabled={cancelingTrade || !canCancelActiveTrade}
                className="h-11 rounded-2xl bg-rose-600 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {cancelingTrade ? '취소 처리 중...' : '확인하고 취소'}
              </button>
            </div>
          </div>
        </div>
      )}

      {buyerProfileModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="구매자 정보 입력 닫기"
            onClick={() => {
              if (!savingBuyerProfile && !linkingStoreMember) {
                setBuyerProfileModalOpen(false);
              }
            }}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_40px_100px_-45px_rgba(2,132,199,0.75)]">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
              구매자 정보 입력
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">
              {shouldShowBuyerProfileNextStep ? '입금자명을 입력해 주세요' : '구매자 정보를 확인해 주세요'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              1단계에서 현재 구매자 정보를 먼저 조회하고, 정보가 없을 경우에만 다음 단계로 진행됩니다.
            </p>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">1단계 · 구매자 정보 조회</p>
              {loadingBuyerProfile ? (
                <div className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="relative inline-flex h-5 w-5 items-center justify-center">
                      <span className="absolute h-5 w-5 rounded-full border-2 border-cyan-300/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 animate-ping" />
                    </span>
                    <p className="text-sm font-semibold text-cyan-800">나의 지갑과 연동된 구매자 정보를 조회중입니다...</p>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 pl-7">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:240ms]" />
                    <span className="text-[11px] font-semibold text-cyan-700">검색 중...</span>
                  </div>
                </div>
              ) : hasBuyerProfileForPurchase ? (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-700">등록된 구매자 정보가 확인되었습니다.</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <p className="font-semibold text-emerald-700">닉네임</p>
                    <p className="font-bold text-emerald-900">{buyerProfileNickname || '-'}</p>
                    <p className="font-semibold text-emerald-700">입금자명</p>
                    <p className="font-bold text-emerald-900">{buyerDepositName || '-'}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-amber-700">
                  등록된 구매자 정보가 없습니다. 2단계로 이동하여 정보를 입력해 주세요.
                </p>
              )}
            </div>

            {shouldShowBuyerProfileNextStep && (
              <>
                {isStoreScopedPurchase && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">지정 가맹점</p>

                    <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200 bg-white px-2.5 py-1.5">
                      <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-amber-200">
                        {selectedStoreInfo?.storeLogo ? (
                          <Image
                            src={selectedStoreInfo.storeLogo}
                            alt={selectedStoreInfo.storeName || 'Store'}
                            width={24}
                            height={24}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-amber-700">
                            SHOP
                          </div>
                        )}
                      </div>
                      <span className="truncate text-xs font-semibold text-amber-900">
                        {selectedStoreInfo?.storeName || storecode}
                      </span>
                    </div>

                    <div
                      className={`mt-3 rounded-xl border px-3 py-3 ${
                        hasStoreMemberProfile
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-amber-200 bg-white'
                      }`}
                    >
                      {loadingStoreMemberProfile ? (
                        <p className="text-xs font-semibold text-slate-600">내 지갑 기준 가맹점 회원정보를 확인 중입니다...</p>
                      ) : hasStoreMemberProfile ? (
                        <>
                          <p className="text-xs font-semibold text-emerald-700">내 지갑이 가맹점 회원으로 연동되어 있습니다.</p>
                          <p className="mt-1 break-all text-base font-extrabold text-emerald-900">
                            {storeMemberProfile?.nickname || '-'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-amber-800">
                            구매를 위해 가맹점 회원 아이디/비밀번호를 입력해 먼저 나의 지갑과 가맹점 회원을 연동해야합니다.
                          </p>
                          {storeMemberProfileError && (
                            <p className="mt-1 text-xs font-semibold text-rose-600">{storeMemberProfileError}</p>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={storeMemberLinkNicknameInput}
                              onChange={(event) => setStoreMemberLinkNicknameInput(event.target.value)}
                              placeholder="가맹점 회원아이디"
                              maxLength={24}
                              disabled={linkingStoreMember || savingBuyerProfile}
                              className="h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-base font-semibold text-slate-800 outline-none transition focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                            />
                            <input
                              type="password"
                              value={storeMemberLinkPasswordInput}
                              onChange={(event) => setStoreMemberLinkPasswordInput(event.target.value)}
                              placeholder="가맹점 비밀번호"
                              autoComplete="current-password"
                              maxLength={64}
                              disabled={linkingStoreMember || savingBuyerProfile}
                              className="h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-base font-semibold text-slate-800 outline-none transition focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                            />
                          </div>
                          {linkingStoreMember ? (
                            <div className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="relative inline-flex h-5 w-5 items-center justify-center">
                                  <span className="absolute h-5 w-5 rounded-full border-2 border-cyan-300/80" />
                                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 animate-ping" />
                                </span>
                                <p className="text-xs font-semibold text-cyan-700">
                                  가맹점 회원정보를 연동 중입니다. 완료될 때까지 잠시 기다려 주세요.
                                </p>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cyan-100">
                                <div className="h-full rounded-full bg-cyan-500 animate-[modalLinkProgress_5s_linear_forwards]" />
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={linkStoreMemberForPurchase}
                              disabled={savingBuyerProfile}
                              className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              회원연동하기
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">2단계 · 입금자명 입력</span>
                    <input
                      type="text"
                      value={buyerDepositNameInput}
                      onChange={(event) => setBuyerDepositNameInput(event.target.value)}
                      maxLength={32}
                      disabled={savingBuyerProfile || linkingStoreMember || (isStoreScopedPurchase && !hasStoreMemberProfile)}
                      placeholder={
                        isStoreScopedPurchase && !hasStoreMemberProfile
                          ? '가맹점 회원 연동 후 자동 반영됩니다'
                          : '입금자명 입력'
                      }
                      className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                  </label>
                </div>

                {savingBuyerProfile && (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    구매자 정보를 저장 중입니다. 완료될 때까지 이 창을 닫지 마세요.
                  </p>
                )}
              </>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBuyerProfileModalOpen(false)}
                disabled={savingBuyerProfile || linkingStoreMember}
                className="h-11 rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                닫기
              </button>
              {shouldShowBuyerProfileNextStep ? (
                <button
                  type="button"
                  onClick={submitBuyerProfile}
                  disabled={savingBuyerProfile || linkingStoreMember || (isStoreScopedPurchase && !hasStoreMemberProfile)}
                  className="h-11 rounded-2xl bg-cyan-700 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingBuyerProfile ? '저장 중...' : '저장하기'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setBuyerProfileModalForceNextStep(true)}
                  disabled={savingBuyerProfile || linkingStoreMember}
                  className="h-11 rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  다음 단계
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmOpen && selectedSeller && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/55 px-4 py-3 backdrop-blur-sm sm:items-center sm:py-4">
          <button
            type="button"
            aria-label="구매 신청 확인 닫기"
            onClick={closeBuyOrderConfirmModal}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-[430px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_40px_100px_-45px_rgba(2,132,199,0.9)] sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
              구매 신청 확인
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">선택한 판매자에게 구매 신청할까요?</h3>

            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">판매자</span>
                <span className="font-semibold text-slate-800">{selectedSeller.nickname}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">구매 수량</span>
                <span className="font-semibold text-slate-800">
                  {formatUsdtDisplay(usdtAmount)} USDT
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">판매 환율</span>
                <span className="font-semibold text-slate-800">
                  {selectedSeller.rate.toLocaleString(undefined, { maximumFractionDigits: 0 })} KRW
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">구매 금액</span>
                <span className="font-semibold text-slate-800">{estimatedKrwAmount.toLocaleString()}원</span>
              </div>
            </div>

            <div className={`mt-4 rounded-xl border px-3 py-3 ${buyOrderProgressPhaseMeta.container}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  구매 신청 진행 상태
                </p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${buyOrderProgressPhaseMeta.badge}`}>
                  {buyOrderProgressPhaseMeta.label}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                구매 신청 API 단계를 실시간으로 표시합니다.
              </p>
              <p className={`mt-1 text-[11px] font-semibold ${buyOrderProgressPhaseMeta.summary}`}>
                {buyOrderProgressSummary}
              </p>

              <div
                ref={buyOrderProgressListRef}
                className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-1"
              >
                {buyOrderProgressSteps.map((step, index) => {
                  const style = getCancelTradeProgressStyle(step.state);
                  return (
                    <div
                      key={step.key}
                      data-buy-order-progress-step={step.key}
                      className={`rounded-lg border px-2.5 py-2 ${style.container}`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${style.badge}`}
                        >
                          {step.state === 'completed' ? '✓' : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-semibold ${style.title}`}>{step.title}</p>
                            <span className={`text-[10px] font-semibold ${style.status}`}>
                              {getCancelTradeProgressStatusLabel(step.state)}
                            </span>
                          </div>
                          <p className={`mt-0.5 text-[11px] ${style.description}`}>
                            {step.description}
                          </p>
                          {(step.updatedAt || step.detail) && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                              {step.updatedAt && (
                                <span className="font-semibold tabular-nums">
                                  {formatDateTime(step.updatedAt)}
                                </span>
                              )}
                              {step.detail && (
                                <span className="truncate font-semibold">{step.detail}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {submittingBuy && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                구매 신청을 처리 중입니다. 완료될 때까지 이 창을 닫지 마세요.
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeBuyOrderConfirmModal}
                disabled={submittingBuy}
                className="h-11 rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitBuyOrder}
                disabled={submittingBuy}
                className="h-11 rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {submittingBuy ? '신청 중...' : '확인하고 신청'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes jackpotFall {
          0% {
            transform: translate3d(0, -16vh, 0) rotate(0deg);
            opacity: 0;
          }
          12% {
            opacity: 0.95;
          }
          100% {
            transform: translate3d(0, 118vh, 0) rotate(420deg);
            opacity: 0;
          }
        }

        @keyframes jackpotPop {
          0% {
            transform: scale(0.86) translateY(12px);
            opacity: 0;
          }
          68% {
            transform: scale(1.03) translateY(-2px);
            opacity: 1;
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }

        @keyframes modalLinkProgress {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
