import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSheetValues, updateSheetRow } from '@/lib/google';
import { z } from 'zod';

// 입력값 검증 스키마 (Zod)
const moderateSchema = z.object({
  rowNumber: z.number().int().min(2), // 1은 헤더이므로 최소 2행부터 가능
  status: z.enum(['APPROVED', 'REJECTED', 'PENDING']),
  hours: z.number().positive(),
  editedContent: z.string().optional(),
});

export async function POST(request: Request) {
  // 1. 인증 및 교사 권한 검증
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'TEACHER') {
    return NextResponse.json(
      { error: '교사 권한이 필요하거나 세션이 만료되었습니다.' },
      { status: 403 }
    );
  }

  try {
    // 2. 입력값 파싱 및 검증
    const body = await request.json();
    const result = moderateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: '입력 형식이 올바르지 않습니다.', details: result.error.issues },
        { status: 400 }
      );
    }


    const { rowNumber, status, hours, editedContent } = result.data;

    // 3. ActivityLogs 헤더 구조 스캔
    const headerRow = await getSheetValues('ActivityLogs', 'A1:Z1');
    if (headerRow.length === 0) {
      return NextResponse.json({ error: '시트 데이터를 찾을 수 없습니다.' }, { status: 500 });
    }

    const header = headerRow[0];
    const durationIdx = header.indexOf('활동 시간');
    const statusIdx = header.indexOf('status');
    const editedContentIdx = header.indexOf('edited_content');

    if (durationIdx === -1 || statusIdx === -1 || editedContentIdx === -1) {
      return NextResponse.json(
        { error: '시트 컬럼(활동 시간, status, edited_content) 구조가 올바르지 않습니다.' },
        { status: 500 }
      );
    }

    // 4. 해당 행의 기존 열 데이터 로드
    const range = `A${rowNumber}:Z${rowNumber}`;
    const rowValues = await getSheetValues('ActivityLogs', range);
    if (rowValues.length === 0) {
      return NextResponse.json({ error: '해당 행을 조회할 수 없습니다.' }, { status: 404 });
    }

    const updatedRow = [...rowValues[0]];

    // 최대 열 개수만큼 빈 문자열로 확장 (인덱스 바운드 에러 방지)
    const maxIdx = Math.max(durationIdx, statusIdx, editedContentIdx);
    while (updatedRow.length <= maxIdx) {
      updatedRow.push('');
    }

    // 5. 교사가 수정한 데이터 대입
    updatedRow[durationIdx] = String(hours);
    updatedRow[statusIdx] = status;
    updatedRow[editedContentIdx] = editedContent || '';

    // 6. 구글 시트 업데이트 실행 (Mutex Lock 동작)
    await updateSheetRow('ActivityLogs', rowNumber, updatedRow);

    return NextResponse.json({
      success: true,
      message: `행 ${rowNumber} 활동 기록이 성공적으로 승인/수정 처리되었습니다.`,
    });

  } catch (error) {
    console.error('교사 승인 처리 모더레이션 중 API 오류 발생:', error);
    return NextResponse.json(
      { error: '승인 처리 중 서버 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
