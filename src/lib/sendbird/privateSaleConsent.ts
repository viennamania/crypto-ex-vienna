export const BUYER_CONSENT_KEYWORD = '동의함';

export const BUYER_CONSENT_REMINDER_MESSAGE = '반드시 동의함이라고 적어주세요';

export const BUYER_CONSENT_ACCEPTED_FOLLOW_UP_MESSAGE = [
  '거래를 진행하겠습니다.',
  '',
  '거래날짜/거래금액/은행명/이름/연락처',
  '순차적으로 기입해주시길 바랍니다.',
  '',
  '기재하신 내용과 송금정보 불일치시 거래가 불발 되는점 인지 부탁드리겠습니다.',
  '',
  '카카오뱅크의 경우 연락처 저장 후 앱내에 반영되는데 시간이 1~20분정도 소요될수 있으니 이점 참고바랍니다.',
].join('\n');

export const BUYER_CONSENT_REQUEST_MESSAGE = [
  '네 안녕하세요.',
  '',
  '※본 거래를 진행하기전 꼭 숙지 부탁드립니다.※',
  '',
  '*무조건 지정된 은행에서 연락처 송금으로만 가능합니다*',
  '(PAYCO/우리은행/케이뱅크/카카오뱅크/국민은행)',
  '*은행별로 개인 한도가 상이하니 참고 부탁드립니다*',
  '',
  '우선 코인(USDT) 본인거래를 원칙으로 합니다.',
  '트레이더와 코인(USDT)거래로 불법도박. 테크. 보이스피싱등',
  '거래를 이용하여 불법적으로 사용시 법적 책임이 따른다는 것에 동의하셔야합니다.',
  '',
  '판매자의 의무는 입금된 금원에 해당하는 가상화폐를 지급 및 전송하는 것 이외의 다른 의무는 없으며 본 가상화폐거래로 인해 발생되는 모든 민·형사상의 대한 책임은 구매자에 있으며 구매자는 이를 동의하셔야 합니다.',
  '',
  '이 모든 대화 내역은 증거자료로 남습니다.',
  '',
  '',
  '동의하지 않으시면 취소 하시면 됩니다.',
  '원활한 거래 진행을 위해 반드시 안내 문구를 확인 후 동의해 주세요.',
  `동의하시면  [[${BUYER_CONSENT_KEYWORD}]] 이라고 적어주십시요.`,
].join('\n');

export const buildBuyerConsentRequestMessage = (tradeId?: string) => {
  const normalizedTradeId = String(tradeId || '').trim();
  return normalizedTradeId
    ? `구매주문번호: ${normalizedTradeId}\n\n${BUYER_CONSENT_REQUEST_MESSAGE}`
    : BUYER_CONSENT_REQUEST_MESSAGE;
};
