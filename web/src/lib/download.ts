// 브라우저에서 파일 내려받기 (정적 사이트라 서버 없이 처리)

/** Blob을 파일로 저장 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 다운로드가 시작된 뒤 정리
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 내려받는 카드 파일 이름: <제품ID>-card-01.png (여러 제품을 받아도 섞이지 않게) */
export const cardFileName = (projectId: string, no: number) => `${projectId}-card-${String(no).padStart(2, '0')}.png`;
