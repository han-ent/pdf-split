/**
 * All user-visible copy lives here.
 * A later English catalog can implement `Catalog` with the same keys.
 */
export const ko = {
  appTitle: 'PDF 나누기',
  tagline: '파일은 이 브라우저 밖으로 나가지 않습니다.',
  tabSplit: '나누기',
  tabMerge: '합치기',
  dropSplit: 'PDF를 여기에 놓거나 선택하세요',
  dropMerge: '합칠 PDF를 놓거나 선택하세요',
  chooseFile: '파일 선택',
  addFiles: '파일 추가',
  otherFile: '다른 파일',
  fileMeta: (pages: number, marks: number, size: string) =>
    marks > 0 ? `${pages}쪽 · 북마크 ${marks}개 · ${size}` : `${pages}쪽 · ${size}`,
  modeBookmark: '북마크',
  modePages: '페이지 범위',
  noBookmarks: '북마크가 없습니다. 페이지 범위로 나눌 수 있습니다.',
  level: (level: number) => `레벨 ${level}`,
  levelSummary: (level: number, count: number) => `레벨 ${level} · ${count}개 파일`,
  levelsPresent: (levels: string) => `있는 레벨 ${levels}`,
  selectedCount: (count: number) => `${count}개 선택`,
  selectAll: '모두 선택',
  selectNone: '선택 해제',
  splitHint: '같은 레벨의 다음 북마크 직전까지 나눕니다. 마지막은 문서 끝입니다.',
  subNote: '하위 북마크는 나뉜 파일 안에 남습니다.',
  prefix: '파일명 앞에 번호 붙이기',
  prefixExample: '001_제목.pdf',
  rangeLabel: (start: number, end: number) => (start === end ? `${start}쪽` : `${start}–${end}쪽`),
  partTitle: (start: number, end: number) => (start === end ? `${start}쪽` : `${start}–${end}쪽`),
  exportOne: 'PDF 저장',
  startSplit: (count: number) => (count > 0 ? `나누기 시작 (${count})` : '나누기 시작'),
  saveOne: '저장',
  saveZipAll: '모두 ZIP으로 저장',
  resultSplit: (count: number) => `${count}개 파일을 만들었습니다.`,
  readingPct: (pct: number) => `읽는 중… ${pct}%`,
  opening: '여는 중…',
  zipping: '압축하는 중…',
  progressSplit: (done: number, total: number, title: string) => {
    const chars = [...title];
    const short = chars.length > 16 ? `${chars.slice(0, 16).join('')}…` : title;
    return `${done}/${total} ${short}`;
  },
  everyLabel: '쪽씩 나누기',
  apply: '적용',
  customRanges: '범위 직접 입력',
  rangePlaceholder: '1-12 1장\n13-30 2장\n31- 부록',
  rangeHelp: '한 줄에 시작-끝. 끝은 비워도 됩니다.',
  rangeEmpty: '범위를 적용하면 목록이 나옵니다.',
  errRangeEmpty: '범위를 입력하세요.',
  errRangeFormat: '범위 형식이 올바르지 않습니다.',
  errRangeOrder: '시작 쪽이 끝보다 큽니다.',
  errRangeBounds: '쪽 번호가 문서 길이를 벗어났습니다.',
  errNeedFile: 'PDF를 먼저 선택하세요.',
  errNeedPick: '저장할 항목을 선택하세요.',
  errType: 'PDF 파일만 사용할 수 있습니다.',
  errEncrypted: '암호가 걸린 PDF는 열 수 없습니다.',
  errRead: 'PDF를 읽지 못했습니다.',
  errProcess: '처리하지 못했습니다.',
  errEmpty: '페이지가 없는 PDF입니다.',
  errNeedTwo: 'PDF를 두 개 이상 올리세요.',
  errReading: '파일을 아직 읽고 있습니다.',
  mergeHint: '손잡이를 끌어 순서를 바꿉니다.',
  mergeRun: '합치기',
  mergeDone: '합친 PDF를 만들었습니다.',
  downloadMerged: '합본 저장',
  merging: (done: number, total: number) => `합치는 중 ${done}/${total}`,
  remove: '빼기',
  moveUp: '위로',
  moveDown: '아래로',
  clearList: '목록 비우기',
  emptyMerge: '목록이 비어 있습니다.',
  readingRow: '읽는 중…',
  dragHandle: '순서 변경',
  splitZipSuffix: '_나누기.zip',
  mergedSuffix: '_합본.pdf',
  fallbackTitle: '제목없음',
} as const;

type Widen<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R extends string ? string : R
  : T extends string
    ? string
    : T;

export type Catalog = { [K in keyof typeof ko]: Widen<(typeof ko)[K]> };
