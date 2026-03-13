// app/api/explain-node/route.ts
// Called lazily when user clicks "Explain this change" on a node
// Uses Gemini to explain what changed in a file and why it matters

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: NextRequest) {
    try {
        const { patch, label, repoName, lang } = await req.json();
        const targetLang = lang || "English";

        if (!patch || !label) {
            return NextResponse.json({ error: "Missing patch or label" }, { status: 400 });
        }

        const prompt = `You are a senior developer explaining a code change to a teammate.

Repository: ${repoName ?? "unknown"}
File: ${label}

Diff patch:
\`\`\`
${patch.slice(0, 800)}
\`\`\`

In exactly 2 sentences:
1. What changed in this file (be specific about the code, not vague)
2. Why it matters and who is affected (developers using this API, CI/CD pipelines, end users, etc.)

Be precise and developer-focused. No fluff. No "this commit" language.

Write the explanation in **${targetLang}** native speakers would understand.`;

        const res = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        const explanation = res.text?.trim() ?? "Could not generate explanation.";

        return NextResponse.json({ explanation });

    } catch (err: any) {
        console.error("[explain-node] Error:", err);
        return NextResponse.json(
            { explanation: "Failed to generate explanation." },
            { status: 500 }
        );
    }
}
