import { NextResponse, type NextRequest } from "next/server";
import { put } from '@vercel/blob';
import { customAlphabet } from 'nanoid';
import { readFile } from 'fs/promises';
import path from 'path';

import {
  getOneByWalletAddress,
	insertOne,
  updateOne,
} from '@lib/api/user';

export const runtime = 'nodejs';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 10);
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const DEFAULT_AVATAR_SOURCE = '/profile-default.png';
const DEFAULT_AVATAR_BLOB_URL = process.env.DEFAULT_AVATAR_BLOB_URL || '';
let cachedDefaultAvatarUrl: string | null = DEFAULT_AVATAR_BLOB_URL || null;

const generateAvatarUrl = async () => {
  if (!OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY is missing; skip avatar generation.');
    return null;
  }

  try {
    const seed = nanoid();
    const prompt =
      `Minimal abstract avatar icon, geometric shape, black and white base with subtle orange accent,` +
      ` centered, high contrast, clean vector style, no text, no letters, no watermark,` +
      ` unique variation ${seed}.`;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn('OpenAI image generation failed', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const imageBase64 = data?.data?.[0]?.b64_json;
    if (!imageBase64) {
      console.warn('OpenAI image generation returned empty data');
      return null;
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const filename = `avatar-${nanoid()}.png`;
    const blob = await put(filename, buffer, {
      contentType: 'image/png',
      access: 'public',
    });

    return blob.url || null;
  } catch (error) {
    console.warn('OpenAI avatar generation error', error);
    return null;
  }
};

const getDefaultAvatarUrl = async () => {
  if (cachedDefaultAvatarUrl) {
    return cachedDefaultAvatarUrl;
  }

  try {
    const filePath = path.join(process.cwd(), 'public', DEFAULT_AVATAR_SOURCE);
    const fileBuffer = await readFile(filePath);
    const filename = `avatar-default-${nanoid()}.png`;
    const blob = await put(filename, fileBuffer, {
      contentType: 'image/png',
      access: 'public',
    });
    cachedDefaultAvatarUrl = blob.url || null;
    return cachedDefaultAvatarUrl || DEFAULT_AVATAR_SOURCE;
  } catch (error) {
    console.warn('Default avatar upload failed', error);
    return DEFAULT_AVATAR_SOURCE;
  }
};

export async function POST(request: NextRequest) {

  const body = await request.json();

  const { storecode, walletAddress, nickname, mobile, avatar } = body;

  console.log("storecode", storecode);
  console.log("walletAddress", walletAddress);
  console.log("nickname", nickname);
  console.log("mobile", mobile);


  if (!storecode || !walletAddress || !nickname) {
    
    console.log("Missing required fields");

    return NextResponse.json({
      error: "Missing required fields: storecode, walletAddress, or nickname",
    }, { status: 400 });
  }

  // Check if the user already exists
  const existingUser = await getOneByWalletAddress(storecode, walletAddress);

  if (existingUser) {

    console.log("User already exists");
    
    // If the user exists, update their information
    
    const updatedUser = await updateOne({
      storecode: storecode,
      walletAddress: walletAddress,
      nickname: nickname,
      mobile: mobile,
    });

    return NextResponse.json({
      result: updatedUser,
    });
  }



  const buyer = {
    depositBankAccountNumber: '123456789',
    depositBankName: 'Bank of Example',
    depositName: 'John Doe',
  };

  const avatarUrl =
    typeof avatar === 'string' && avatar.trim()
      ? avatar.trim()
      : await generateAvatarUrl();
  const finalAvatarUrl = avatarUrl || (await getDefaultAvatarUrl());

  const result = await insertOne({
    storecode: storecode,
    walletAddress: walletAddress,
    nickname: nickname,
    mobile: mobile,
    avatar: finalAvatarUrl,

    buyer: buyer,
  });

  if (!result) {
    console.log("Failed to create user");
    
    return NextResponse.json({
      error: "Failed to create user",
    }, { status: 500 });
  }


 
  return NextResponse.json({

    result,
    
  });
  
}
