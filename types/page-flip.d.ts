declare module 'page-flip' {
  export type PageFlipCorner = 'top' | 'bottom';

  export type PageFlipSettings = {
    startPage?: number;
    size?: 'fixed' | 'stretch';
    width: number;
    height: number;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    swipeDistance?: number;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
  };

  export type PageFlipEvent = {
    data: number | string;
    object: PageFlip;
  };

  export class PageFlip {
    constructor(element: HTMLElement, settings: PageFlipSettings);
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    flipNext(corner?: PageFlipCorner): void;
    flipPrev(corner?: PageFlipCorner): void;
    turnToPage(pageNum: number): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    on(event: string, callback: (event: PageFlipEvent) => void): void;
    destroy(): void;
  }
}
