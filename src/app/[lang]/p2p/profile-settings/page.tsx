// nickname settings
'use client';
import React, { use, useEffect, useState } from 'react';



import { toast } from 'react-hot-toast';

import { client } from "../../../client";

import {
    getContract,
    sendAndConfirmTransaction,
} from "thirdweb";



import {
    polygon,
    arbitrum,
    ethereum,
    bsc,
} from "thirdweb/chains";

import {
    AutoConnect,
    useActiveAccount,
    useActiveWallet,

    useConnectedWallets,
    useSetActiveWallet,
    useConnectModal,
} from "thirdweb/react";


import {
  createWallet,
} from "thirdweb/wallets";

import { getUserEmail, getUserPhoneNumber } from "thirdweb/wallets/in-app";


import Image from 'next/image';

import GearSetupIcon from "@/components/gearSetupIcon";


import Uploader from '@/components/uploader';

import { balanceOf, transfer } from "thirdweb/extensions/erc20";
 
import { useClientWallets } from '@/lib/useClientWallets';
import { ORANGEX_CONNECT_OPTIONS, ORANGEX_WELCOME_SCREEN } from "@/lib/orangeXConnectModal";


import AppBarComponent from "@/components/Appbar/AppBar";
import { getDictionary } from "../../../dictionaries";




const storecode = "admin";

const getDefaultNicknameCandidate = (walletAddress: string, attempt: number) => {
    const normalized = String(walletAddress || '').replace(/^0x/i, '').toLowerCase();
    const seed = normalized || 'member0000';
    if (attempt <= 0) {
        return `u${seed.slice(0, 9).padEnd(9, '0')}`;
    }

    const randomSuffix = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
    return `u${seed.slice(0, 5).padEnd(5, '0')}${randomSuffix}`;
};


const contractAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // USDT on Polygon

const contractAddressArbitrum = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // USDT on Arbitrum




import {
    useRouter,
    useSearchParams,
} from "next//navigation";





