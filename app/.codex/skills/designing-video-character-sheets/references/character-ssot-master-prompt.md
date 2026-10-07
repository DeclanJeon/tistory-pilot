# Character SSOT master specification

This is the detailed reference for producing a **full canonical Character SSOT** — a reproducible identity design, not just a character introduction. Read it when the assignment calls for the full `CHARACTER SSOT` output (image-backed preproduction package per-character SSOT, or an explicit request for the complete format). The default lightweight craft sheet stays in [`character-craft.md`](character-craft.md); the ledger-ready field layout lives in [`../../video-production-assets/assets/character-ssot-template.md`](../../video-production-assets/assets/character-ssot-template.md).

A Character SSOT is authored jointly as identity design + production usability: designers, casting, costume, visual development and story design each care about a different slice, so every section is written to be **filmed, prompted and audited**, not merely described.

## Inputs

Work from: topic; optional character count (default 1 when neither an existing cast nor a user count supplies one); gender; age; nationality/culture; era (modern when unspecified); genre; realism; intended use (general image / video / story); setting; visual style; audience; and any additional constraints. Under a production packet, also consume the supplied synopsis artifact/version, assigned `character_id`, and any supplied sheets, reference images or voice notes.

### Facts vs design

Every value carries exactly one provenance, and the four classes are never blurred:

- **확정 정보 / supplied** — user-provided or packet-locked facts. Always wins; never rewritten by design.
- **디자인 제안 / proposal** — a labeled creative choice made under explicit fictional-design delegation. Easy to change, never asserted as fact.
- **관찰 / observed** — read from an actual opened source; record the source asset ID, version and inspected scope. An unreadable supplied sheet stays `unverified`.
- **미정 / undecided** — a consequential unknown that stays open. Template fields never justify manufacturing a value.

**Delegated fictional design.** When the brief explicitly delegates creative design of a fictional character, choose missing creative attributes — including age, gender, build and backstory — as **labeled design proposals** grounded in the topic. This is the normal full-SSOT path: a delegated fiction SSOT with empty identity slots is a failed output, not a cautious one.

**Scope-limited approved characters.** When the packet supplies an existing character with established choices, preserve those choices; fill only the gaps the section needs, labeled as proposals, and never rewrite supplied identity.

**Real people.** For a real, identifiable person, never invent undocumented biography, psychology or personal facts. Unsupplied facts stay `미정`. **Irrelevant exact numbers** — a precise weight, birthday, or measurement the story and design do not need — are not manufactured for anyone.

**Questioning.** Do not stop a one-sentence topic with interrogation. One concise question is warranted only when an unresolved choice materially changes the character's role or the story; otherwise proceed with labeled proposals.

## Required output: `CHARACTER SSOT`, sections 0–33

The output keeps this exact section order and numbering. Omit nothing; mark a section `N/A` only with a stated reason (e.g., silent role → Voice & Speech N/A).

| # | Section | Content |
|---|---|---|
| 0 | SSOT Metadata | Character ID, Version, Created From (source/packet), Primary Use |
| 1 | Character Summary | Short readable overview |
| 2 | One-Line Character DNA | Single-sentence identity hook |
| 3 | Core Identity | Identity slots + archetype |
| 4 | Visual Identity Lock | Body/scale/proportion locks |
| 5 | Face Identity Lock | Feature-by-feature face spec |
| 6 | Hair Identity Lock | Style/color/silhouette spec |
| 7 | Identity Anchors | `Feature \| Description \| Lock Level` — 3–7 anchors |
| 8 | Color Identity | Named palette with roles (+HEX where useful) |
| 9 | Costume DNA | Fashion logic + signature outfit |
| 10 | Expression DNA | Defined expression set |
| 11 | Body Language | Default and state-specific behavior |
| 12 | Voice & Speech | Vocal design; N/A if silent |
| 13 | Personality | 5–7 traits, each fully developed |
| 14 | Psychology | Wants/fears, relevant values and conflicts, conditional decision rules, boundaries, emotions and responses |
| 15 | Backstory | Only causally relevant history |
| 16 | Relationships | Per relationship type, adapted or N/A |
| 17 | Likes & Dislikes | 5–10 concrete entries each |
| 18 | Habits & Micro Details | ≥10 meaningful specifics |
| 19 | Skills & Limitations | good / average / poor / learning / impossible |
| 20 | Character Contradictions | ≥3 for full delegated fictional design |
| 21 | Silhouette Specification | Recognition silhouette |
| 22 | Turnaround Specification | Per-view preservation notes |
| 23 | Proportion Reference | Scale ratios |
| 24 | Variable States | What may change and how |
| 25 | DO NOT CHANGE | 5–15 design-specific items |
| 26 | Anti-Drift Rules | Generation drift defenses |
| 27 | Reference Character Sheet Prompts | A Identity, B Expressions, C Costumes, D Action/Poses |
| 28 | Image Generation Master Description | 150–300 words |
| 29 | Character Identity Prefix | 60–120 words, reusable verbatim |
| 30 | Negative Identity Prompt | Design-specific drift exclusions |
| 31 | Story Function | Role in the synopsis only as needed |
| 32 | Appeal Evaluation | `Criterion \| Score \| Reason`, 0–10 |
| 33 | Final Character Lock Summary | ABSOLUTE IDENTITY / STABLE IDENTITY / VARIABLE |

