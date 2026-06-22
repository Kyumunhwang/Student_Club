import { google } from 'googleapis';
import { getDirectDriveImageUrl } from './utils';


// 1. Google API 인증용 클라이언트 빌드 함수
function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error('Google Service Account 환경 변수가 설정되지 않았습니다.');
  }

  // 환경변수에 줄바꿈(\n)이 문자열 "\\n"으로 이스케이프되었을 경우 복원
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email,
    key: formattedKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ]
  });
}


// 2. Google Sheets 서비스 객체 생성
export function getSheetsClient() {
  const auth = getGoogleAuth();
  return google.sheets({ version: 'v4', auth });
}

// 3. Google Drive 서비스 객체 생성
export function getDriveClient() {
  const auth = getGoogleAuth();
  return google.drive({ version: 'v3', auth });
}

// 4. Google Sheets API 쓰기 동시성 제어용 FIFO 큐 (오류 1% 미만 핵심 구현)
class SheetsTaskQueue {
  private queue: Promise<any> = Promise.resolve();

  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue = this.queue.then(() => {
        return task().then(resolve).catch(reject);
      });
    });
  }
}

// 싱글톤 큐 인스턴스 수출
export const sheetsQueue = new SheetsTaskQueue();

// 5. 공통 헬퍼 함수들 (조회 및 업데이트)
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

/**
 * 특정 시트의 데이터를 읽어옵니다.
 * @param sheetName 시트명 (예: 'Students', 'ActivityLogs')
 * @param range 범위 (기본값: 전체 데이터)
 */
export async function getSheetValues(sheetName: string, range?: string) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID가 설정되지 않았습니다.');
  
  const sheets = getSheetsClient();
  const targetRange = range ? `${sheetName}!${range}` : sheetName;
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: targetRange,
  });
  
  return response.data.values || [];
}

/**
 * 특정 시트의 특정 행 값을 업데이트합니다. (동시성 큐 보호 작동)
 * @param sheetName 시트명
 * @param rowNumber 업데이트할 1-indexed 행 번호 (예: 2, 5)
 * @param values 업데이트할 열 데이터 배열
 */
export async function updateSheetRow(sheetName: string, rowNumber: number, values: any[]) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID가 설정되지 않았습니다.');
  
  return sheetsQueue.enqueue(async () => {
    const sheets = getSheetsClient();
    const range = `${sheetName}!A${rowNumber}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });
  });
}

/**
 * 특정 시트에 새로운 행을 추가합니다. (동시성 큐 보호 작동)
 * @param sheetName 시트명
 * @param values 추가할 열 데이터 배열
 */
export async function appendSheetRow(sheetName: string, values: any[]) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID가 설정되지 않았습니다.');
  
  return sheetsQueue.enqueue(async () => {
    const sheets = getSheetsClient();
    const range = `${sheetName}!A1`;
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [values],
      },
    });
  });
}

/**
 * 특정 시트 탭의 전체 데이터를 일괄로 덮어씁니다. (CSV 일괄 업로드 트랜잭션용)
 * @param sheetName 시트명 (예: 'SLO_CAPA', 'HomeroomComments')
 * @param values 전체 행렬 데이터 배열 (헤더 포함)
 */
export async function updateSheetAllValues(sheetName: string, values: any[][]) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID가 설정되지 않았습니다.');

  return sheetsQueue.enqueue(async () => {
    const sheets = getSheetsClient();
    
    // 기존 데이터를 지우고 덮어쓰기 위해 Clear 후 Update 실행
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:Z1000`, // 충분한 범위를 지정해 클리어
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });
  });
}




