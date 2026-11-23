import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { downloadVideoOrHls, type DownloadedVideoMedia } from './hlsDownloader';
import { enrichSinglePin, extractJsonLdRecipe, type JsonLdRecipeData } from './pinterestResolver';
import {
  CookingStepSchema,
  DIFFICULTIES,
  IngredientSchema,
  RECIPE_CATEGORIES,
  RecipeSchema,
  SUPERMARKET_AISLES,
  type RawPin,
  type Recipe,
} from './types';

const INLINE_VIDEO_MAX_BYTES = 14 * 1024 * 1024; // 14 MB inline threshold
const MAX_VIDEO_DOWNLOAD_BYTES = 45 * 1024 * 1024; // 45 MB safety cap

const ExtractedPayloadSchema = z.object({
  isRecipe: z.boolean().default(true),
  nonRecipeReason: z.string().nullable().optional(),
  title: z.string().min(1),
  summary: z.string().default(''),
  creator: z.string().default('Pinterest Creator'),
  category: z.enum(RECIPE_CATEGORIES).catch('Comfort Food'),
  tags: z.array(z.string()).default([]),
  prepMinutes: z.number().int().nonnegative().default(15),
  cookMinutes: z.number().int().nonnegative().default(15),
  servings: z.number().int().positive().default(4),
  difficulty: z.enum(DIFFICULTIES).catch('Easy'),
  ingredients: z.array(IngredientSchema).default([]),
  steps: z.array(CookingStepSchema).default([]),
  confidence: z.number().min(0).max(1).default(0.85),
  extractionNotes: z.string().nullable().optional(),
});

const GEMINI_RECIPE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    isRecipe: {
      type: 'boolean',
      description:
        'True ONLY if this is an actual cookable recipe or food preparation dish. False for food storage tips, ethylene gas charts, nutrition infographics, memes, or restaurant promos.',
    },
    nonRecipeReason: {
      type: ['string', 'null'],
      description: 'Short reason if isRecipe is false, otherwise null.',
    },
    title: {
      type: 'string',
      description: 'Clean, appetizing dish title (3 to 8 words). Never use "Saved Recipe Pin" or social media hashtags.',
    },
    summary: {
      type: 'string',
      description: 'One concise, appetizing sentence describing the dish.',
    },
    creator: {
      type: 'string',
      description: 'Creator handle (e.g. @handle) or blog name if visible, else "Pinterest Creator".',
    },
    category: {
      type: 'string',
      enum: [...RECIPE_CATEGORIES],
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '2 to 4 concise tags such as "High Protein", "Air Fryer", "One-Pan", "Vegan", "15 Mins".',
    },
    prepMinutes: { type: 'integer' },
    cookMinutes: { type: 'integer' },
    servings: { type: 'integer' },
    difficulty: {
      type: 'string',
      enum: [...DIFFICULTIES],
    },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Clean ingredient name without quantity, e.g. "Chicken Breast Fillets"' },
          qtyNumber: { type: ['number', 'null'], description: 'Numeric quantity in metric UK units where possible, e.g. 500' },
          qtyUnit: {
            type: ['string', 'null'],
            description: 'Normalized unit: g, kg, ml, L, tbsp, tsp, cloves, whole, pack, tin, jar, bunch, head, eggs, fillets, or null',
          },
          qtyDisplay: { type: 'string', description: 'Human-readable quantity, e.g. "500g", "2 tbsp", "1 tin (400g)"' },
          prepNote: { type: ['string', 'null'], description: 'Optional prep note like "finely diced" or "drained"' },
          aisle: { type: 'string', enum: [...SUPERMARKET_AISLES] },
          pantry: {
            type: 'boolean',
            description: 'True for common UK kitchen staples (salt, black pepper, olive/veg oil, plain flour, sugar, garlic, basic dried spices, soy sauce, stock cubes).',
          },
          ukSearchQuery: {
            type: 'string',
            description: 'Clean 2-4 word UK supermarket search query with NO numbers or measurements, e.g. "chicken breast fillets", "baby spinach", "sea salt flakes".',
          },
        },
        required: ['name', 'qtyNumber', 'qtyUnit', 'qtyDisplay', 'aisle', 'pantry', 'ukSearchQuery'],
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepNumber: { type: 'integer' },
          title: { type: 'string', description: 'Short 2-5 word imperative step heading' },
          instruction: { type: 'string', description: 'Clear, complete, actionable step instruction' },
          durationMinutes: { type: ['number', 'null'], description: 'Timer duration in minutes if this step involves timed cooking/marinating' },
          temperature: { type: ['string', 'null'], description: 'Oven/air-fryer/oil temperature in °C if mentioned' },
          videoTimestamp: { type: ['string', 'null'], description: 'Timestamp MM:SS in video where this step happens, if from video' },
          tip: { type: ['string', 'null'], description: 'Optional chef tip mentioned in audio/text' },
        },
        required: ['stepNumber', 'title', 'instruction'],
      },
    },
    confidence: {
      type: 'number',
      description: '0.0 to 1.0 confidence in ingredient quantities and steps completeness.',
    },
    extractionNotes: {
      type: ['string', 'null'],
      description: 'Brief note if quantities were inferred from visuals or video audio.',
    },
  },
  required: [
    'isRecipe',
    'title',
    'summary',
    'creator',
    'category',
    'tags',
    'prepMinutes',
    'cookMinutes',
    'servings',
    'difficulty',
    'ingredients',
    'steps',
    'confidence',
  ],
};