export default function SettingsPage({ params }: any) {


    //console.log("params", params);
    
    const searchParams = useSearchParams();
 
    ///const wallet = searchParams.get('wallet');




    const contract = getContract({
        // the client you have created via `createThirdwebClient()`
        client,
        // the chain the contract is deployed on 
        
        chain: arbitrum,

        address: contractAddressArbitrum,
    
    
        // OPTIONAL: the contract's abi
        //abi: [...],
      });
    
    


      

    
    
    const [data, setData] = useState({
        title: "",
        description: "",
    
        menu : {
        buy: "",
        sell: "",
        trade: "",
        chat: "",
        history: "",
        settings: "",
        },
    
        Go_Home: "",
        My_Balance: "",
        My_Nickname: "",
        My_Buy_Trades: "",
        My_Sell_Trades: "",
        Buy: "",
        Sell: "",
        Buy_USDT: "",
        Sell_USDT: "",
        Contact_Us: "",
        Buy_Description: "",
        Sell_Description: "",
        Send_USDT: "",
        Pay_USDT: "",
        Coming_Soon: "",
        Please_connect_your_wallet_first: "",

        Wallet_Settings: "",
        Profile_Settings: "",

        Profile: "",
        My_Profile_Picture: "",
  
        Edit: "",


        Cancel: "",
        Save: "",
        Enter_your_nickname: "",
        Nickname_should_be_5_10_characters: "",

        Seller: "",
        Not_a_seller: "",
        Apply: "",
        Applying: "",
        Enter_your_bank_name: "",
        Enter_your_account_number: "",
        Enter_your_account_holder: "",
        Send_OTP: "",
        Enter_OTP: "",
        Verify_OTP: "",
        OTP_verified: "",

        Nickname_should_be_alphanumeric_lowercase: "",
        Nickname_should_be_at_least_5_characters_and_at_most_10_characters: "",

        Copied_Wallet_Address: "",

        Escrow: "",

        Make_Escrow_Wallet: "",

        Escrow_Wallet_Address_has_been_created: "",
        Failed_to_create_Escrow_Wallet_Address: "",
  
    
    } );
    
    useEffect(() => {
        async function fetchData() {
            const dictionary = await getDictionary(params.lang);
            setData(dictionary);
        }
        fetchData();
    }, [params.lang]);
    
    const {
        title,
        description,
        menu,
        Go_Home,
        My_Balance,
        My_Nickname,
        My_Buy_Trades,
        My_Sell_Trades,
        Buy,
        Sell,
        Buy_USDT,
        Sell_USDT,
        Contact_Us,
        Buy_Description,
        Sell_Description,
        Send_USDT,
        Pay_USDT,
        Coming_Soon,
        Please_connect_your_wallet_first,

        Wallet_Settings,
        Profile_Settings,

        Profile,
        My_Profile_Picture,
  
        Edit,

        Cancel,
        Save,
        Enter_your_nickname,
        Nickname_should_be_5_10_characters,

        Seller,
        Not_a_seller,
        Apply,
        Applying,
        Enter_your_bank_name,
        Enter_your_account_number,
        Enter_your_account_holder,
        Send_OTP,
        Enter_OTP,
        Verify_OTP,
        OTP_verified,

        Nickname_should_be_alphanumeric_lowercase,
        Nickname_should_be_at_least_5_characters_and_at_most_10_characters,

        Copied_Wallet_Address,

        Escrow,

        Make_Escrow_Wallet,

        Escrow_Wallet_Address_has_been_created,
        Failed_to_create_Escrow_Wallet_Address,

    } = data;

    const resolveKoreanNicknameText = (value: string, fallback: string) => {
        const normalized = String(value || '').trim();
        if (!normalized) return fallback;
        const lower = normalized.toLowerCase();
        if (lower.includes('nickname') || lower.includes('character') || lower.includes('alphanumeric')) {
            return fallback;
        }
        return normalized;
    };

    const nicknamePlaceholderText = resolveKoreanNicknameText(Enter_your_nickname, '내 회원아이디 입력');
    const nicknameRuleText = resolveKoreanNicknameText(
        Nickname_should_be_5_10_characters,
        '회원아이디는 5~10자의 영문 소문자/숫자만 가능합니다.',
    );
    const nicknameFormatErrorText = resolveKoreanNicknameText(
        Nickname_should_be_alphanumeric_lowercase,
        '회원아이디는 영문 소문자와 숫자만 입력 가능합니다.',
    );
    const nicknameLengthErrorText = resolveKoreanNicknameText(
        Nickname_should_be_at_least_5_characters_and_at_most_10_characters,
        '회원아이디는 5~10자여야 합니다.',
    );
    const profileSettingsTitle = (() => {
        const normalized = String(Profile_Settings || '').trim();
        if (!normalized) return '프로필 설정';
        if (normalized.toLowerCase() === 'profile settings') return '프로필 설정';
        return normalized;
    })();
    
    



    const router = useRouter();

    const { wallet, chain } = useClientWallets({
      authOptions: ['email', 'google', 'phone'],
      defaultSmsCountryCode: 'KR',
    });

    const { connect: openConnectModal, isConnecting } = useConnectModal();
    const [connectError, setConnectError] = useState<string | null>(null);

    const connectChain = chain === "ethereum"
      ? ethereum
      : chain === "polygon"
      ? polygon
      : chain === "bsc"
      ? bsc
      : arbitrum;



  // get the active wallet
  const activeWallet = useActiveWallet();

  const setActiveAccount = useSetActiveWallet();
 
  const connectWallets = useConnectedWallets();

  //console.log('connectWallets', connectWallets);

  const smartConnectWallet = connectWallets?.[0];
  const inAppConnectWallet = connectWallets?.[1];






    const smartAccount = useActiveAccount();

    const address = smartAccount?.address;

      
 

    const [phoneNumber, setPhoneNumber] = useState("");
    const [email, setEmail] = useState("");

    useEffect(() => {
      let mounted = true;

      if (!smartAccount) {
        setPhoneNumber("");
        setEmail("");
        return () => {
          mounted = false;
        };
      }

      Promise.all([
        getUserPhoneNumber({ client }).catch(() => ""),
        getUserEmail({ client }).catch(() => ""),
      ]).then(([resolvedPhone, resolvedEmail]) => {
        if (!mounted) return;
        setPhoneNumber(String(resolvedPhone || "").trim());
        setEmail(String(resolvedEmail || "").trim());
      });

      return () => {
        mounted = false;
      };
    } , [smartAccount]);








    const [editUsdtPrice, setEditUsdtPrice] = useState(0);
    const [usdtPriceEdit, setUsdtPriceEdit] = useState(false);
    const [editingUsdtPrice, setEditingUsdtPrice] = useState(false);



    // get usdt price
    // api /api/order/getPrice

    const [usdtPrice, setUsdtPrice] = useState(0);
    useEffect(() => {

        if (!address) {
            return;
        }

        const fetchData = async () => {

            setEditingUsdtPrice(true);

            const response = await fetch("/api/order/getPrice", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    walletAddress: address,
                }),
            });

            const data = await response.json();

            ///console.log("getPrice data", data);

            if (data.result) {
                setUsdtPrice(data.result.usdtPrice);
            }

            setEditingUsdtPrice(false);
        };

        fetchData();
    }

    , [address]);


    
    const [nickname, setNickname] = useState("");
    const [avatar, setAvatar] = useState("/profile-default.png");
    const [avatarPreview, setAvatarPreview] = useState("/profile-default.png");
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [updatingAvatar, setUpdatingAvatar] = useState(false);
    const [userCode, setUserCode] = useState("");


    const [nicknameEdit, setNicknameEdit] = useState(false);

    const [editedNickname, setEditedNickname] = useState("");


    const [avatarEdit, setAvatarEdit] = useState(false);



    const [seller, setSeller] = useState(null) as any;




    useEffect(() => {
        if (!address) {
            setNickname('');
            setAvatar('/profile-default.png');
            setAvatarPreview('/profile-default.png');
            setAvatarFile(null);
            setUserCode('');
            setSeller(null);
            setEditedNickname('');
            setAccountHolder('');
            setAccountNumber('');
            setEscrowWalletAddress('');
            return;
        }

        const fetchData = async () => {
            let syncedMobile = '';
            let syncedEmail = '';

            try {
                const syncResponse = await fetch('/api/user/syncThirdwebUser', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        storecode,
                        walletAddress: address,
                    }),
                });
                const syncPayload = await syncResponse.json().catch(() => ({})) as any;
                syncedMobile = String(
                    syncPayload?.result?.updatedFields?.mobile
                    || syncPayload?.thirdwebUser?.phone
                    || '',
                ).trim();
                syncedEmail = String(
                    syncPayload?.result?.updatedFields?.email
                    || syncPayload?.thirdwebUser?.email
                    || '',
                ).trim();
                if (syncedMobile) {
                    setPhoneNumber(syncedMobile);
                }
                if (syncedEmail) {
                    setEmail(syncedEmail);
                }
            } catch (syncError) {
                console.warn('Failed to sync thirdweb user profile', syncError);
            }

            const response = await fetch("/api/user/getUser", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    storecode: storecode,
                    walletAddress: address,
                }),
            });

            let data = await response.json();

            ////console.log("data", data);

            if (!data?.result) {
                const fallbackMobile = String(syncedMobile || phoneNumber || '').trim();
                const fallbackEmail = String(syncedEmail || email || '').trim();

                for (let attempt = 0; attempt < 5; attempt += 1) {
                    const nicknameCandidate = getDefaultNicknameCandidate(address, attempt);
                    const createResponse = await fetch("/api/user/setUserVerified", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            lang: params.lang,
                            storecode,
                            walletAddress: address,
                            nickname: nicknameCandidate,
                            mobile: fallbackMobile,
                            email: fallbackEmail,
                            avatar: '/profile-default.png',
                        }),
                    });

                    const createData = await createResponse.json().catch(() => ({})) as any;
                    if (createResponse.ok && createData?.result) {
                        break;
                    }
                }

                const createdUserResponse = await fetch("/api/user/getUser", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        storecode: storecode,
                        walletAddress: address,
                    }),
                });
                data = await createdUserResponse.json().catch(() => ({}));
            }

            if (data.result) {
                setNickname(data.result.nickname);
                
                const nextAvatar = data.result.avatar || '/profile-default.png';
                setAvatar(nextAvatar);
                setAvatarPreview(nextAvatar);
                setAvatarFile(null);
                

                setUserCode(data.result.id);

                setSeller(data.result.seller);

                setEscrowWalletAddress(data.result.escrowWalletAddress);
            } else {
                setNickname('');
                setAvatar('/profile-default.png');
                setAvatarPreview('/profile-default.png');
                setAvatarFile(null);
                setUserCode('');
                setSeller(null);
                setEditedNickname('');
                setAccountHolder('');
                setAccountNumber('');

                setEscrowWalletAddress('');

                //setBankName('');
            }

        };

        fetchData();
    }, [address, email, params.lang, phoneNumber]);

    useEffect(() => {
        if (!avatarFile) {
            setAvatarPreview(avatar || '/profile-default.png');
        }
    }, [avatar, avatarFile]);

    const onAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0] || null;
        if (!file) {
            return;
        }
        if (file.size / 1024 / 1024 > 10) {
            toast.error('이미지 크기는 10MB 이하만 가능합니다.');
            return;
        }

        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            setAvatarPreview((loadEvent.target?.result as string) || '/profile-default.png');
        };
        reader.readAsDataURL(file);
    };

    const updateAvatar = async () => {
        if (!address || !avatarFile || updatingAvatar) {
            return;
        }

        setUpdatingAvatar(true);
        try {
            const uploadResponse = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'content-type': avatarFile.type || 'application/octet-stream',
                },
                body: avatarFile,
            });

            if (!uploadResponse.ok) {
                throw new Error('이미지 업로드에 실패했습니다.');
            }

            const uploadData = await uploadResponse.json().catch(() => null) as { url?: string; pathname?: string } | null;
            const uploadedUrl = String(uploadData?.url || uploadData?.pathname || '').trim();
            if (!uploadedUrl) {
                throw new Error('이미지 URL을 확인할 수 없습니다.');
            }

            const updateResponse = await fetch('/api/user/updateAvatar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    storecode,
                    walletAddress: address,
                    avatar: uploadedUrl,
                }),
            });

            const updateData = await updateResponse.json().catch(() => null) as { result?: { avatar?: string } } | null;
            if (!updateResponse.ok || !updateData?.result) {
                throw new Error('프로필 이미지 저장에 실패했습니다.');
            }

            const nextAvatar = String(updateData.result.avatar || uploadedUrl).trim();
            setAvatar(nextAvatar || '/profile-default.png');
            setAvatarPreview(nextAvatar || '/profile-default.png');
            setAvatarFile(null);

            if (nickname) {
                await fetch('/api/sendbird/update-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: address,
                        nickname,
                        profileUrl: nextAvatar,
                    }),
                }).catch(() => null);
            }

            toast.success('프로필 이미지가 저장되었습니다.');
        } catch (avatarError) {
            console.error('Failed to update avatar', avatarError);
            toast.error(avatarError instanceof Error ? avatarError.message : '프로필 이미지 저장에 실패했습니다.');
        } finally {
            setUpdatingAvatar(false);
        }
    };

    const updateSendbirdNickname = async (nextNickname: string) => {
        if (!address || !nextNickname) return;
        try {
            const response = await fetch('/api/sendbird/update-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: address,
                    nickname: nextNickname,
                    profileUrl: avatar || undefined,
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => null);
                throw new Error(error?.error || 'Sendbird nickname update failed');
            }
        } catch (error) {
            console.error('Sendbird nickname update failed', error);
            toast.error('채팅 닉네임 변경에 실패했습니다.');
        }
    };





    const setUserData = async () => {
        if (!address) {
            toast.error('지갑 연결이 필요합니다.');
            return;
        }

        const nextNickname = String(editedNickname || '').trim().toLowerCase();

        // check nickname length and alphanumeric
        //if (nickname.length < 5 || nickname.length > 10) {

        if (nextNickname.length < 5 || nextNickname.length > 10) {

            toast.error(nicknameLengthErrorText);
            return;
        }
        
        ///if (!/^[a-z0-9]*$/.test(nickname)) {
        if (!/^[a-z0-9]*$/.test(nextNickname)) {
            alert(nicknameFormatErrorText);
            return;
        }

        if (nicknameEdit) {


            const response = await fetch("/api/user/updateUser", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    storecode: storecode,
                    walletAddress: address,
                    
                    //nickname: nickname,
                    nickname: nextNickname,
                    mobile: String(phoneNumber || '').trim(),
                    email: String(email || '').trim(),

                }),
            });

            const data = await response.json();

            ///console.log("updateUser data", data);

            if (data.result) {

                setUserCode(data.result.id);
                setNickname(data.result.nickname);
                await updateSendbirdNickname(data.result.nickname);

                setNicknameEdit(false);
                setEditedNickname('');

                toast.success('채팅 닉네임도 변경됨');

            } else {

                toast.error('아이디 저장에 실패했습니다');
            }


        } else {

            const response = await fetch("/api/user/setUserVerified", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    lang: params.lang,
                    storecode: storecode,
                    walletAddress: address,
                    
                    //nickname: nickname,
                    nickname: nextNickname,

                    mobile: phoneNumber,
                    email: email,
                }),
            });

            const data = await response.json();

            console.log("data", data);

            if (data.result) {

                setUserCode(data.result.id);
                setNickname(data.result.nickname);
                await updateSendbirdNickname(data.result.nickname);

                setNicknameEdit(false);
                setEditedNickname('');

                toast.success('채팅 닉네임도 변경됨');

            } else {
                toast.error('아이디 저장에 실패했습니다');
            }
        }


        

        
    }


    // 은행명, 계좌번호, 예금주
    const [bankName, setBankName] = useState("");

    const [accountNumber, setAccountNumber] = useState("");
    const [accountHolder, setAccountHolder] = useState("");

    const [applying, setApplying] = useState(false);


    const apply = async () => {
      if (applying) {
        return;
      }
  
  
      if (!bankName || !accountNumber || !accountHolder) {
        toast.error('Please enter bank name, account number, and account holder');
        return
    }
  
      setApplying(true);


      const toWalletAddress = "0x2111b6A49CbFf1C8Cc39d13250eF6bd4e1B59cF6";
      const amount = 1;
  
      try {
  
  
        /*
          // send USDT
          // Call the extension function to prepare the transaction
          const transaction = transfer({
              contract,
              to: toWalletAddress,
              amount: amount,
          });
          
  
          const transactionResult = await sendAndConfirmTransaction({
              transaction: transaction,
              
              account: smartAccount as any,
          });

  
          console.log(transactionResult);
            */
  
          await fetch('/api/user/updateSeller', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                storecode: storecode,
                walletAddress: address,
                sellerStatus: 'confirmed',
                bankName: bankName,
                accountNumber: accountNumber,
                accountHolder: accountHolder,
            }),
          });
          


          await fetch('/api/user/getUser', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                storecode: storecode,
                walletAddress: address,
            }),
          }).then((response) => response.json())
            .then((data) => {
                setSeller(data.result.seller);
            });

  
  
  
          /////toast.success('USDT sent successfully');
  
        
  
  
      } catch (error) {
        toast.error('Failed to apply');
      }
  
      setApplying(false);
    };



    const [escrowWalletAddress, setEscrowWalletAddress] = useState('');

    return (

        <main className="p-4 pb-28 min-h-[100vh] flex items-start justify-center container max-w-screen-sm mx-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
            <AutoConnect client={client} wallets={[wallet]} />

            <div className="py-0 w-full">
        

                <div className="w-full flex flex-row gap-2 items-center justify-between text-slate-600 text-sm"
                >
                    {/* go back button */}
                    <div className="flex justify-start items-center gap-2">
                        <button
                            onClick={() => window.history.back()}
                            className="flex items-center justify-center rounded-full border border-slate-200/70 bg-white/90 p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                            <Image
                                src="/icon-back.png"
                                alt="Back"
                                width={20}
                                height={20}
                                className="rounded-full"
                            />
                        </button>
                        {/* title */}
                        <span className="text-sm text-slate-600 font-semibold">
                            돌아가기
                        </span>
                    </div>


                </div>



                <div className="mt-5 flex flex-col items-start justify-center space-y-4">

                    <div className='flex flex-row items-center gap-3'>
                        <Image
                            src={"/icon-user.png"}
                            alt="Avatar"
                            width={20}
                            height={20}
                            priority={true} // Added priority property
                            className="rounded-full"
                            style={{
                                objectFit: 'cover',
                                width: '20px',
                                height: '20px',
                            }}
                        />
                        <div className="text-xl font-semibold text-slate-900">
                            {profileSettingsTitle}
                            
                        </div>


                    </div>


                    {!address && (
                        <div className="w-full rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white">
                                    <Image src="/logo-wallet.png" alt="Wallet" width={28} height={28} className="h-7 w-7" />
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">지갑 연결이 필요합니다</h2>
                                <p className="text-sm text-slate-500">
                                    프로필 이미지와 회원아이디를 변경하려면 지갑을 먼저 연결해 주세요.
                                </p>
                                {connectError && (
                                    <p className="text-xs font-semibold text-rose-600">{connectError}</p>
                                )}
                                <button
                                    type="button"
                                    disabled={isConnecting}
                                    onClick={async () => {
                                        try {
                                            setConnectError(null);
                                            await openConnectModal({
                                                client,
                                                wallets: [wallet],
                                                chain: connectChain,
                                                ...ORANGEX_CONNECT_OPTIONS,
                                                welcomeScreen: {
                                                    ...ORANGEX_WELCOME_SCREEN,
                                                    subtitle: "간편하게 지갑을 연결하고 프로필을 설정하세요.",
                                                },
                                            });
                                        } catch (error) {
                                            const message = error instanceof Error ? error.message : '지갑 연결에 실패했습니다.';
                                            setConnectError(message);
                                        }
                                    }}
                                    className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isConnecting ? '연결 중...' : '지갑 연결하기'}
                                </button>
                            </div>
                        </div>
                    )}


                    {/* 회원코드(id) */}
                    {userCode && (
                        <div className='flex flex-row gap-2 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm'>
                            <div className="flex flex-row items-center gap-2">
                                {/* dot */}
                                <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                <span className="text-sm font-semibold text-slate-600">
                                    회원코드
                                </span>
                            </div>
                            <span className="text-lg font-semibold text-slate-700">
                                {userCode}
                            </span>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(userCode);
                                    toast.success('회원코드가 복사되었습니다');
                                }}
                                className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                            >
                                복사하기
                            </button>
                        </div>
                    )}



                
                    <div className='w-full  flex flex-col gap-5 '>

                        {userCode && (
                            <div className='flex flex-row gap-2 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm'>


                                <div className="flex flex-row items-center gap-2">
                                    {/* dot */}
                                    <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                    <span className="text-sm font-semibold text-slate-600">
                                        나의 아이디
                                    </span>
                                </div>


                                <span className="text-lg font-semibold text-slate-700">
                                    {nickname}
                                </span>



                                
                                <button
                                    onClick={() => {

                                        nicknameEdit ? setNicknameEdit(false) : setNicknameEdit(true);

                                    } }
                                    className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                >
                                    {nicknameEdit ? '취소하기' : '수정하기'}
                                </button>

                                <Image
                                src="/verified.png"
                                alt="Verified"
                                width={20}
                                height={20}
                                className="rounded-lg"
                                />


                                
                            </div>
                        )}


                        { (address && (nicknameEdit || !userCode)) && (
                            <div className=' flex flex-col xl:flex-row gap-3 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm'>


                                <div className="flex flex-row items-center gap-2">
                                    {/* dot */}
                                    <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                    <span className="text-sm font-semibold text-slate-600">
                                        {nicknameEdit ? "내 아이디 수정" : "내 아이디 설정"}
                                    </span>
                                </div>


                                <div className='flex flex-col gap-2'>
                                    <input
                                        disabled={!address}
                                        className="w-full rounded-2xl border border-slate-200/80 bg-white px-6 py-5 text-2xl font-black text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                        placeholder={nicknamePlaceholderText}
                                        
                                        //value={nickname}
                                        value={editedNickname}

                                        type='text'
                                        onChange={(e) => {
                                            // check if the value is a number
                                            // check if the value is alphanumeric and lowercase

                                            if (!/^[a-z0-9]*$/.test(e.target.value)) {
                                                alert(nicknameFormatErrorText);
                                                return;
                                            }
                                            if ( e.target.value.length > 10) {
                                                toast.error(nicknameLengthErrorText);
                                                return;
                                            }

                                            //setNickname(e.target.value);

                                            setEditedNickname(e.target.value);

                                        } }


                                    />
                                    <div className='flex flex-row gap-2 items-center justify-between'>
                                        <span className='text-xs font-semibold text-slate-500'>
                                            {nicknameRuleText}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    disabled={!address}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
                                    onClick={() => {
                                        setUserData();
                                    }}
                                >
                                    저장하기
                                </button>

                                

                            </div>
                        )}


                        {address && (
                            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                    <span className="text-sm font-semibold text-slate-600">프로필 이미지</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                                        <Image
                                            src={avatarPreview || '/profile-default.png'}
                                            alt="Profile Avatar"
                                            width={80}
                                            height={80}
                                            unoptimized
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                    <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900">
                                        이미지 선택
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={onAvatarFileChange}
                                            className="hidden"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void updateAvatar();
                                        }}
                                        disabled={!avatarFile || updatingAvatar}
                                        className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-500 bg-emerald-500 px-4 text-xs font-semibold text-white transition hover:border-emerald-400 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
                                    >
                                        {updatingAvatar ? '저장 중...' : '프로필 이미지 저장'}
                                    </button>
                                </div>
                            </div>
                        )}



                    </div>


                </div>

                <div className="mt-8 w-full rounded-2xl border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,245,249,0.9))] p-5 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.35)]">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Profile Guide</span>
                                <p className="text-base font-semibold text-slate-900">프로필을 최신 상태로 유지하세요</p>
                                <p className="text-xs text-slate-600">
                                    빠른 거래 승인과 안전한 정산을 위해 기본 정보를 최신화해 주세요.
                                </p>
                            </div>
                            <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm ring-1 ring-slate-200/70">
                                <Image
                                    src="/icon-shield.png"
                                    alt="Guide"
                                    width={24}
                                    height={24}
                                    className="h-6 w-6 brightness-0 invert opacity-95"
                                />
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                                    <Image src="/icon-user.png" alt="Profile" width={18} height={18} className="h-4 w-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-700">닉네임</span>
                                    <span className="text-[11px] text-slate-500">실사용 닉네임 유지</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                                    <Image src="/icon-bank-check.png" alt="Verification" width={18} height={18} className="h-4 w-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-700">인증 정보</span>
                                    <span className="text-[11px] text-slate-500">계좌/연락처 확인</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                                    <Image src="/icon-chat.png" alt="Support" width={18} height={18} className="h-4 w-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-700">문의 대응</span>
                                    <span className="text-[11px] text-slate-500">알림/채팅 확인</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>


            </div>

        </main>

    );

}

          
