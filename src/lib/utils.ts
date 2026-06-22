/**
 * Google Drive 일반 오픈 링크에서 파일 ID를 추출하여 이미지 태그 src로 바로 쓸 수 있는 다이렉트 뷰어 URL로 변환합니다.
 * 브라우저와 서버 공용 유틸리티 함수입니다.
 * @param driveUrl 구글 드라이브 공유 링크 (예: https://drive.google.com/open?id=XXX 또는 .../file/d/XXX/view)
 */
export function getDirectDriveImageUrl(driveUrl: string): string {
  if (!driveUrl) return '';

  let fileId = '';

  // 포맷 1: open?id=FILE_ID
  const openIdMatch = driveUrl.match(/[?&]id=([^&]+)/);
  if (openIdMatch) {
    fileId = openIdMatch[1];
  } else {
    // 포맷 2: /file/d/FILE_ID/view
    const fileDMatch = driveUrl.match(/\/file\/d\/([^/]+)/);
    if (fileDMatch) {
      fileId = fileDMatch[1];
    }
  }

  if (!fileId) return driveUrl; // 파싱 실패 시 원본 반환

  // 웹 브라우저에서 <img> 태그로 바로 보기가 가능한 구글 컨텐츠 호스팅 URL 형식 반환
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}