const SYSTEM_PROMPT = `You are a culinary recipe architect for a UK meal-planning app (Pin2Plate).
Your job is to inspect Pinterest pins — including cooking videos (audio narration, on-screen captions, and visual actions), recipe infographic images, carousel slides, and blog recipes — and convert them into crystal-clear, structured, cookable step-by-step plans with UK supermarket ingredients.

CRITICAL RULES:
1. First decide if the content is genuinely a cookable recipe or food/drink preparation (isRecipe = true). Set isRecipe = false for food-storage charts (e.g. ethylene gas charts), diet/nutrition posters, restaurant lists, or non-food content.
2. Read ALL on-screen text overlays, ingredient cards, spoken audio instructions, and visual cooking cues carefully.
3. Convert US measurements to practical UK metric units where natural (e.g. cups of flour -> g, °F -> °C, cilantro -> fresh coriander, scallions -> spring onions, cornstarch -> cornflour, heavy cream -> double cream).
4. Every ingredient MUST have a clean ukSearchQuery suitable for Tesco/Sainsbury's/Asda search with NO quantities or punctuation (e.g. "unsalted butter", NOT "125g butter").
5. Break cooking instructions into 3 to 8 logical, numbered step-by-step actions with short imperative titles, explicit durations (durationMinutes) when timed, and °C temperatures where applicable. Never copy raw social-media captions or hashtag dumps as steps.
6. If exact quantities aren't stated explicitly in a video/photo, infer realistic home-cook proportions for the stated servings and note that briefly in extractionNotes.`;

function getGeminiClient(apiVersion?: 'v1' | 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Add GEMINI_API_KEY to your environment variables to extract image & video pins.');
  }
  return apiVersion ? new GoogleGenAI({ apiKey, apiVersion }) : new GoogleGenAI({ apiKey });
}

async function fetchMediaBuffer(url: string, maxBytes: number): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;

    const contentLength = Number(res.headers.get('content-length') || '0');
    if (contentLength > maxBytes) return null;

    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > maxBytes) return null;

    const rawMime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    let mimeType = rawMime;
    if (!mimeType || mimeType === 'application/octet-stream') {
      if (url.toLowerCase().includes('.mp4')) mimeType = 'video/mp4';
      else if (url.toLowerCase().includes('.png')) mimeType = 'image/png';
      else if (url.toLowerCase().includes('.webp')) mimeType = 'image/webp';
      else mimeType = 'image/jpeg';
    }

    return { buffer: Buffer.from(arrayBuf), mimeType };
  } catch {
    return null;
  }
}