## Section craft detail

### 0–3 — Metadata, summary, DNA, core identity

- **0 SSOT Metadata:** the assigned or sequential `character_id`, the sheet's own version (delegated work keeps coordinator-assigned artifact ID/version), `Created From` (synopsis artifact ID + version, or the standalone brief), and `Primary Use` (image / video / story).
- **1 Character Summary:** a paragraph a stranger could cast from — who this is, what they look like at a glance, what they do in the story.
- **2 One-Line Character DNA:** the format `[인물 유형]이지만 [반전되는 특성]을 가진 인물로, [시각적 특징]과 [행동적 특징] 때문에 한번 보면 쉽게 잊히지 않는다` — type, a subverting trait, one visual feature, one behavioral feature that together make the character unmissable.
- **3 Core Identity — identity slots:** character ID, name / English name / alias, gender, actual age and apparent age, birthday (only if relevant), nationality/culture, birthplace / home / languages, occupation / social position / role in the world.
- **3 Core Identity — archetype:** story role; first impression vs actual nature; want / fear / lack / weakness / hidden strength / contradictions; 3–5 keywords.

### 4–7 — Identity locks and anchors

- **4 Visual Identity Lock (body):** height or relative scale; weight/build **category** without gratuitous precise numbers; shoulders / torso / waist / pelvis / limb proportions; hands and feet; default posture and gait.
- **5 Face Identity Lock:** face shape and height/width ratio; forehead / cheekbones / cheeks / jaw / chin; eyes — size, shape, tilt, separation, lids, pupil, iris, gaze, lashes, under-eye; brows — shape, thickness, angle, color; nose — bridge, length, tip, wings, profile; mouth — size, upper/lower lips, corners, resting state, teeth; ears; skin — tone, undertone, texture, freckles, moles, scars, distinctive marks.
- **6 Hair Identity Lock:** style, length, part, fringe, sides, back, density, thickness, curl, base-vs-lit color, silhouette. Hair carries mandatory anchors.
- **7 Identity Anchors:** 3–7 distinctive, nameable features in a `Feature | Description | Lock Level` table. Every anchor is classified **IMMUTABLE** (never changes), **STABLE** (changes only through a declared variable state), or **VARIABLE** (free within the stated range). Anchors are recognition hooks, not accessory counts — choose what makes this person identifiable in one glance.

### 8–9 — Color and costume

- **8 Color Identity:** primary / secondary / accent / skin / hair / eye / costume colors, each named with its role; HEX values where genuinely useful. Coherence over complexity — never complicated for its own sake.
- **9 Costume DNA:** fashion genre, silhouette, materials, colors and deliberately avoided colors; accessories, shoes, bag, jewelry, glasses. **Signature outfit:** top / bottom / outer / shoes / accessories / material / color / wear state / fit / newness. Costume changes must respect the fixed identity — a new outfit never rewrites the anchors.

### 10–12 — Expression, body language, voice

- **10 Expression DNA:** define each of — neutral, gentle smile, genuine laugh, sad, angry, irritated, surprised, afraid, confident, embarrassed, concentrating, exhausted — as eyes / brows / mouth / jaw / muscle tension / head angle. Specific mechanics, not adjectives.
- **11 Body Language:** default posture; standing, sitting; under tension, confidence, anger, lying, laughing; gaze behavior; walk and run; one signature habit and one unconscious action; personal-space tendency.
- **12 Voice & Speech:** pitch, timbre, rate, pronunciation, intonation, volume, sentence length, word choice, humor style, use of silence, emotional change, repeated phrases and **forbidden** phrases; up to 3 sample lines only where they genuinely help. A silent role is explained `N/A` — never converted into a narrator or an audio-file claim.

### 13–20 — Persona, psychology, life detail

This block feeds the canonical `persona` record — `{role, personality, observable_behavior, speech}` — with filmable, observable content:

