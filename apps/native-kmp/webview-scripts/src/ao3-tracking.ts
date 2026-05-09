/**
 * AO3 Tracking Script
 * Injected into AO3 pages to track reading progress and extract work metadata.
 */

// Make this a module to support global augmentation
export {};

declare global {
  interface Window {
    __ao3TrackerInitialized?: boolean;
    AndroidBridge?: {
      postMessage(msg: string): void;
    };
    webkit?: {
      messageHandlers?: {
        ao3Handler?: {
          postMessage(msg: string): void;
        };
      };
    };
    ao3Bridge?: (msg: string) => void;
  }
}

export interface TagInfo {
  tag: string | null;
  href: string | null;
}

export interface WorkInfoMessage {
  type: 'workInfo';
  url: string;
  workName: string | null;
  workLastUpdated: string | null;
  chapterId: string | null;
  chapterName: string | null;
  chapterNumber: string | null;
  totalChapters: string | null;
  authorUrl: string | null;
  authorName: string | null;
  summary: string | null;
  wordCount: string | null;
  language: string | null;
  kudos: string | null;
  hits: string | null;
  bookmarks: string | null;
  comments: string | null;
  downloadPath: string | null;
  downloadUpdatedAt: string | null;
  isPrivate: boolean;
}

export interface WorkTagsMessage {
  type: 'workTags';
  url: string;
  workLastUpdated: string | null;
  rating: TagInfo | undefined;
  warning: TagInfo[];
  category: TagInfo[];
  fandom: TagInfo[];
  relationship: TagInfo[];
  character: TagInfo[];
  freeform: TagInfo[];
}

export interface ChapterInfo {
  chapterDate: string | null;
  chapterNumber: string | null;
  chapterUrl: string | null;
}

export interface WorkChapterIndexMessage {
  type: 'workChapterIndex';
  url: string;
  authorUrl: string | null;
  chapters: ChapterInfo[];
}

export interface ScrollProgressMessage {
  type: 'scrollProgress';
  url: string;
  scrollPercentage: number;
}

/**
 * Post a message to the native app
 */
function postMessage(msg: string): void {
  if (window.AndroidBridge) {
    window.AndroidBridge.postMessage(msg);
  } else if (window.webkit?.messageHandlers?.ao3Handler) {
    window.webkit.messageHandlers.ao3Handler.postMessage(msg);
  } else if (window.ao3Bridge) {
    window.ao3Bridge(msg);
  }
}

/**
 * Normalize whitespace in a string (collapse multiple spaces/newlines to single space)
 */
function normalizeWhitespace(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Get array of tags from anchor elements
 */
function getArrayOfTagsFromAnchorElements(type: string): TagInfo[] {
  const arrayOfAnchorElements = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(`.work.meta.group dd.${type}.tags a`)
  );
  return arrayOfAnchorElements.map((anchor) => ({
    tag: normalizeWhitespace(anchor?.innerText),
    href: anchor?.getAttribute('href') ?? null,
  }));
}

/**
 * Extract chapter ID from URL or page content
 */