/**
 * Tier 0: Ultra-fast calibrated decision gate using `gemini-decision-1` (v1beta Decisions API).
 * Filters out non-recipe food infographics (storage charts, memes, etc.) at 0 output tokens.
 */
async function runRecipeDecisionGate(
  pin: RawPin,
  coverImage?: { buffer: Buffer; mimeType: string } | null,
): Promise<{ isRecipe: boolean; confidence: number } | null> {
  try {
    const aiBeta = getGeminiClient('v1beta');
    const inputBlocks: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: `Pinterest Pin Metadata:\nTitle: ${pin.title}\nDescription: ${pin.description || '(none)'}\nMedia type: ${pin.mediaType}`,
      },
    ];
    if (coverImage && coverImage.mimeType.startsWith('image/')) {
      inputBlocks.push({
        type: 'image',
        data: coverImage.buffer.toString('base64'),
        mime_type: coverImage.mimeType,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decisionsClient = (aiBeta as any).decisions;
    if (!decisionsClient || typeof decisionsClient.create !== 'function') {
      return null;
    }

    const result = await decisionsClient.create({
      model: 'gemini-decision-1',
      input: inputBlocks,
      questions: {
        is_cookable_recipe: {
          type: 'noul',
          instructions:
            'Is this Pinterest pin a cookable recipe, dish tutorial, marinade, or food/drink preparation (as opposed to a food-storage chart, nutrition infographic, meme, or non-recipe tip)?',
        },
      },
    });

    const answer = result?.answers?.is_cookable_recipe;
    if (answer && typeof answer.noul === 'number') {
      // Only hard-skip when strongly confident it is NOT a recipe (P(yes) < 0.25)
      return {
        isRecipe: answer.noul >= 0.25,
        confidence: typeof answer.confidence === 'number' ? answer.confidence : 0.8,
      };
    }
    return null;
  } catch (err) {
    console.warn('[recipeExtractor] Decisions gate fallback (continuing to full extraction):', err instanceof Error ? err.message : err);
    return null;
  }
}

async function runStructuredInteraction(
  model: string,
  inputParts: Array<Record<string, unknown>>,
): Promise<z.infer<typeof ExtractedPayloadSchema>> {
  const ai = getGeminiClient('v1');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interaction = await (ai.interactions.create as any)({
    model,
    system_instruction: SYSTEM_PROMPT,
    input: [
      {
        type: 'user_input',
        content: inputParts,
      },
    ],
    store: false,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: GEMINI_RECIPE_JSON_SCHEMA,
    },
  });

  const text = interaction.output_text;
  if (!text) {
    throw new Error('Gemini returned an empty extraction response.');
  }

  const parsedJson = JSON.parse(text);
  return ExtractedPayloadSchema.parse(parsedJson);
}

async function extractFromBlogJsonLd(pin: RawPin, blog: JsonLdRecipeData): Promise<Recipe> {
  const promptText = `Normalize this structured blog recipe into our UK meal-planner schema:
Title: ${blog.name}
Author: ${blog.author || pin.creator}
Description: ${blog.description}
Prep time: ${blog.prepTimeIso || 'unknown'} | Cook time: ${blog.cookTimeIso || 'unknown'} | Servings: ${blog.servings || '4'}
Ingredients:
${blog.ingredients.map((i) => `- ${i}`).join('\n')}

Instructions:
${blog.instructions.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}`;

  const extracted = await runStructuredInteraction('gemini-3.5-flash-lite', [
    { type: 'text', text: promptText },
  ]);

  return buildRecipeFromExtraction(pin, extracted, 'blog', blog.imageUrl || pin.imageUrl);
}

