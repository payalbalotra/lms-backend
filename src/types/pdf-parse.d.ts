declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages?: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    version?: string;
  }
  type PdfParseFn = (buffer: Buffer | Uint8Array) => Promise<PdfParseResult>;
  const pdfParse: PdfParseFn;
  export default pdfParse;
}
