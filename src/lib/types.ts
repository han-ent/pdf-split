export interface FlatBookmark {
  level: number;
  title: string;
  page: number;
}

export interface OutlineNode {
  title: string;
  page: number;
  children: OutlineNode[];
}

export interface BookmarkPart {
  /** Index into the flat outline. */
  flatIndex: number;
  /** 0-based index among bookmarks at the chosen level. */
  ordinal: number;
  title: string;
  /** 1-based inclusive page. */
  start: number;
  /** 1-based inclusive page. */
  end: number;
}

export interface PagePart {
  start: number;
  end: number;
  title: string;
}