async function extractFromVideo(
  pin: RawPin,
  downloaded: DownloadedVideoMedia,
): Promise<Recipe> {
  const ai = getGeminiClient('v1');
  const { video: videoTrack, audio: audioTrack, method } = downloaded;
  const promptText = `Watch this Pinterest cooking video carefully (visuals, on-screen text overlays, AND spoken audio narration).
Pin title: ${pin.title}
Pin caption: ${pin.description || '(none)'}
Creator: ${pin.creator}

Extract the complete recipe with clean UK supermarket ingredients and a numbered step-by-step cooking plan including video timestamps (MM:SS) and timer durations where helpful.`;

  const extraAudioPart: Array<Record<string, unknown>> =
    audioTrack && audioTrack.buffer.byteLength <= 8 * 1024 * 1024
      ? [
          {
            type: 'audio',
            data: audioTrack.buffer.toString('base64'),
            mime_type: audioTrack.mimeType,
          },
        ]
      : [];

  const totalInlineBytes = videoTrack.buffer.byteLength + (audioTrack?.buffer.byteLength ?? 0);

  // Small reels (<= 14MB) go inline for lowest latency
  if (totalInlineBytes <= INLINE_VIDEO_MAX_BYTES) {
    const extracted = await runStructuredInteraction('gemini-4-hydrogen', [
      {
        type: 'video',
        data: videoTrack.buffer.toString('base64'),
        mime_type: videoTrack.mimeType,
      },
      ...extraAudioPart,
      { type: 'text', text: promptText },
    ]);
    if (!extracted.extractionNotes && method.startsWith('hls')) {
      extracted.extractionNotes = `Extracted from full public HLS video stream (${method}).`;
    }
    return buildRecipeFromExtraction(pin, extracted, 'video', pin.imageUrl);
  }

  // Larger videos use Gemini Files API with polling + cleanup
  const ext = videoTrack.mimeType === 'video/mpeg' ? 'mpg' : 'mp4';
  const tmpFile = path.join(os.tmpdir(), `p2p_video_${pin.pinId}_${Date.now()}.${ext}`);
  let uploadedName: string | undefined;

  try {
    await fs.writeFile(tmpFile, videoTrack.buffer);
    const uploaded = await ai.files.upload({
      file: tmpFile,
      config: { mimeType: videoTrack.mimeType },
    });
    uploadedName = uploaded.name;

    let fileState = uploaded;
    const deadline = Date.now() + 45_000;
    while (fileState.state === 'PROCESSING' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      fileState = await ai.files.get({ name: uploaded.name || '' });
    }
    if (fileState.state === 'FAILED' || !fileState.uri) {
      throw new Error('Gemini video processing failed.');
    }

    const extracted = await runStructuredInteraction('gemini-4-hydrogen', [
      {
        type: 'video',
        uri: fileState.uri,
        mime_type: fileState.mimeType || videoTrack.mimeType,
      },
      ...extraAudioPart,
      { type: 'text', text: promptText },
    ]);

    if (!extracted.extractionNotes && method.startsWith('hls')) {
      extracted.extractionNotes = `Extracted from full public HLS video stream (${method}).`;
    }
    return buildRecipeFromExtraction(pin, extracted, 'video', pin.imageUrl);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
    if (uploadedName) {
      await ai.files.delete({ name: uploadedName }).catch(() => {});
    }
  }
}

async function extractFromImages(
  pin: RawPin,
  images: Array<{ buffer: Buffer; mimeType: string }>,
  noteOverride?: string,
): Promise<Recipe> {
  const mediaType = images.length > 1 ? 'carousel' : 'image';
  const promptText = `Examine ${images.length > 1 ? `all ${images.length} slides of this Pinterest recipe carousel` : 'this Pinterest recipe image'} together with the caption.
Read every piece of overlaid text, ingredient card, measurement, and cooking instruction visible in the image(s).
Pin title: ${pin.title}
Pin caption: ${pin.description || '(none)'}
Creator: ${pin.creator}

Convert into a complete, cookable step-by-step recipe with UK supermarket ingredients.`;

  const inputParts: Array<Record<string, unknown>> = images.map((img) => ({
    type: 'image',
    data: img.buffer.toString('base64'),
    mime_type: img.mimeType,
  }));
  inputParts.push({ type: 'text', text: promptText });

  const extracted = await runStructuredInteraction('gemini-4-hydrogen', inputParts);
  if (noteOverride && !extracted.extractionNotes) {
    extracted.extractionNotes = noteOverride;
  }
  return buildRecipeFromExtraction(pin, extracted, mediaType, pin.imageUrl);
}

