import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { aiConfigured } from "../ai";
import { COPY_SYSTEM, copyBrief, fitCopy, templateCopy, type AdCopy, type StudioProduct, type StudioShop } from "../creative";
import { CONCEPT_SYSTEM, STYLES, conceptBrief, fitConcept, templateConcepts, type Concept } from "../concepts";

const MODEL = "claude-opus-5-5";

const CopySets = z.object({
  sets: z.array(
    z.object({
      angle: z.string(),
      instagram: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
      facebook: z.object({ primaryText: z.string(), headline: z.string() }),
      tiktok: z.object({ adText: z.string() }),
      google: z.object({ headlines: z.array(z.string()), descriptions: z.array(z.string()) }),
      whatsappStatus: z.string(),
    }),
  ),
});

/**
 * Three sets of ad copy for a product. Uses the AI when ANTHROPIC_API_KEY is set; otherwise, or if the AI
 * fails, the built-in templates, so the studio always gives the vendor something to post.
 */
export async function writeCopy(p: StudioProduct, shop: StudioShop, angleHint?: string): Promise<{ sets: AdCopy[]; source: "ai" | "template"; note?: string }> {
  if (!aiConfigured()) return { sets: templateCopy(p, shop), source: "template" };
  try {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: COPY_SYSTEM,
      messages: [{ role: "user", content: copyBrief(p, shop, angleHint) }],
      output_config: { effort: "low", format: zodOutputFormat(CopySets) },
    });
    const sets = res.parsed_output?.sets?.slice(0, 3).map(fitCopy) ?? [];
    if (sets.length) return { sets, source: "ai" };
  } catch (e) {
    console.error("studio copy error", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
  }
  return { sets: templateCopy(p, shop), source: "template", note: "The AI writer is busy, so these come from our templates." };
}

const Concepts = z.object({
  concepts: z.array(
    z.object({
      angle: z.string(),
      design: z.object({
        style: z.enum(STYLES),
        headline: z.string(),
        subline: z.string(),
        cta: z.string(),
        badge: z.string().nullable(),
        bg: z.string(),
        ink: z.string(),
        accent: z.string(),
      }),
      copy: CopySets.shape.sets.element,
    }),
  ),
});

/**
 * Three finished ad concepts (design and copy) from the vendor's prompt. Uses the AI when it's set up;
 * otherwise, or if the AI fails, concepts built from the prompt's theme, so the studio always delivers.
 */
export async function writeConcepts(
  prompt: string,
  p: StudioProduct,
  shop: StudioShop,
  brand: string,
): Promise<{ concepts: Concept[]; source: "ai" | "template"; note?: string }> {
  const facts = { stock: p.stock, prompt, brand };
  if (!aiConfigured()) return { concepts: templateConcepts(prompt, p, shop, brand), source: "template" };
  try {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 6000,
      system: CONCEPT_SYSTEM,
      messages: [{ role: "user", content: conceptBrief(prompt, p, shop, brand) }],
      output_config: { effort: "low", format: zodOutputFormat(Concepts) },
    });
    const concepts = res.parsed_output?.concepts?.slice(0, 3).map(c => fitConcept(c, facts)) ?? [];
    if (concepts.length) return { concepts, source: "ai" };
  } catch (e) {
    console.error("studio concept error", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
  }
  return { concepts: templateConcepts(prompt, p, shop, brand), source: "template", note: "The AI designer is busy, so these come from our templates." };
}
