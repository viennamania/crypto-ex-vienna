'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';


export default function OrangeXPage() {
    const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');

    // 배너 광고 데이터 (실제로는 API에서 가져올 수 있습니다)
    const bannerAds = [
        {
            id: 1,
            title: 'Bitrefill - USDT 결제',
            image: '/ads/tetherpay-bitrefill.svg',
            link: 'https://www.bitrefill.com',
        },
        {
            id: 2,
            title: 'Travala - USDT 결제',
            image: '/ads/tetherpay-travala.svg',
            link: 'https://www.travala.com',
        },
        {
            id: 3,
            title: 'CoinGate - USDT 결제',
            image: '/ads/tetherpay-coingate.svg',
            link: 'https://coingate.com',
        },
        {
            id: 4,
            title: 'NOWPayments - USDT 결제',
            image: '/ads/tetherpay-nowpayments.svg',
            link: 'https://nowpayments.io',
        },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
            {/* PC 좌측 광고 배너 */}
            <aside className="hidden lg:block fixed left-0 top-20 w-56 h-[calc(100vh-5rem)] overflow-y-auto p-4 space-y-4">
                {bannerAds.map((ad) => (
                    <a key={`left-${ad.id}`} href={ad.link} className="block" target="_blank" rel="noreferrer">
                        <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg shadow-md p-3 hover:shadow-lg transition">
                            <div className="relative aspect-[2/1] rounded overflow-hidden bg-slate-100">
                                <Image
                                    src={ad.image}
                                    alt={ad.title}
                                    fill
                                    sizes="(min-width: 1024px) 224px, 50vw"
                                    className="object-contain"
                                />
                            </div>
                        </div>
                    </a>
                ))}
            </aside>

            {/* PC 우측 광고 배너 */}
            <aside className="hidden lg:block fixed right-0 top-20 w-56 h-[calc(100vh-5rem)] overflow-y-auto p-4 space-y-4">
                {bannerAds.map((ad) => (
                    <a key={`right-${ad.id}`} href={ad.link} className="block" target="_blank" rel="noreferrer">
                        <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg shadow-md p-3 hover:shadow-lg transition">
                            <div className="relative aspect-[2/1] rounded overflow-hidden bg-slate-100">
                                <Image
                                    src={ad.image}
                                    alt={ad.title}
                                    fill
                                    sizes="(min-width: 1024px) 224px, 50vw"
                                    className="object-contain"
                                />
                            </div>
                        </div>
                    </a>
                ))}
            </aside>

            {/* 메인 컨텐츠 */}
            <main className="container mx-auto max-w-5xl px-4 lg:px-6 pb-12 lg:pb-8">
                {/* 히어로 섹션 */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl shadow-2xl p-8 md:p-12 my-8">
                    <div className="text-center">
                        <h1 className="text-3xl md:text-5xl font-bold mb-4">
                            OrangeX 테더 P2P 마켓
                        </h1>
                        <p className="text-lg md:text-xl text-white mb-8">
                            개인 간 테더(USDT) 구매·판매를 안전하게 연결합니다
                        </p>
                        
                        {/* CTA 버튼 */}
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-2xl mx-auto">
                            <Link 
                                href="/ko/buyer/buyorder"
                                className="w-full sm:w-auto bg-white text-orange-600 hover:bg-orange-50 font-bold py-4 px-8 rounded-xl shadow-lg transition transform hover:scale-105 text-center"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="inline-block">
                                        <path d="M6 6h15l-1.5 9h-13L6 6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M9 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/>
                                        <path d="M18 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/>
                                    </svg>
                                    구매하기
                                </div>
                            </Link>
                            <Link 
                                href="/ko/seller/buyorder"
                                className="w-full sm:w-auto bg-slate-800 text-white hover:bg-slate-700 font-bold py-4 px-8 rounded-xl shadow-lg transition transform hover:scale-105 text-center"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="inline-block">
                                        <path d="M12 2l7 7-7 7-7-7 7-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    판매하기
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* 주요 기능 소개 */}
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-blue-600">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-center mb-3 text-slate-900">안전한 거래</h3>
                        <p className="text-slate-900 text-center">
                            에스크로 시스템으로 거래 금액을 안전하게 보호합니다
                        </p>
                    </div>

                    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-green-600">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-center mb-3 text-slate-900">빠른 처리</h3>
                        <p className="text-slate-900 text-center">
                            실시간 거래 매칭과 즉시 정산 시스템
                        </p>
                    </div>

                    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-purple-600">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-center mb-3 text-slate-900">P2P 거래</h3>
                        <p className="text-slate-900 text-center">
                            개인간 직접 거래로 최적의 가격을 찾을 수 있습니다
                        </p>
                    </div>
                </div>

                {/* 에스크로 시스템 설명 */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl p-8 md:p-12 mb-12 text-white">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
                        🔒 에스크로 시스템이란?
                    </h2>
                    
                    <div className="max-w-4xl mx-auto">
                        <div className="grid md:grid-cols-2 gap-8 mb-8">
                            <div className="bg-white/10 backdrop-blur rounded-xl p-6">
                                <div className="text-4xl mb-4">1️⃣</div>
                                <h3 className="text-xl font-bold mb-3">구매자가 주문</h3>
                                <p className="text-slate-100">
                                    구매자가 원하는 금액으로 테더 구매 주문을 생성합니다
                                </p>
                            </div>
                            
                            <div className="bg-white/10 backdrop-blur rounded-xl p-6">
                                <div className="text-4xl mb-4">2️⃣</div>
                                <h3 className="text-xl font-bold mb-3">판매자가 에스크로에 입금</h3>
                                <p className="text-slate-100">
                                    판매자가 테더를 에스크로 지갑에 안전하게 예치합니다
                                </p>
                            </div>
                            
                            <div className="bg-white/10 backdrop-blur rounded-xl p-6">
                                <div className="text-4xl mb-4">3️⃣</div>
                                <h3 className="text-xl font-bold mb-3">구매자가 원화 송금</h3>
                                <p className="text-slate-100">
                                    구매자가 판매자 계좌로 원화를 송금하고 송금 완료 버튼을 클릭합니다
                                </p>
                            </div>
                            
                            <div className="bg-white/10 backdrop-blur rounded-xl p-6">
                                <div className="text-4xl mb-4">4️⃣</div>
                                <h3 className="text-xl font-bold mb-3">판매자 확인 후 전송</h3>
                                <p className="text-slate-100">
                                    판매자가 입금을 확인하면 에스크로에서 구매자에게 테더가 자동 전송됩니다
                                </p>
                            </div>
                        </div>

                        <div className="bg-orange-500/20 border border-orange-500/50 rounded-xl p-6 text-center">
                            <p className="text-lg text-white">
                                ✨ <strong>중간에서 자금을 보호</strong>하여 안전한 거래를 보장합니다!
                            </p>
                        </div>
                    </div>
                </div>

                {/* 거래 방법 */}
                <div className="grid md:grid-cols-2 gap-8 mb-12">
                    {/* 구매 방법 */}
                    <div className="bg-white rounded-xl shadow-lg p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                                구매
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">테더 구매 방법</h3>
                        </div>
                        
                        <ol className="space-y-4 text-slate-900">
                            <li className="flex gap-3">
                                <span className="font-bold text-blue-500">1.</span>
                                <span>원하는 금액과 가격의 판매 주문을 선택합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-blue-500">2.</span>
                                <span>판매자가 에스크로에 테더를 예치할 때까지 대기합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-blue-500">3.</span>
                                <span>판매자 계좌로 원화를 송금합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-blue-500">4.</span>
                                <span>송금 완료 버튼을 클릭합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-blue-500">5.</span>
                                <span>판매자 확인 후 테더가 자동으로 지갑에 입금됩니다</span>
                            </li>
                        </ol>

                        <Link 
                            href="/ko/buyer/buyorder"
                            className="mt-8 block w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-xl text-center transition"
                        >
                            지금 구매하기 →
                        </Link>
                    </div>

                    {/* 판매 방법 */}
                    <div className="bg-white rounded-xl shadow-lg p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                                판매
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">테더 판매 방법</h3>
                        </div>
                        
                        <ol className="space-y-4 text-slate-900">
                            <li className="flex gap-3">
                                <span className="font-bold text-green-500">1.</span>
                                <span>판매할 테더 수량과 가격을 설정하여 주문을 등록합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-green-500">2.</span>
                                <span>구매자가 주문을 수락하면 알림을 받습니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-green-500">3.</span>
                                <span>에스크로 지갑으로 테더를 전송합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-green-500">4.</span>
                                <span>구매자의 원화 입금을 확인합니다</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-bold text-green-500">5.</span>
                                <span>입금 확인 버튼을 누르면 거래가 완료됩니다</span>
                            </li>
                        </ol>

                        <Link 
                            href="/ko/seller/buyorder"
                            className="mt-8 block w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl text-center transition"
                        >
                            지금 판매하기 →
                        </Link>
                    </div>
                </div>

                {/* FAQ */}
                <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
                    <h2 className="text-3xl font-bold text-center mb-8 text-slate-900">자주 묻는 질문</h2>
                    
                    <div className="space-y-6 max-w-3xl mx-auto">
                        <div className="border-b pb-4">
                            <h4 className="font-bold text-lg mb-2 text-slate-900">❓ 거래는 안전한가요?</h4>
                            <p className="text-slate-900">
                                네, 에스크로 시스템을 통해 거래 금액을 중간에서 안전하게 보호합니다. 
                                판매자와 구매자 모두 입금 확인 후에만 거래가 완료되므로 안심하고 거래할 수 있습니다.
                            </p>
                        </div>
                        
                        <div className="border-b pb-4">
                            <h4 className="font-bold text-lg mb-2 text-slate-900">❓ 수수료는 얼마인가요?</h4>
                            <p className="text-slate-900">
                                거래 수수료는 거래 금액의 일정 비율로 부과됩니다. 
                                자세한 수수료 정보는 거래 페이지에서 확인하실 수 있습니다.
                            </p>
                        </div>
                        
                        <div className="border-b pb-4">
                            <h4 className="font-bold text-lg mb-2 text-slate-900">❓ 거래는 얼마나 걸리나요?</h4>
                            <p className="text-slate-900">
                                일반적으로 구매자의 입금부터 판매자 확인까지 10-30분 정도 소요됩니다. 
                                은행 송금 시간에 따라 다소 차이가 있을 수 있습니다.
                            </p>
                        </div>
                        
                        <div>
                            <h4 className="font-bold text-lg mb-2 text-slate-900">❓ 분쟁이 발생하면 어떻게 하나요?</h4>
                            <p className="text-slate-900">
                                거래 중 문제가 발생하면 고객센터로 연락주시면 전문 상담원이 신속하게 도와드립니다. 
                                에스크로 시스템으로 자금은 안전하게 보호됩니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* 최종 CTA */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl shadow-2xl p-8 text-center text-white">
                    <h2 className="text-3xl font-bold mb-4">지금 바로 시작하세요!</h2>
                    <p className="text-xl text-white mb-8">
                        개인 간 테더 거래를 쉽고 안전하게
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link 
                            href="/ko/buyer/buyorder"
                            className="w-full sm:w-auto bg-white text-orange-600 hover:bg-orange-50 font-bold py-4 px-8 rounded-xl shadow-lg transition transform hover:scale-105"
                        >
                            구매하기 →
                        </Link>
                        <Link 
                            href="/ko/seller/buyorder"
                            className="w-full sm:w-auto bg-slate-800 text-white hover:bg-slate-700 font-bold py-4 px-8 rounded-xl shadow-lg transition transform hover:scale-105"
                        >
                            판매하기 →
                        </Link>
                    </div>
                </div>
            </main>

            {/* 모바일 하단 광고 배너 */}
            <div className="lg:hidden bg-white border-t border-gray-200 shadow-lg overflow-x-auto">
                <div className="flex gap-3 p-3 min-w-max">
                    {bannerAds.map((ad) => (
                        <a
                            key={`mobile-${ad.id}`}
                            href={ad.link}
                            className="flex-shrink-0 w-56"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg p-2 shadow-md hover:shadow-lg transition">
                                <div className="relative aspect-[2/1] rounded overflow-hidden bg-slate-100">
                                    <Image
                                        src={ad.image}
                                        alt={ad.title}
                                        fill
                                        sizes="(min-width: 1024px) 224px, 60vw"
                                        className="object-contain"
                                    />
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}