function buildRecipeFromExtraction(
  pin: RawPin,
  extracted: z.infer<typeof ExtractedPayloadSchema>,
  sourceType: Recipe['sourceType'],
  imageUrl: string,
): Recipe {
  const id = pin.pinId.startsWith('pin_') || pin.pinId.startsWith('url_') ? pin.pinId : `pin_${pin.pinId}`;

  if (!extracted.isRecipe) {
    return RecipeSchema.parse({
      id,
      boardId: pin.boardId,
      status: 'skipped_non_recipe',
      sourceType,
      sourcePinUrl: pin.pinUrl,
      outboundUrl: pin.outboundUrl,
      videoUrl: pin.videoUrl,
      imageUrl,
      title: extracted.title || pin.title || 'Non-Recipe Pin',
      summary: extracted.nonRecipeReason || 'Identified as a non-recipe graphic or tip.',
      creator: extracted.creator || pin.creator,
      category: 'Healthy & Veggie',
      tags: ['Skipped'],
      prepMinutes: 0,
      cookMinutes: 0,
      servings: 1,
      difficulty: 'Easy',
      ingredients: [],
      steps: [],
      confidence: extracted.confidence,
      extractionNotes: extracted.nonRecipeReason || 'Automatically filtered out as non-recipe content.',
      rawCaption: pin.description,
      extractedAt: new Date().toISOString(),
    });
  }

  const normalizedSteps = extracted.steps.map((s, idx) => ({
    ...s,
    stepNumber: idx + 1,
  }));

  return RecipeSchema.parse({
    id,
    boardId: pin.boardId,
    status: 'ready',
    sourceType,
    sourcePinUrl: pin.pinUrl,
    outboundUrl: pin.outboundUrl,
    videoUrl: pin.videoUrl,
    imageUrl: imageUrl || 'https://i.pinimg.com/736x/ec/1a/44/ec1a442062e322cd3ce7765206ee147a.jpg',
    title: extracted.title,
    summary: extracted.summary,
    creator: extracted.creator || pin.creator,
    category: extracted.category,
    tags: extracted.tags.slice(0, 4),
    prepMinutes: extracted.prepMinutes,
    cookMinutes: extracted.cookMinutes,
    servings: extracted.servings,
    difficulty: extracted.difficulty,
    ingredients: extracted.ingredients.map((ing) => ({
      ...ing,
      prepNote: ing.prepNote || undefined,
    })),
    steps: normalizedSteps,
    confidence: extracted.confidence,
    extractionNotes: extracted.extractionNotes || undefined,
    rawCaption: pin.description,
    extractedAt: new Date().toISOString(),
  });
}

export interface ExtractPinOptions {
  forceExtract?: boolean; // Bypass Tier 0 non-recipe gate (user clicked "Extract anyway")
  skipEnrich?: boolean;   // Skip fetching Pinterest pin page if already enriched (e.g. from OAuth v5)
}