- **13 Personality:** 5–7 behavioral traits. Each trait is developed as `trait → observable action → strength → problematic situation`, so every adjective is playable.
- **14 Psychology:** want, need, fear, shame, regret, pride, secrets, an unacknowledged fact, and concrete responses to stress, love, anger, failure, success. When the story supports a meaningful trade-off, identify the competing values/commitments and the character-specific priority, boundary, and conditions that alter the choice under ordinary, pressure, risk, or relationship stakes. Tie these rules to observable thought, emotion, reaction, dialogue, and choice. Ground them in supplied/observed material or label them `proposal` under explicit fictional-design delegation; otherwise leave them undecided. Never manufacture trauma, diagnosis, secrets, or a moral dilemma just to deepen the profile.
- **15 Backstory:** only causally relevant material — childhood, family, turning event, education, relationships, success/failure/loss, current role. No needless chronology.
- **16 Relationships:** for each of stranger / friend / family / partner / boss / subordinate / rival / enemy / child / animal — the character's stance, adapted to the cast; mark non-applicable types rather than inventing people.
- **17 Likes & Dislikes:** 5–10 **concrete** entries each — the specific object/food/sound/habit, not "likes nature."
- **18 Habits & Micro Details:** ≥10 meaningful micro-details — small repeatable actions or tells that a director can stage.
- **19 Skills & Limitations:** rate domains as good / average / poor / learning / impossible; an impossible skill protects the design as much as a talent.
- **20 Character Contradictions:** ≥3 genuine contradictions for a full delegated fictional design — places where the character's nature and behavior pull apart. Contradictions must be lived (shown in §10–12 behavior), not decorative.

### 21–24 — Visual engineering

- **21 Silhouette Specification:** describe the recognition silhouette — hair mass, shoulder line, proportions, posture, outfit shape, accessory shapes. Improve distinguishability; never add random decoration for its own sake.
- **22 Turnaround Specification:** for front, 3/4 front, side, 3/4 back, back — what each view must preserve: face geometry, nose projection, jaw and skull shape, hair volume, shoulder and body lines, clothing lengths, accessory positions.
- **23 Proportion Reference:** head-to-total-height ratio, shoulder/leg/arm/hand/foot relationships. Use coherent stylized ratios (e.g., cartoon head ratios) when the mode is stylized — not realistic anatomy forced into a cartoon.
- **24 Variable States:** declared changeable states — outfits, styling, makeup, expressions, wounds, season, weather, props, age, job, emotion. A variable state **cannot overwrite an immutable anchor**; each entry states what it may touch and what it must leave alone.

### 25–26 — Locks and drift defenses

- **25 DO NOT CHANGE:** 5–15 design-specific items — the exact features that identify this character (e.g., "the notch in the left eyebrow," not "keep him handsome").
- **26 Anti-Drift Rules:** generation defenses — preserve face geometry, eye size and spacing, iris color, body proportions, age, cultural design elements, base colors, asymmetry and marks. Lighting is not a new hair color; a beauty filter is not a new identity.

### 27 — Reference character sheet prompts (A–D)

Write all four as **prompt specifications**. Only Sheet A is the mandatory actual image in a full image-backed package — B/C/D are specs that do **not** authorize extra generations or spend on their own.

- **Sheet A — Identity Sheet (the actual per-character image in image-backed packages):** one neutral studio image containing full-body front, 3/4 front, side, and back **and** face front, 3/4, and side — 7 views, same person, neutral expression, soft neutral lighting, clear proportions, no scene, action, or background storytelling. A glam portrait is never a substitute for the actual sheet.
- **Sheet B — Expressions:** same person, 9 expressions — neutral, smile, laugh, anger, sadness, fear, surprise, confidence, embarrassment.
- **Sheet C — Costumes:** signature / casual / formal / work / seasonal outfits on the unchanged body and face.
- **Sheet D — Action/Poses:** 6–10 poses or actions that reveal the personality defined in §13.

Every prompt embeds the §29 identity prefix and §30 negatives; only established or explicitly proposed anchors appear.

### 28–30 — Prompt text

- **28 Image Generation Master Description:** 150–300 words covering age, gender, cultural visual design, face, eyes, nose, lips, skin, hair, body, anchors, outfit, mood. No scene, action, background or camera language.
- **29 Character Identity Prefix:** 60–120 words carrying the immutable and stable traits, reused **verbatim** across image and video prompts. It is a consistency aid — it never claims to guarantee model identity.
- **30 Negative Identity Prompt:** design-specific drift exclusions — the concrete ways this character gets corrupted (e.g., "no beard, no glasses, no blonde tint, no slimming of the jaw"), not generic negatives.

### 31–33 — Function, appeal, final lock

