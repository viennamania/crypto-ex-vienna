import { NextResponse, type NextRequest } from "next/server";

import {
	updateAudioNotification,
} from '@lib/api/order';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { orderId, audioOn } = body as { orderId?: string; audioOn?: boolean };

  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    return NextResponse.json({
      success: false,
      message: "orderId is required",
    }, { status: 400 });
  }
  if (!/^[a-fA-F0-9]{24}$/.test(normalizedOrderId)) {
    return NextResponse.json({
      success: false,
      message: "invalid orderId format",
    }, { status: 400 });
  }
  if (typeof audioOn !== 'boolean') {
    return NextResponse.json({
      success: false,
      message: "audioOn must be boolean",
    }, { status: 400 });
  }

  try {
    // Call the function to update the audio notification setting
    const updatedOrder = await updateAudioNotification({
      orderId: normalizedOrderId,
      audioOn,
    });

    if (!updatedOrder) {
      return NextResponse.json({
        success: false,
        message: "Order not found or audio setting unchanged",
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Audio notification setting updated successfully",
      result: {
        orderId: normalizedOrderId,
        audioOn,
      },
    });

  } catch (error) {
    console.error("Error updating audio notification setting:", error);
    return NextResponse.json({
      success: false,
      message: "Failed to update audio notification setting",
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
