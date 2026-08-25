import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const items = await prisma.glossary.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: items });
  } catch (err: any) {
    console.error('Get glossary error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tải từ điển thuật ngữ' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { term, translation } = await request.json();

    if (!term?.trim() || !translation?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Thuật ngữ gốc và dịch không được bỏ trống' },
        { status: 400 }
      );
    }

    // Giới hạn 30 cụm từ
    const count = await prisma.glossary.count();
    if (count >= 30) {
      return NextResponse.json(
        { success: false, error: 'Từ điển tối đa 30 cụm từ' },
        { status: 400 }
      );
    }

    const newItem = await prisma.glossary.create({
      data: {
        term: term.trim(),
        translation: translation.trim(),
      },
    });

    return NextResponse.json({ success: true, data: newItem });
  } catch (err: any) {
    console.error('Create glossary error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể thêm thuật ngữ' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Thiếu ID thuật ngữ' },
        { status: 400 }
      );
    }

    await prisma.glossary.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete glossary error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể xóa thuật ngữ' },
      { status: 500 }
    );
  }
}
