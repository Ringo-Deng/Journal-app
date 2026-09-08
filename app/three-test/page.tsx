import Book3DTest from '@/components/book3d/Book3DTest';

export default function ThreeTestPage() {
  return (
    <>
      <Book3DTest />
      <style>{`
        /*
         * StPageFlip hard covers rotate through the center seam in 3D. The
         * experiment's structural fallback CSS must not clip that motion at
         * the half-page boundary. The outer test frame still clips the whole
         * book, while inactive pages remain absolutely positioned by
         * .stf__item and therefore do not leak below the book.
         */
        .pf-book-root .stf__parent,
        .pf-book-root .stf__block {
          overflow: visible !important;
        }
      `}</style>
    </>
  );
}
