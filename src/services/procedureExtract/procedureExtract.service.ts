// One-shot extraction of a manager-uploaded source document into structured
// procedure fields. The wizard uploads the file via the document presign
// endpoint, then calls POST /api/admin/library/import with the publicUrl
// + filename + contentType. This service downloads the object from R2,
// pulls text out of it (pdf-parse / mammoth for docs, raw decode for text,
// multimodal Gemini for images), then asks Gemini to populate the
// `extractedProcedureSchema` shape. The wizard applies the result to its
// FormSnapshot for the manager to review before saving.
//
// Why Gemini directly (vs. an internal agent framework): the extracted
// shape is narrow and well-defined, and Gemini's structured-output
// (responseSchema) gives us a validated JSON object in one round-trip.
// We trust the model to follow the schema — the JSON Schema we send is
// derived from extractedProcedureSchema, and we re-validate the response
// through Zod before returning, so a hallucinated field shape still fails
// closed.

import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
// pdf-parse is CommonJS-only and exposes a default function. Under
// NodeNext + esModuleInterop we can default-import it directly.
import pdfParse from 'pdf-parse';
import ApiError from '../../shared/utils/ApiError.ts';
import * as uploads from '../uploads/uploads.service.ts';
import {
  extractedProcedureSchema,
  type ExtractedProcedure,
} from '../../db/extractedprocedure.schema.ts';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';

const SUPPORTED_TEXT_MIME = new Set(['text/plain', 'text/markdown']);

const SUPPORTED_DOC_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'text/plain',
  'text/markdown',
]);

export interface ExtractInput {
  publicUrl: string;
  filename: string;
  contentType: string;
  /** Hint passed through to the prompt so the model biases its extraction
   *  toward the right block vocabulary (recipe steps vs. cleaning tasks). */
  procedureType: 'recipe' | 'station' | 'cleaning' | 'general';
}