- **31 Story Function:** purpose in the synopsis, the audience emotion it serves, arrival state, middle, key choice, change, final state — only to the degree the synopsis needs. The supplied spine is preserved; nothing is added to justify a design.
- **32 Appeal Evaluation:** `Criterion | Score | Reason` over — visual distinctiveness, memorability, emotional appeal, personality depth, story potential, silhouette recognition, production consistency, originality. Score 0–10 with reasons; revise any design area under 7. Never inflate scores, and never present the self-review as artwork QA or user acceptance. Mark scope-irrelevant criteria `N/A` honestly.
- **33 Final Character Lock Summary:** three lists — **ABSOLUTE IDENTITY** (immutable), **STABLE IDENTITY** (changes only via declared variable states), **VARIABLE** (free within the stated range). This is the summary a downstream consumer can check a frame against.

## Consistency audit and identity priority

Before returning, audit: age–face coherence; occupation–costume; stated nature–behavior; past–motivation; build–body; cultural setting; era–props; hair/eye/skin color consistency; immutable–variable conflicts; story–personality fit. Fix contradictions inside the SSOT rather than shipping a "compelling inconsistency."

When a conflict forces a choice, apply identity priority: **user supplied > IMMUTABLE > face > body > core DNA > costume > personality > scene variation**. Lower items yield to higher ones; a costume pitch never bends an IMMUTABLE face feature.

### Decision consistency check

Use one or more decision conflicts supported by the synopsis, brief, or established character facts. Trace `trigger/stakes → thought → emotion → visible reaction/dialogue → choice`, then verify the chain against the recorded values, relationships, fears, and limits. The test predicts a consistent response; it does not add a scene or canonize an outcome. If no decision conflict is supported, use one clearly labeled hypothetical validation scenario and keep its outcome outside story canon; consequential unsupported details remain undecided.

## Design principles

- Avoid generic beauty — controlled small imperfections are what make a face real and reproducible.
- Recognition beats accessory count; specific shape and behavior beat adjective lists.
- Internal logic over stereotype: occupational or cultural shorthand is not character.
- Every invented value is labeled; every supplied or observed value is preserved with its provenance.

## Nonhuman adaptation

Adapt the anatomy sections instead of forcing a human template:

- **Animal:** coat/pattern, tail, ears, motion logic become the body/hair/face equivalents.
- **Robot:** head form, sensors, chassis, joints, materials, lights map to face/skin/proportions.
- **Creature:** anatomy, skeletal logic, skin, limbs, scale and silhouette locks.
- **Stylized/anthropomorphic:** declare which human features are fixed vs which animal features persist; keep the ratio logic coherent with §23.

All other sections — anchors, expression DNA, anti-drift, prompts, lock summary — apply unchanged.

## Multi-character cast

Each character gets an independent SSOT. After all individual SSOTs, append a **CAST DIFFERENTIATION MATRIX** with columns `Character | Face | Silhouette | Color | Personality | Movement | Key Anchor`, then resolve accidental overlap in face, hair, color, build, personality or silhouette. Deliberately related characters supplied by the brief (siblings, clones, uniforms) keep their supplied relationships — do not force arbitrary difference.

## Canonical record mapping

In a full image-backed package, each character's SSOT output is recorded on the canonical `project.json` records (coordinator writes; the skill returns the packet):

| Canonical field | Type | Content |
|---|---|---|
| `characters[].persona` | object of nonempty strings | `{role, personality, observable_behavior, speech}` — speech is `N/A`-explained for silent roles, not empty |
| `characters[].ssot_artifact_id` | artifact `type=character_sheet` | links the actual SSOT Markdown asset; artifact depends on the synopsis artifact/version |
| `characters[].identity_sheet_asset_id` | asset `kind=character_identity_sheet` | **image-backed only**; `entity_type=character`, `entity_id` = the character's `character_id`; points at the actual Sheet A image |
| `preproduction` root | object | `{mode: text|image_backed, synopsis_artifact_id, storyboard_artifact_id, storyboard_sheet_artifact_ids, storyboard_split_asset_id}` — ordered sheet artifact IDs (max 8 panels per sheet, including one-sheet arrays) and the actual scene/panel split-manifest asset |

Traceability runs synopsis artifact/version/source → `character_sheet` artifact/version → the single matching `character_identity_sheet` asset → shot/panel reference input. A shot that names a character consumes that character's identity image asset in image-backed mode.

Prompts are not generated sheets, and provider success is not identity QA: genuine image inspection must open the returned sheet and compare its views against the declared anchors. The skill itself stays a text specialist — it returns the versioned SSOT packet and Sheet A spec; the actual image is produced by the image executor under the coordinator.
