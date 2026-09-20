import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type BoxRead = {
  name: string;
  dose: string;
  form: string;
};

const schema = z.object({
  image: z.string().min(32).max(1_800_000),
});

function parseBox(text: string): BoxRead {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { name: "", dose: "", form: "" };
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      name: String(raw.name ?? "").trim().slice(0, 80),
      dose: String(raw.dose ?? "").trim().slice(0, 40),
      form: String(raw.form ?? "").trim().slice(0, 40),
    };
  } catch {
    return { name: "", dose: "", form: "" };
  }
}

export const readBoxLabel = createServerFn({ method: "POST" })
  .validator(schema)
  .handler(async ({ data }): Promise<{ ok: true; box: BoxRead } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "Čitanje kutije trenutno nije dostupno. Upiši naziv ručno." };
    }

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 220,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Čitaš prednju stranu kutije lijeka. Vrati isključivo JSON: {\"name\":\"zaštićeni naziv\",\"dose\":\"jačina npr. 5 mg\",\"form\":\"tablete|kapsule|kapi|sirup|sprej|ostalo\"}. Ako nije kutija lijeka, prazna polja.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Izvuci naziv, gramažu i oblik s prednje strane kutije.",
              },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false, error: "Kutija se nije dala pročitati. Upiši naziv ručno." };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const box = parseBox(text);
    if (!box.name && !box.dose) {
      return { ok: false, error: "Na slici nisam našao naziv lijeka." };
    }
    return { ok: true, box };
  });
