---
name: video-prompt
description: Compose AI video-generation prompts from a natural-language idea using a slot schema serialized per target model dialect (Veo, Sora, Kling, Seedance, Hailuo, Runway, Luma, Omni Flash, Wan, Grok, Vidu, PixVerse, Pika, LTX, Hunyuan, Mochi). Use whenever writing, improving, or translating a text-to-video / image-to-video / video-edit prompt.
---

# Video Prompt Composer

Turn a rough idea into a model-correct video prompt. The corpus-derived rule: a prompt is **slot-filling**, not prose invention — fill the schema, then serialize in the target model's dialect.

## Scope

`creative-production` is the sole project-level coordinator for content/video production; this skill is the prompt-composition specialist. Standalone invocation: consult `creative-production` once for scope/route, then compose only the requested prompt(s). Delegated by `creative-production`: proceed without calling back or re-running interviews/approvals. A prompt request implies no model selection (use `video-model-router` when unresolved), no generation/spend, and no broader package.

## Slot schema

Fill what the idea implies; leave the rest empty rather than inventing.

| Slot | Corpus frequency | Examples |
|---|---|---|
| shot_type | 26% | close-up, wide shot, POV, aerial, macro, over-the-shoulder |
| subject | always | who/what, with distinguishing detail |
| action | always | what moves/changes |
| setting | always | place, time, environment |
| camera_move | 39% | dolly in, orbit, tracking, push-in, whip pan, FPV, handheld |
| lens | 12% | 35mm, anamorphic, macro, shallow depth of field |
| lighting | 18% | golden hour, volumetric, neon, backlit, low-key |
| style | 25% | cinematic, 35mm film, VHS, anime, photorealistic |
| audio | 14% | ambient sound, sfx, score — models with native audio only |
| dialogue | 12% | quoted lines — Veo/Kling/Sora/Seedance only |
| duration | 7% | seconds; respect model max (see dialects) |
| aspect/res | 19% | 16:9, 9:16, 4K, 24fps |
| negative | 19% | "no text", "no watermark", avoid-list |

## Dialect selection

Read [dialects.json](./dialects.json). Pick the model entry, apply its `genre`:

- **narrative** → one flowing paragraph in slot order. (Veo, Sora, Runway, Luma, Grok, Pika, open models)
- **production-spec** → structured blocks: `[Style]`/`[Scene]`/`[Shot N]`/`subject_definitions:`/`@Image N`/`<sfx>`/timestamps. (Seedance 2.x, Hailuo 3, Omni Flash, Kling 3, Wan 3)
- **edit-command** → imperative verb + target: "Extend the video…", "Replace the background with…". (V2V/edit models)
- **interactive** → streaming steering instructions. (PixVerse R2, Solaris, GWM Worlds 2)

Model-specific rules that matter:

- **Hailuo**: capitalize camera commands (Push In, Orbit, Tracking Shot). H3 Max accepts ~5000-char spec blocks.
- **Veo**: `Audio:` label; dialogue as inline quotes.
- **Seedance 2.x**: `@Image N`/`@Video N`/`@Audio N` reference syntax; `<sfx>` tags; edit verbs.
- **Kling**: `shot 1… shot 2…` multi-shot sequences; dialogue welcome.
- **Omni Flash**: `IMAGE_REF`, timecodes, conversational edits.

## Failure modes → fixes

| Symptom | Fix |
|---|---|
| Morphing / subject melts mid-clip | Shorten duration; remove second camera move; add "stable identity" anchor; use i2v with a clean first frame |
| Text/watermark artifacts | Add negative "no text, no watermark, no subtitles"; avoid signage in scene description |
| Physics glitches (limbs, liquids) | Simplify action to one motion; name the physics explicitly ("cloth billows", "water splashes"); slow the camera |
| Identity drift across shots | `subject_definitions:`/`@Image` ref (Seedance/Hailuo/Wan); repeat exact subject phrase verbatim; FLF2V chain |
| Camera ignores instruction | Move camera term earlier; use model's structured camera param if it exists (Hailuo/Runway); capitalize command for Hailuo |
| Audio/dialogue missing | Model lacks native audio → switch to Veo/Kling/Seedance/Grok; check `Audio:` label syntax |
| Prompt ignored past N chars | Trim to slot order; drop adjectives; move specs to API params (aspect, duration) |

## Rules

1. Never emit a prompt for a feature the model lacks (e.g. dialogue → Pika; 30s → Veo max 8s).
2. One camera move per shot; multi-move → split into shots.
3. Concrete over abstract: "rain-slick neon street at dawn" not "cool city vibe".
4. For i2v, describe *motion and change*, not the static image content.
5. Keep negatives minimal and only for known failure modes (text, watermark, extra fingers).

## Reference corpus

`C:/Users/Administrator/Videos/동영상 프롬프트 모음/prompts/` — 1,155 verbatim examples with result links, grouped by model. `index.html` is a searchable gallery. When unsure of a dialect, grep the matching file for real examples before composing.
