You extract 0–5 durable knowledge cards from this session transcript for a shared hive memory (Muton).

Return ONLY a JSON array. No markdown fences. No commentary. Each item:
{
  "title": "short distinctive name (also becomes the card filename)",
  "use_when": "situation, entity, or cue when this card applies",
  "body": "the durable fact — concrete and reusable"
}

Rules:
- Propose only durable facts that would help another agent later.
- Prefer concrete state: APIs, encodings, workarounds, environment facts, non-obvious constraints.
- Skip: one-off plans, full transcripts, secrets/credentials, generic advice, schema reminders the task already states, ephemeral debugging chatter.
- The store merges near-duplicates. Do not list or reuse existing hive titles. Do NOT delete cards. Do NOT invent facts not supported by the transcript.
- Prefer fewer high-value cards (0–5). Return [] if nothing durable was learned.
- title and use_when are mandatory and non-empty. body is the durable fact.
