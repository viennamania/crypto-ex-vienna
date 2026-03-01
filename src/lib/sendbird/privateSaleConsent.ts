export const BUYER_CONSENT_KEYWORD = '동의함';

export const BUYER_CONSENT_REMINDER_MESSAGE = '반드시 동의함이라고 적어주세요';

export const BUYER_CONSENT_REQUEST_MESSAGE = [
  '네 안녕하세요',
  '',
  '본 거래를 진행하기전 숙지 부탁드립니다.',
  '',
  '*단 지정된 은행에서 연락처 송금으로만 가능합니다*',
  '(신한/우리/케이뱅크/카카오뱅크/국민은행)',
  '*은행별 개인 한도가 상이합니다*',
  '',
  '코인(USDT) 거래를 원칙으로 합니다.',
  '트레이더와 코인(USDT)거래는 불법자금은 받지 않습니다.',
  '거래를 이용하여 불법도박 재테크 마약 거래용으로 사용시 법적 책임이 따른다는 것에 동의하셔야합니다.',
  '',
  '판매자의 의무는 입금된 금원에 해당하는 가상화폐를 지급 및 전송하는 것 이외의 다른 의무는 없으며 본 가상화폐거래로 인해 발생되는 모든 민·형사상의 대한 책임은 구매자에 있으며 구매자는 이를 동의하셔야 합니다.',
  '',
  '이 모든 대화 내역은 증거자료로 남습니다.',
  '',
  '',
  '동의하지 않으시면 취소 하시면 됩니다.',
  `동의하시면  [[${BUYER_CONSENT_KEYWORD}]] 이라고 적어주십시요.`,
].join('\n');

export const buildBuyerConsentRequestMessage = (tradeId?: string) => {
  const normalizedTradeId = String(tradeId || '').trim();
  return normalizedTradeId
    ? `구매주문번호: ${normalizedTradeId}\n\n${BUYER_CONSENT_REQUEST_MESSAGE}`
    : BUYER_CONSENT_REQUEST_MESSAGE;
};