export async function extractRecipeFromPin(
  inputPin: RawPin,
  options: ExtractPinOptions = {},
): Promise<Recipe> {
  // Step 1: Enrich public pins to discover HD images, carousels, MP4/HLS videos, and outbound blog links
  const isDirectMediaUrl =
    inputPin.mediaType === 'blog' ||
    (inputPin.mediaType === 'video' && Boolean(inputPin.videoUrl) && !inputPin.pinUrl.includes('pinterest.'));
  const pin =
    options.skipEnrich || isDirectMediaUrl
      ? inputPin
      : await enrichSinglePin(inputPin.pinUrl, inputPin.boardId, inputPin);

  // Step 2: Fetch cover image for decision gate & image fallback
  const coverImage = pin.imageUrl ? await fetchMediaBuffer(pin.imageUrl, 8 * 1024 * 1024) : null;

  // Tier 0: Fast non-recipe gate (skip when forced, direct blog URL, or direct video stream)
  if (!options.forceExtract && pin.mediaType !== 'blog' && !isDirectMediaUrl) {
    const decision = await runRecipeDecisionGate(pin, coverImage);
    if (decision && !decision.isRecipe) {
      const id = pin.pinId.startsWith('pin_') ? pin.pinId : `pin_${pin.pinId}`;
      return RecipeSchema.parse({
        id,
        boardId: pin.boardId,
        status: 'skipped_non_recipe',
        sourceType: pin.mediaType === 'video' ? 'video' : pin.mediaType === 'carousel' ? 'carousel' : 'image',
        sourcePinUrl: pin.pinUrl,
        outboundUrl: pin.outboundUrl,
        videoUrl: pin.videoUrl,
        imageUrl: pin.imageUrl,
        title: pin.title || 'Non-Recipe Pin',
        summary: 'Filtered out as non-recipe food content (e.g., infographic, storage chart, or tip).',
        creator: pin.creator,
        category: 'Healthy & Veggie',
        tags: ['Skipped'],
        prepMinutes: 0,
        cookMinutes: 0,
        servings: 1,
        difficulty: 'Easy',
        ingredients: [],
        steps: [],
        confidence: decision.confidence,
        extractionNotes: 'Skipped by Gemini Decisions recipe gate. Click "Extract Anyway" to force parsing.',
        rawCaption: pin.description,
        extractedAt: new Date().toISOString(),
      });
    }
  }

  // Tier 1: Outbound recipe blog with schema.org/Recipe JSON-LD (fastest & most exact quantities)
  if (pin.outboundUrl) {
    const blogData = await extractJsonLdRecipe(pin.outboundUrl);
    if (blogData) {
      return extractFromBlogJsonLd(pin, blogData);
    }
  }

  // Tier 3: Video Pin Understanding (direct MP4 OR public HLS .m3u8 stream -> Gemini 4 Hydrogen)
  if (pin.videoUrl) {
    const downloadedVideo = await downloadVideoOrHls(pin.videoUrl, MAX_VIDEO_DOWNLOAD_BYTES);
    if (downloadedVideo) {
      return extractFromVideo(pin, downloadedVideo);
    }
  }

  // Tier 2: Carousel or Single Image Understanding -> Gemini 4 Hydrogen
  const imageBuffers: Array<{ buffer: Buffer; mimeType: string }> = [];
  if (pin.carouselImageUrls && pin.carouselImageUrls.length > 1) {
    const fetched = await Promise.all(
      pin.carouselImageUrls.slice(0, 6).map((u) => fetchMediaBuffer(u, 8 * 1024 * 1024)),
    );
    for (const item of fetched) {
      if (item && item.mimeType.startsWith('image/')) imageBuffers.push(item);
    }
  } else if (coverImage && coverImage.mimeType.startsWith('image/')) {
    imageBuffers.push(coverImage);
  }

  if (imageBuffers.length > 0) {
    const note = pin.videoUrl
      ? 'Video stream was unavailable for direct download; extracted from cover image and pin caption.'
      : undefined;
    return extractFromImages(pin, imageBuffers, note);
  }

  // Text-only fallback if no media could be fetched
  const extracted = await runStructuredInteraction('gemini-3.5-flash-lite', [
    {
      type: 'text',
      text: `Extract a structured UK meal-planner recipe from this pin text:\nTitle: ${pin.title}\nCaption: ${pin.description || '(none)'}\nURL: ${pin.outboundUrl || pin.pinUrl}`,
    },
  ]);

  return buildRecipeFromExtraction(pin, extracted, pin.mediaType === 'blog' ? 'blog' : 'image', pin.imageUrl);
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}