function extractChapterId(): string | null {
  // First, try to extract from URL (e.g., /works/123/chapters/456)
  const urlMatch = window.location.pathname.match(/\/chapters\/(\d+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // For full-work views, try to get chapter ID from the chapter dropdown
  const chapterDropdown = document.querySelector<HTMLSelectElement>('#selected_id');
  if (chapterDropdown?.value) {
    return chapterDropdown.value;
  }

  // Try to extract from the first chapter's link in the preface
  const chapterLink = document.querySelector<HTMLAnchorElement>(
    '#chapters div.chapter h3.title a'
  );
  if (chapterLink) {
    const linkMatch = chapterLink.href.match(/\/chapters\/(\d+)/);
    if (linkMatch) {
      return linkMatch[1];
    }
  }

  return null;
}

/**
 * Get work info from the page
 */
export function getWorkInfo(): WorkInfoMessage {
  return {
    type: 'workInfo',
    url: window.location.href,
    workName: (() => {
      const el = document.querySelector<HTMLElement>('#workskin h2.title.heading');
      return el?.textContent?.trim() ?? null;
    })(),
    workLastUpdated: (() => {
      const el =
        document.querySelector<HTMLElement>('.work.meta.group .stats dd.status') ??
        document.querySelector<HTMLElement>('.work.meta.group .stats dd.published');
      return el?.textContent?.trim() ?? null;
    })(),
    chapterId: extractChapterId(),
    chapterName: (() => {
      const el = document.querySelector<HTMLElement>(
        '#chapters div.chapter div.chapter.preface.group h3.title'
      );
      return el?.textContent?.trim() ?? null;
    })(),
    chapterNumber: (() => {
      const el = document.querySelector<HTMLElement>('#chapters div.chapter');
      return el?.id ?? null;
    })(),
    totalChapters: (() => {
      const el = document.querySelector<HTMLElement>('.work.meta.group .stats dd.chapters');
      return el?.textContent?.trim() ?? null;
    })(),
    authorUrl: (() => {
      const el = document.querySelector<HTMLAnchorElement>('#workskin .byline.heading a');
      return el?.getAttribute('href') ?? null;
    })(),
    authorName: (() => {
      const el = document.querySelector<HTMLElement>('#workskin .byline.heading a');
      return el?.textContent?.trim() ?? null;
    })(),
    summary: (() => {
      const el = document.querySelector<HTMLElement>('div.summary blockquote p');
      return el?.textContent?.trim() ?? null;
    })(),
    wordCount: (() => {
      const el = document.querySelector<HTMLElement>('.work.meta.group .stats dd.words');
      return el?.textContent?.trim().replace(/,/g, '') ?? null;
    })(),
    language: (() => {
      const el = document.querySelector<HTMLElement>('.work.meta.group dd.language');
      return el?.textContent?.trim() ?? null;
    })(),
    kudos: (() => {
      const el = document.querySelector<HTMLElement>('.work.meta.group .stats dd.kudos');
      return el?.textContent?.trim().replace(/,/g, '') ?? null;
    })(),
    hits: (() => {
      const el = document.querySelector<HTMLElement>('.work.meta.group .stats dd.hits');
      return el?.textContent?.trim().replace(/,/g, '') ?? null;
    })(),
    bookmarks: (() => {
      const el = document.querySelector<HTMLAnchorElement>('.work.meta.group .stats dd.bookmarks a');
      return el?.textContent?.trim().replace(/,/g, '') ?? null;
    })(),
    comments: (() => {
      const el = document.querySelector<HTMLElement>('.work.meta.group .stats dd.comments');
      return el?.textContent?.trim().replace(/,/g, '') ?? null;
    })(),
    downloadPath: (() => {
      // Parse download link to extract path without extension
      // Format: /downloads/10828137/XCOM_The_Advent.epub?updated_at=1731356383
      const el = document.querySelector<HTMLAnchorElement>('li.download ul a');
      if (!el) return null;
      const href = el.getAttribute('href');
      if (!href) return null;
      try {
        const url = new URL(href, 'https://archiveofourown.org');
        // Remove extension from path
        return url.pathname.replace(/\.(azw3|epub|mobi|pdf|html)$/, '');
      } catch {
        return null;
      }
    })(),
    downloadUpdatedAt: (() => {
      const el = document.querySelector<HTMLAnchorElement>('li.download ul a');
      if (!el) return null;
      const href = el.getAttribute('href');
      if (!href) return null;
      try {
        const url = new URL(href, 'https://archiveofourown.org');
        const updatedAt = url.searchParams.get('updated_at');
        if (updatedAt) {
          const num = parseInt(updatedAt, 10);
          if (isNaN(num)) return null;
          // Convert Unix timestamp (seconds) to ISO8601 string
          return new Date(num * 1000).toISOString();
        }
        return null;
      } catch {
        return null;
      }
    })(),
    isPrivate: (() => {
      // Check if work requires login (restricted work)
      // Restricted works have a blue lock icon: <img alt="(Restricted)" title="Restricted" src="/images/lockblue.png">
      const restrictedIcon = document.querySelector('img[src*="lockblue.png"], img[alt="(Restricted)"]');
      return !!restrictedIcon;
    })(),
  };
}

/**
 * Get work tag info from the page
 */
export function getWorkTagInfo(): WorkTagsMessage {
  return {
    type: 'workTags',
    url: window.location.href,
    workLastUpdated: (() => {
      const el =
        document.querySelector<HTMLElement>('.work.meta.group .stats dd.status') ??
        document.querySelector<HTMLElement>('.work.meta.group .stats dd.published');
      return el?.textContent?.trim() ?? null;
    })(),
    rating: getArrayOfTagsFromAnchorElements('rating')[0],
    warning: getArrayOfTagsFromAnchorElements('warning'),
    category: getArrayOfTagsFromAnchorElements('category'),
    fandom: getArrayOfTagsFromAnchorElements('fandom'),
    relationship: getArrayOfTagsFromAnchorElements('relationship'),
    character: getArrayOfTagsFromAnchorElements('character'),
    freeform: getArrayOfTagsFromAnchorElements('freeform'),
  };
}

/**
 * Get work chapter index from the navigate page
 */
export function getWorkChapterIndex(): WorkChapterIndexMessage {
  return {
    type: 'workChapterIndex',
    url: window.location.href,
    authorUrl: (() => {
      const el = document.querySelector<HTMLAnchorElement>("#main .heading a[rel='author']");
      return el?.getAttribute('href') ?? null;
    })(),
    chapters: Array.from(
      document.querySelectorAll<HTMLLIElement>('#main ol.chapter.index.group li')
    ).map((el) => {
      const anchor = el.querySelector<HTMLAnchorElement>('a');
      const date = el.querySelector<HTMLSpanElement>('span.datetime');

      return {
        chapterDate: normalizeWhitespace(date?.textContent),
        chapterNumber: normalizeWhitespace(anchor?.textContent),
        chapterUrl: anchor?.getAttribute('href') ?? null,
      };
    }),
  };
}

/**
 * Get work chapter list from the chapter select dropdown on work pages.
 * This allows updating chapter info without visiting the chapter index page.
 * Note: Chapter dates are not available from the dropdown.
 */
export function getWorkChapterSelect(): WorkChapterIndexMessage | null {
  const selectElement = document.querySelector<HTMLSelectElement>('#selected_id');
  if (!selectElement) {
    return null;
  }

  const options = Array.from(selectElement.querySelectorAll<HTMLOptionElement>('option'));
  if (options.length === 0) {
    return null;
  }

  // Extract work ID from URL to construct chapter URLs
  const workIdMatch = window.location.pathname.match(/\/works\/(\d+)/);
  const workId = workIdMatch?.[1];
  if (!workId) {
    return null;
  }

  return {
    type: 'workChapterIndex',
    url: window.location.href,
    authorUrl: (() => {
      const el = document.querySelector<HTMLAnchorElement>('#workskin .byline.heading a');
      return el?.getAttribute('href') ?? null;
    })(),
    chapters: options.map((option) => {
      const chapterId = option.value;
      const chapterText = normalizeWhitespace(option.textContent);

      return {
        chapterDate: null, // Not available from the dropdown
        chapterNumber: chapterText,
        chapterUrl: chapterId ? `/works/${workId}/chapters/${chapterId}` : null,
      };
    }),
  };
}

/**
 * Update scroll percentage to query param and post to native
 */
function updateScrollPercentageToQueryParam(): void {
  const element = document.getElementById('chapters');
  let scrollPercentage: number | undefined;

  if (element) {
    const rect = element.getBoundingClientRect();
    const viewportTop = window.scrollY || window.pageYOffset;
    const elementAbsoluteTop = viewportTop + rect.top;
    const elementHeight = rect.height;

    if (elementHeight === 0) {
      return;
    }

    const scrollDistanceIntoElement = viewportTop - elementAbsoluteTop;

    let progress = 0;
    if (scrollDistanceIntoElement <= 0) {
      progress = 0;
    } else if (scrollDistanceIntoElement >= elementHeight) {
      progress = 100;
    } else {
      progress = (scrollDistanceIntoElement / elementHeight) * 100;
    }

    scrollPercentage = Math.max(0, Math.min(100, progress));
  }

  if (scrollPercentage === undefined || Number.isNaN(scrollPercentage)) {
    return;
  }

  const roundedScrollPercentage = Math.floor(scrollPercentage).toString();

  const url = new URL(window.location.href);
  const currentPercentage = url.searchParams.get('scroll');

  if (currentPercentage !== null && currentPercentage === roundedScrollPercentage) {
    return;
  }

  url.searchParams.set('scroll', roundedScrollPercentage);
  window.history.replaceState({}, '', url.toString());

  // Post scroll progress to native app
  const message: ScrollProgressMessage = {
    type: 'scrollProgress',
    url: url.toString(),
    scrollPercentage: parseInt(roundedScrollPercentage, 10),
  };
  postMessage(JSON.stringify(message));
}

/**
 * Scroll to a specific position within the chapters element
 * Waits for layout to stabilize before scrolling for accurate positioning
 */
function scrollTo(scrollToParam: string): void {
  const scrollPosition = parseInt(scrollToParam, 10);
  if (Number.isNaN(scrollPosition)) {
    return;
  }

  // Clear the scrollTo param immediately to prevent re-execution
  const url = new URL(window.location.href);
  url.searchParams.delete('scrollTo');
  url.searchParams.delete('_t');
  window.history.replaceState({}, '', url.toString());

  function performScroll(): void {
    const chaptersElement = document.getElementById('chapters');
    if (chaptersElement) {
      const elementHeight = chaptersElement.getBoundingClientRect().height;
      const scrollToY = chaptersElement.offsetTop + (elementHeight * scrollPosition) / 100;
      window.scrollTo(0, scrollToY);
    }
  }

  // Wait for layout to stabilize - images affect element height
  if (document.readyState === 'complete') {
    setTimeout(performScroll, 150);
  } else {
    window.addEventListener('load', () => {
      setTimeout(performScroll, 150);
    });
  }
}

/**
 * Main initialization function
 */
function init(): void {
  const url = new URL(window.location.href);
  const urlParts = url.pathname.split('/').filter(Boolean);
  const scrollToParam = url.searchParams.get('scrollTo');

  const workWithChapters =
    urlParts[0] === 'works' &&
    !Number.isNaN(Number(urlParts[1])) &&
    urlParts[2] === 'chapters' &&
    !Number.isNaN(Number(urlParts[3]));

  const workWithoutChapters =
    urlParts[0] === 'works' &&
    !Number.isNaN(Number(urlParts[1])) &&
    urlParts.length === 2;

  const workChapterIndex =
    urlParts.length === 3 &&
    urlParts[0] === 'works' &&
    !Number.isNaN(Number(urlParts[1])) &&
    urlParts[2] === 'navigate';

  // Run on works
  if (workWithChapters || workWithoutChapters) {
    window.addEventListener('scroll', updateScrollPercentageToQueryParam);
    postMessage(JSON.stringify(getWorkInfo()));
    postMessage(JSON.stringify(getWorkTagInfo()));

    // Send chapter list from dropdown if available (allows updating chapter info
    // without visiting the chapter index page)
    const chapterSelectMessage = getWorkChapterSelect();
    if (chapterSelectMessage) {
      postMessage(JSON.stringify(chapterSelectMessage));
    }
  }

  if (workChapterIndex) {
    postMessage(JSON.stringify(getWorkChapterIndex()));
  }

  // Run if scrollToParam is present
  if (scrollToParam) {
    scrollTo(scrollToParam);
  }
}

// Auto-initialize when not in test environment
if (typeof window !== 'undefined' && !window.__ao3TrackerInitialized) {
  window.__ao3TrackerInitialized = true;

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
