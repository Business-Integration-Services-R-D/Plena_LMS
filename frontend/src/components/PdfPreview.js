import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { contentUrl } from "@/lib/api";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfPreview({
  trainingId,
  page,
  pageCount,
  onPageChange,
}) {
  const containerRef = useRef(null);
  const wheelLockedRef = useRef(false);
  const [width, setWidth] = useState(0);
  const file = useMemo(
    () => ({ url: contentUrl(trainingId), withCredentials: true }),
    [trainingId],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const updateWidth = () => setWidth(Math.floor(container.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleWheel = (event) => {
    event.preventDefault();
    if (wheelLockedRef.current || Math.abs(event.deltaY) < 10) return;
    const direction = event.deltaY > 0 ? 1 : -1;
    onPageChange(Math.max(1, Math.min(pageCount, page + direction)));
    wheelLockedRef.current = true;
    window.setTimeout(() => {
      wheelLockedRef.current = false;
    }, 350);
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="w-full overflow-hidden rounded-xl border border-navy-900/10 bg-slate-100 flex justify-center p-2"
      data-testid="admin-pdf-preview"
    >
      <Document
        file={file}
        loading={<div className="py-20 text-sm text-slate-500">PDF yükleniyor...</div>}
        error={<div className="py-20 text-sm text-red-500">PDF görüntülenemedi.</div>}
        className="w-full flex justify-center"
      >
        {width > 0 && (
          <Page
            pageNumber={page}
            width={Math.max(260, width - 16)}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="max-w-full shadow-sm"
          />
        )}
      </Document>
    </div>
  );
}