// Splitting the entry point in two keeps the Gemini + parse + validate
// logic out of the R2 read path so unit tests / debug harnesses can hand
// in already-decoded bytes without going through upload.
async function extractProcedureFromBuffer(
  body: Buffer,
  mime: string,
  procedureType: ExtractInput['procedureType'],
): Promise<ExtractedProcedure> {
  if (!process.env.GOOGLE_AI_API_KEY) {
    // Don't proceed without a key — the wizard surfaces a friendly "AI
    // service not configured" error instead of a confusing 5xx from the
    // SDK.
    throw Object.assign(
      new ApiError('AI extraction is not configured on this server', 503),
      { errorCode: 'IMPORT_NOT_CONFIGURED' },
    );
  }

  let rawText: { mime: string; text?: string; bytes?: Buffer };
  if (SUPPORTED_TEXT_MIME.has(mime)) {
    rawText = { mime, text: body.toString('utf-8') };
  } else if (mime === 'application/pdf') {
    const parsed = await pdfParse(body);
    rawText = { mime, text: parsed.text };
  } else if (
    mime ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const parsed = await mammoth.extractRawText({ buffer: body });
    rawText = { mime, text: parsed.value };
  } else if (mime === 'image/jpeg' || mime === 'image/png') {
    // Multimodal: hand the image bytes to Gemini directly. No OCR step.
    rawText = { mime, bytes: body };
  } else {
    // Already filtered by SUPPORTED_DOC_MIME above; defensive fallback.
    throw Object.assign(
      new ApiError(`Unsupported document type: ${mime}`, 400),
      { errorCode: 'IMPORT_UNSUPPORTED_TYPE' },
    );
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

  let result;
  try {
    result = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildContents(rawText, procedureType),
        config: {
          // Force JSON. We deliberately omit `responseSchema`: when the
          // schema marks every field optional except extractedLanguage,
          // Gemini treats "{title}" as a complete valid response and
          // stops. Letting the model follow the prompt's structure, then
          // strictly re-validating with Zod, gets us fuller extractions.
          responseMimeType: 'application/json',
        },
      }),
    );
  } catch (err) {
    throw Object.assign(
      new ApiError(
        err instanceof Error ? err.message : 'AI extraction failed',
        503,
      ),
      { errorCode: 'EXTRACTION_FAILED' },
    );
  }

  const jsonText = result.text ?? '';
  if (process.env.DOC_EXTRACT_DUMP === '1') {
    // Diagnostic: also print the raw model response so we can see what
    // Gemini actually emitted before we strip / parse / validate.
    console.log('=== [document-extract] raw model response ===');
    console.log(`length=${jsonText.length} chars`);
    console.log(jsonText);
    console.log('=== [document-extract] end response ===');
  }
  // Without responseSchema the model occasionally wraps the JSON in
  // ```json fences. Strip them before parsing.
  const stripped = jsonText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripped);
  } catch {
    throw Object.assign(new ApiError('AI returned non-JSON output', 502), {
      errorCode: 'EXTRACTION_INVALID',
    });
  }

  const validated = extractedProcedureSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw Object.assign(
      new ApiError(
        `AI output did not match schema: ${validated.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
        502,
      ),
      { errorCode: 'EXTRACTION_INVALID' },
    );
  }

  return validated.data;
}

export async function extractProcedureFromDocument(
  input: ExtractInput,
): Promise<ExtractedProcedure> {
  if (!SUPPORTED_DOC_MIME.has(input.contentType)) {
    throw Object.assign(
      new ApiError(`Unsupported document type: ${input.contentType}`, 400),
      { errorCode: 'IMPORT_UNSUPPORTED_TYPE' },
    );
  }
  const { body, contentType } = await uploads.downloadUploadedObject({
    url: input.publicUrl,
  });
  // downloadUploadedObject returns the stored Content-Type, but the wizard
  // sent the mime at upload time. Trust the request mime here — the
  // download serves only to read bytes back.
  const mime = input.contentType || contentType || '';
  return extractProcedureFromBuffer(body, mime, input.procedureType);
}

// Internal entry point for tests / debug harnesses that already have
// decoded bytes on hand. Not exported on the public API surface.
export const _internal = { extractProcedureFromBuffer };

function buildContents(
  raw: { mime: string; text?: string; bytes?: Buffer },
  procedureType: ExtractInput['procedureType'],
): Array<{ role: 'user'; parts: Array<Record<string, unknown>> }> {
  const promptText = buildPrompt(procedureType);
  if (process.env.DOC_EXTRACT_DUMP === '1') {
    // Diagnostic: print the exact prompt + raw text we hand to Gemini so
    // we can verify what's actually going in. Toggle via env var, off in
    // any normal run.
    const rawPreview = raw.bytes
      ? `<binary ${raw.bytes.length} bytes, mime=${raw.mime}>`
      : (raw.text ?? '');
    console.log('=== [document-extract] prompt ===');
    console.log(promptText);
    console.log('=== [document-extract] raw input ===');
    console.log(`mime=${raw.mime}`);
    console.log(`length=${rawPreview.length} chars`);
    console.log(rawPreview.slice(0, 4000));
    console.log('=== [document-extract] end ===');
  }
  if (raw.bytes) {
    // Inline image — multimodal path.
    return [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: raw.mime,
              data: raw.bytes.toString('base64'),
            },
          },
        ],
      },
    ];
  }
  return [
    {
      role: 'user',
      parts: [{ text: promptText }, { text: raw.text ?? '' }],
    },
  ];
}

// Retry Gemini on transient overload. Models in the Flash tier occasionally
// 503 with "high demand" / "UNAVAILABLE" right after a release; the standard
// guidance is to back off and retry. We cap at 3 attempts (1s, 2s, +jitter)
// so the wizard's 5-15 s request budget doesn't blow past ~10 s.
//
// 4xx errors are NOT retried — they indicate a real problem (bad model id,
// bad schema, quota) that won't be fixed by waiting.
async function callGeminiWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientGeminiError(err)) throw err;
      if (attempt === maxAttempts) break;
      // Exponential backoff with a small random jitter (0-250 ms) so a fleet
      // of wizard tabs doesn't sync up their retries.
      const baseMs = 1000 * Math.pow(2, attempt - 1);
      const jitterMs = Math.floor(Math.random() * 250);
      await sleep(baseMs + jitterMs);
    }
  }
  throw lastErr;
}

function isTransientGeminiError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; code?: number; message?: string };
  if (e.status === 503 || e.code === 503) return true;
  if (e.status === 429 || e.code === 429) return true;
  const msg = (e.message ?? '').toLowerCase();
  return (
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('try again later') ||
    msg.includes('overloaded')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildPrompt(procedureType: ExtractInput['procedureType']): string {
  return [
    'You are an SOP document extraction engine for the Alimentaria Mexicana restaurant Learning Management System.',
    '',
    'Your task is to read the provided source document and convert its actual content into a structured procedure draft.',
    '',
    'The source may be a PDF, Word document, plain text, scanned document, or photographed / visual document.',
    `The procedure type is: ${procedureType}.`,
    '',
    'IMPORTANT: You are extracting and structuring existing source content. You are NOT writing new operational instructions.',
    '',
    '========================',
    '1. SOURCE FIDELITY',
    '========================',
    '- Extract EVERY structured piece of content present in the source: every heading, every numbered or bulleted step, every ingredient row, every warning, every table row. A long source should produce a long output, not a short one.',
    '- Use only information that is present in the source.',
    '- Do not invent missing ingredients, quantities, temperatures, timings, equipment, safety limits, steps, warnings, yields, or instructions.',
    '- Do not "complete" incomplete procedures using general restaurant knowledge.',
    '- If information is missing, leave the corresponding field empty or omit it.',
    '- Preserve the meaning and wording of the source as closely as possible.',
    '- You may clean obvious OCR errors when the intended text is unambiguous.',
    '- Do not change operational values such as quantities, temperatures, times, measurements, or percentages.',
    '- Do not add stock images, examples, recommendations, or explanatory content.',
    '',
    '========================',
    '2. LANGUAGE',
    '========================',
    'Detect the language of the source. Set `extractedLanguage` to the language actually found in the source.',
    '- If the source is English: put extracted content in `en`, leave `es` empty.',
    '- If the source is Spanish: put extracted content in `es`, leave `en` empty.',
    '- If the source is genuinely bilingual: preserve the corresponding English and Spanish content in their respective fields.',
    'DO NOT translate the source unless the response schema explicitly requires translation.',
    '',
    '========================',
    '3. DOCUMENT STRUCTURE',
    '========================',
    'Preserve the logical structure of the source. Ignore decorative chrome only:',
    '- page numbers, page headers and footers, logos, branding, watermarks, decorative separators, repeated document titles, document navigation.',
    '',
    '========================',
    '4. BLOCK SELECTION',
    '========================',
    'Choose the block kind based on what the source actually contains. ALWAYS emit a block when the source clearly contains matching content — do not skip clear steps, warnings, tables, or ingredient rows. Each block is an object with a `kind` discriminator field. The valid `kind` values are exactly:',
    '- `heading` — for headings and section titles. Object shape: `{ kind: "heading", level: 1|2|3, text: { en?: string, es?: string } }`',
    '- `text` — for normal paragraphs. Object shape: `{ kind: "text", body: { en?: string, es?: string } }`',
    '- `method` — for ordered procedures / numbered steps. Object shape: `{ kind: "method", steps: [{ body: { en?: string, es?: string }, critical?: boolean }] }`. One step per source step; do NOT collapse multiple source steps into a single step.',
    '- `warning` — for explicit warnings, cautions, critical safety instructions, or safety callouts. Object shape: `{ kind: "warning", severity: "warn"|"tip"|"alt"|"equip"|"allergen", body: { en?: string, es?: string } }`',
    '- `table` — for information presented as a table (ingredients, equipment lists, checklists). Object shape: `{ kind: "table", headers: [{en?:string,es?:string}, ...], rows: [[{en?:string,es?:string}, ...], ...] }`',
    '- `recipe` — for recipe method content when the procedure type is `recipe`. Object shape: `{ kind: "recipe", audience?: string, yieldItems?: [{label,value,unit?}], ingredients?: [{name,unit?,amounts:[string]}], steps?: [{body:{en?:string,es?:string}}] }`',
    '',
    'CRITICAL — the discriminator key is `kind`. Do NOT use `type`. Every block object MUST start with a `"kind"` field whose value is one of the six strings above.',
    '',
    'Preserve the original order of the content. Do not convert a table into unrelated paragraphs. Do not convert a numbered procedure into a single paragraph.',
    '',
    '========================',
    '5. RECIPE PROCEDURES',
    '========================',
    'When the procedure type is `recipe`, inspect the source for recipe information. EXTRACT EVERY FIELD that is present in the source — do not stop after the title.',
    '',
    'The top-level `recipe` field is an OBJECT with this exact shape (no nested LocalisedString values; everything is plain strings + arrays):',
    '`recipe = { audience?: string, yieldItems?: [{label:string,value:string,unit?:string}], ingredients?: [{name:string,amounts:[string],unit?:string}], steps?: [{body:{en?:string,es?:string}}], allergenSummary?: string }`',
    '',
    'Each ingredient has a flat shape: `{ name: "Boneless chicken breast", amounts: ["2.5"], unit: "kg" }`. The amounts array holds the numeric strings from the source; if a quantity is missing, use `amounts: [""]` or omit the ingredient.',
    '',
    'Each yield item is flat: `{ label: "Yield", value: "Approximately 10 portions", unit: "" }`. For yields stated in the source (e.g. "Serves: Approximately 10 portions"), emit one yieldItem capturing that.',
    '',
    'Do NOT emit `recipe.name`, `recipe.description`, `recipe.yield` (as a LocalisedString), `recipe.optionalGarnish`, `recipe.allergens` (as a LocalisedString), or any other field not in the schema above. The procedure title and description go into the top-level `title` and `purpose` fields instead. Garnish and allergen free-text go into `text` or `warning` blocks under `blocks`.',
    '',
    'For the method section: use the `recipe.steps` array above. Preserve the order of the original steps. Mark a step as critical only when the source explicitly indicates that the step is critical, a critical limit, a safety point, or equivalent. If the source contains a critical limit, preserve it exactly. Do not invent critical limits.',
    '',
    'If ingredients are listed in a table in the source, preserve the relationship between ingredient, quantity, and unit by emitting a `table` block in `blocks` AND mirroring the ingredients into the top-level `recipe.ingredients` array. If yield, portion size, allergens, or quantities are not present, do not invent them.',
    '',
    '========================',
    '6. STATION / CLEANING / GENERAL PROCEDURES',
    '========================',
    "For station, cleaning, and general procedures, preserve the source's order. Use heading + method + warning + table as appropriate. Do not force content into a recipe or numbered-step structure when the source does not use one.",
    '',
    'For cleaning procedures specifically: preserve chemicals, dilution ratios, temperatures, contact times, PPE, and safety instructions exactly as written. Do not invent cleaning chemicals, concentrations, temperatures, or safety requirements. Promote explicit safety instructions to warning blocks where supported.',
    '',
    '========================',
    '7. VISUAL CONTENT',
    '========================',
    "If the source contains images, diagrams, charts, screenshots, or other visual content: identify the visual's position and purpose when it can be determined. Give it a useful source-based label or caption. Do not generate replacement imagery. Do not invent information that cannot be read or reliably determined. (Schema support for image placeholders is forward-compat only — emit one only if the schema allows.)",
    '',
    '========================',
    '8. TABLES',
    '========================',
    'If the source contains a table: preserve its rows and columns, preserve cell values exactly, preserve units and labels. Do not flatten a table into prose.',
    '',
    '========================',
    '9. MISSING OR UNCLEAR INFORMATION',
    '========================',
    "Do not guess facts you cannot determine (operational values, quantities, temperatures, allergen claims). For those, omit the value or use the schema's supported placeholder / uncertain state if available.",
    'This rule is about FACTS you cannot read or verify — it does NOT mean you should omit clear content. If a heading, step, warning, ingredient row, or table is clearly present in the source, you MUST emit it.',
    'If OCR makes a value ambiguous, do not silently choose a likely value — leave it for the human reviewer.',
    '',
    '========================',
    '10. OUTPUT',
    '========================',
    'Return ONLY valid JSON. Do NOT return Markdown, explanations, comments, analysis, ```json code fences, or additional fields not defined below.',
    '',
    'The top-level JSON object MUST contain ONLY these keys (any other top-level key is invalid and will fail validation): `title`, `purpose`, `blocks`, `recipe`, `extractedLanguage`, `notes`.',
    '',
    'Do NOT add top-level fields like `restaurant`, `station`, `procedureType`, `dish`, `source`, `metadata`, `confidence`, etc. Put restaurant / station / dish information into `title` or a `text` block, not as separate top-level keys.',
    '',
    'For `notes`: either OMIT the field entirely, or set it to a STRING. Do NOT set it to `[]`, `null`, `{}`, or any non-string value. If there is nothing noteworthy to record, omit the field.',
    '',
    'The resulting JSON represents a DRAFT SOP. It must always be possible for an administrator to review and edit the extracted content before publishing.',
  ].join('\n');
}
