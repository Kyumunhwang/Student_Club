import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSheetValues, updateSheetAllValues } from '@/lib/google';
import { z } from 'zod';
import csv from 'csv-parser';
import { Readable } from 'stream';

// 1. Zod를 활용한 행 데이터 유효성 스키마 정의
const sloGradeEnum = z.enum(['E', 'VG', 'G', 'S', 'NI', '']);

const sloRowSchema = z.object({
  student_id: z.string().min(1),
  name_ko: z.string().optional(),
  grade: z.string().optional(),
  integrity: sloGradeEnum,
  enthusiasm: sloGradeEnum,
  selfconfidence: sloGradeEnum,
  leadership: sloGradeEnum,
  motivation: sloGradeEnum,
  cooperation: sloGradeEnum,
  humility: sloGradeEnum,
  maturity: sloGradeEnum,
  responsibility: sloGradeEnum,
  perseverance: sloGradeEnum,
});

const homeroomRowSchema = z.object({
  student_id: z.string().min(1),
  name_ko: z.string().optional(),
  grade: z.string().optional(),
  comment: z.string(),
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
    // 2. FormData 파싱
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null; // 'slo' or 'homeroom'
    const semester = formData.get('semester') as string | null; // 예: '2026-1'

    if (!file || !type || !semester) {
      return NextResponse.json(
        { error: '필수 필드(file, type, semester)가 누락되었습니다.' },
        { status: 400 }
      );
    }

    if (type !== 'slo' && type !== 'homeroom') {
      return NextResponse.json(
        { error: "타입은 'slo' 또는 'homeroom'이어야 합니다." },
        { status: 400 }
      );
    }

    // 3. 파일 텍스트 추출 및 BOM 제거
    let fileText = await file.text();
    fileText = fileText.replace(/^\uFEFF/, ''); // UTF-8 BOM 바이트 제거 (Excel 호환성 핵심)

    // 4. csv-parser를 통한 비동기 스트림 파싱
    const parsedResults: any[] = [];
    const stream = Readable.from(fileText);

    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => {
          // 키의 공백 제거 및 키 소문자 표준화 처리
          const cleanData: any = {};
          for (const key of Object.keys(data)) {
            const cleanKey = key.trim().toLowerCase();
            cleanData[cleanKey] = data[key]?.trim();
          }
          parsedResults.push(cleanData);
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    if (parsedResults.length === 0) {
      return NextResponse.json({ error: '파싱할 데이터가 없습니다.' }, { status: 400 });
    }

    // 5. Zod를 사용한 데이터 유효성 검증 루프
    const validatedRows: any[] = [];
    const schema = type === 'slo' ? sloRowSchema : homeroomRowSchema;

    for (let i = 0; i < parsedResults.length; i++) {
      const row = parsedResults[i];
      const result = schema.safeParse(row);
      
      if (!result.success) {
        return NextResponse.json(
          { 
            error: `CSV 행 ${i + 2}에서 유효하지 않은 값이 발견되었습니다.`, 
            details: result.error.issues 
          },
          { status: 400 }
        );
      }

      validatedRows.push(result.data);
    }

    // 6. 구글 시트 갱신 연동 (원자적 트랜잭션 구현)
    const targetSheet = type === 'slo' ? 'SLO_CAPA' : 'HomeroomComments';
    const existingValues = await getSheetValues(targetSheet);

    let updatedSheetData: any[][] = [];

    // [헤더 정의]
    if (type === 'slo') {
      updatedSheetData.push([
        'student_id',
        'semester',
        'integrity',
        'enthusiasm',
        'selfconfidence',
        'leadership',
        'motivation',
        'cooperation',
        'humility',
        'maturity',
        'responsibility',
        'perseverance',
      ]);
    } else {
      updatedSheetData.push(['student_id', 'semester', 'comment']);
    }

    // [기존 시트 데이터 파싱 및 로드]
    const header = existingValues[0] || updatedSheetData[0];
    const idIdx = header.indexOf('student_id');
    const semIdx = header.indexOf('semester');

    // 기존 데이터를 맵에 담아 덮어쓰기 대조용으로 준비
    const existingMap = new Map<string, any[]>();
    if (existingValues.length > 0) {
      for (let i = 1; i < existingValues.length; i++) {
        const row = existingValues[i];
        const key = `${row[idIdx]}_${row[semIdx]}`;
        existingMap.set(key, row);
      }
    }

    // [신규/수정 업로드 데이터 반영]
    for (const vRow of validatedRows) {
      const key = `${vRow.student_id}_${semester}`;
      
      let newRow: any[] = [];
      if (type === 'slo') {
        newRow = [
          vRow.student_id,
          semester,
          vRow.integrity || '',
          vRow.enthusiasm || '',
          vRow.selfconfidence || '',
          vRow.leadership || '',
          vRow.motivation || '',
          vRow.cooperation || '',
          vRow.humility || '',
          vRow.maturity || '',
          vRow.responsibility || '',
          vRow.perseverance || '',
        ];
      } else {
        newRow = [vRow.student_id, semester, vRow.comment];
      }

      existingMap.set(key, newRow); // 맵에 입력 (기존 매핑 데이터는 자동 덮어쓰기)
    }

    // 최종 결합 데이터를 구글 시트에 일괄 덮어쓰기
    existingMap.forEach((row) => {
      updatedSheetData.push(row);
    });

    // 구글 시트 일괄 저장 API 호출
    await updateSheetAllValues(targetSheet, updatedSheetData);

    return NextResponse.json({
      success: true,
      count: validatedRows.length,
      message: `성공적으로 ${validatedRows.length}명의 학생 데이터를 일괄 업로드 완료하였습니다.`,
    });

  } catch (error) {
    console.error('CSV 일괄 업로드 중 에러 발생:', error);
    return NextResponse.json(
      { error: '서버 에러가 발생하여 CSV 파일을 업로드할 수 없습니다.' },
      { status: 500 }
    );
  }
}
