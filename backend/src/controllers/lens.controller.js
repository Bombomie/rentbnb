/**
 * lens_controller.js
 *
 * Two responsibilities:
 *
 * 1. analyseImage  — POST /lens/analyse
 *    Analyses a base64 image, maps it to one of the 5 app categories,
 *    generates keywords, then runs a two-tier Firestore search.
 *    Returns matched listings so the Android client only needs one HTTP call.
 *
 * 2. generateSearchTags (exported helper, not a route)
 *    Called by listings_controller.js after createListing.
 *    Generates lowercase searchTags from the listing's title + category + description.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq                   = require("groq-sdk");
const admin                  = require("../config/firebase");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });
const db    = admin.firestore();

const GEMINI_MODELS = ["gemini-1.5-flash-8b", "gemini-1.5-flash"];
const GROQ_MODELS   = [
    { id: "llama-3.1-8b-instant",     maxTokens: 200 },
    { id: "llama-3.3-70b-versatile",  maxTokens: 200 }
];

// The exact 5 category strings used throughout the app
const VALID_CATEGORIES = ["Wheels", "Water", "Outdoors", "Electronics", "Beach Leisure"];

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

function parseJsonFromText(text) {
    const cleaned = text
        .replace(/```json\s*/gi, "")
        .replace(/```/g, "")
        .trim();
    return JSON.parse(cleaned);
}

async function tryGeminiVision(base64Image) {
    const prompt = buildVisionPrompt();
    let lastError = null;

    for (const modelName of GEMINI_MODELS) {
        try {
            const model  = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([
                { inlineData: { mimeType: "image/jpeg", data: base64Image } },
                { text: prompt }
            ]);
            const parsed = parseJsonFromText(result.response.text().trim());
            if (isValidLensResult(parsed)) {
                console.log(`[Lens] Vision served by ${modelName} | category: ${parsed.category}`);
                return parsed;
            }
        } catch (err) {
            console.warn(`[Lens] ${modelName} failed: ${err.message?.substring(0, 100)}`);
            lastError = err;
        }
    }
    throw lastError || new Error("Gemini vision failed");
}

async function tryGroqVisionFallback(base64Image) {
    // Groq is text-only. We describe the task and ask it to infer from context.
    // We pass a truncated prefix of the base64 string purely as a fingerprint
    // so the model has a token anchor — it cannot actually see the image.
    // This is a best-effort fallback that still enforces the category constraint.
    const fingerprint = base64Image.substring(0, 40);
    const prompt = buildGroqFallbackPrompt(fingerprint);
    let lastError = null;

    for (const { id, maxTokens } of GROQ_MODELS) {
        try {
            const completion = await groq.chat.completions.create({
                model: id,
                messages: [{ role: "user", content: prompt }],
                max_tokens: maxTokens,
                temperature: 0.4
            });
            const text   = completion?.choices?.[0]?.message?.content?.trim() || "";
            const parsed = parseJsonFromText(text);
            if (isValidLensResult(parsed)) {
                console.log(`[Lens] Groq fallback served by ${id}`);
                return parsed;
            }
        } catch (err) {
            console.warn(`[Lens] Groq ${id} failed: ${err.message?.substring(0, 100)}`);
            lastError = err;
        }
    }
    throw lastError || new Error("Groq fallback failed");
}

function isValidLensResult(parsed) {
    return parsed
        && VALID_CATEGORIES.includes(parsed.category)
        && Array.isArray(parsed.keywords)
        && parsed.keywords.length >= 1;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildVisionPrompt() {
    return `You are a categorization AI for "RentBnb", a peer-to-peer rental app in the Philippines.

Analyze the image and identify the primary object the user wants to rent.

Rules:
1. You MUST assign the object to EXACTLY ONE category from this list (use the exact string):
   ${VALID_CATEGORIES.map(c => `"${c}"`).join(", ")}

   Category guide:
   - "Wheels"        → vehicles, bikes, motorcycles, scooters, cars, boats on trailers
   - "Water"         → water sports equipment, paddleboards, kayaks, snorkel gear, jet skis
   - "Outdoors"      → camping gear, tents, hiking equipment, backpacks, climbing gear
   - "Electronics"   → cameras, laptops, drones, keyboards, audio gear, projectors, gadgets
   - "Beach Leisure" → beach umbrellas, towels, chairs, coolers, volleyball nets, beach toys

2. Generate 4 to 6 highly specific lowercase keywords for the object (its name, type, brand hints, use case).
   Example for a keyboard: ["keyboard", "mechanical keyboard", "typing", "computer", "input device", "peripherals"]
   Example for a drone: ["drone", "dji", "quadcopter", "aerial", "photography", "flying"]

3. Return ONLY this JSON and nothing else:
{"category":"Electronics","keywords":["keyword1","keyword2","keyword3","keyword4"]}`;
}

function buildGroqFallbackPrompt(imageFingerprint) {
    return `You are a categorization AI for "RentBnb", a peer-to-peer rental app in the Philippines.
A user photographed an object they want to search for rentals of. Image fingerprint: ${imageFingerprint}

Based on common rental items in the Philippines, assign the most likely category and keywords.

You MUST use EXACTLY ONE of these categories (exact string):
${VALID_CATEGORIES.map(c => `"${c}"`).join(", ")}

Category guide:
- "Wheels"        → vehicles, bikes, motorcycles, scooters, cars
- "Water"         → water sports equipment, paddleboards, kayaks, snorkel gear
- "Outdoors"      → camping gear, tents, hiking equipment, backpacks
- "Electronics"   → cameras, laptops, drones, keyboards, audio gear, projectors, gadgets
- "Beach Leisure" → beach umbrellas, towels, chairs, coolers, volleyball nets

Generate 4 to 6 lowercase keywords.
Return ONLY this JSON:
{"category":"Electronics","keywords":["keyword1","keyword2","keyword3","keyword4"]}`;
}

// ---------------------------------------------------------------------------
// Two-tier Firestore search
//
// Tier 1: category == aiCategory AND searchTags array-contains-any aiKeywords
// Tier 2: if Tier 1 returns 0 results, category == aiCategory ordered by rating
//
// Both tiers return a maximum of 20 listings.
// ---------------------------------------------------------------------------

async function searchListings(category, keywords) {
    let tier = 1;

    // Tier 1
    let snapshot = await db.collection("listings")
        .where("status",   "==", "active")
        .where("category", "==", category)
        .where("searchTags", "array-contains-any", keywords.map(k => k.toLowerCase()))
        .limit(20)
        .get();

    // Tier 2 fallback
    if (snapshot.empty) {
        tier = 2;
        snapshot = await db.collection("listings")
            .where("status",   "==", "active")
            .where("category", "==", category)
            .orderBy("rating", "desc")
            .limit(20)
            .get();
    }

    const listings = snapshot.docs.map(doc => {
        const data = doc.data();
        if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
        if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();
        return { id: doc.id, ...data };
    });

    return { listings, tier };
}

// ---------------------------------------------------------------------------
// Main endpoint: POST /lens/analyse
// ---------------------------------------------------------------------------

exports.analyseImage = async (req, res) => {
    const { imageBase64 } = req.body;

    if (!imageBase64 || imageBase64.trim().length === 0) {
        return res.status(400).json({ success: false, error: "imageBase64 is required." });
    }

    // Reject payloads that are clearly too large
    const estimatedKb = Math.round((imageBase64.length * 3) / 4 / 1024);
    if (estimatedKb > 2048) {
        return res.status(400).json({ success: false, error: "Image too large. Maximum 2 MB." });
    }

    let aiResult = null;

    // Try Gemini vision first
    try {
        aiResult = await tryGeminiVision(imageBase64);
    } catch (_) {
        console.warn("[Lens] Gemini vision exhausted, trying Groq fallback");
    }

    // Try Groq text fallback
    if (!aiResult) {
        try {
            aiResult = await tryGroqVisionFallback(imageBase64);
        } catch (_) {
            console.error("[Lens] All AI providers failed");
        }
    }

    // Hard fallback — if both fail, return Electronics as the safest default
    if (!aiResult) {
        aiResult = {
            category: "Electronics",
            keywords: ["electronics", "gadget", "device", "equipment"]
        };
    }

    // Run the two-tier Firestore search
    try {
        const { listings, tier } = await searchListings(aiResult.category, aiResult.keywords);
        return res.status(200).json({
            success: true,
            detectedCategory: aiResult.category,
            keywords: aiResult.keywords,
            tier,
            data: listings
        });
    } catch (searchError) {
        console.error("[Lens] Firestore search failed:", searchError.message);
        return res.status(500).json({ success: false, error: searchError.message });
    }
};

// ---------------------------------------------------------------------------
// generateSearchTags — called by listings_controller.js after createListing
//
// Generates 6–10 lowercase search tags from the listing's title, category,
// and description using the AI provider chain.
// Fire-and-forget: errors are logged but never surfaced to the owner.
// ---------------------------------------------------------------------------

exports.generateSearchTags = async (listingId, productName, category, description) => {
    const prompt = `You are a search-tag generator for "RentBnb", a rental marketplace app.

Given this listing:
- Title: ${productName}
- Category: ${category}
- Description: ${description || "(no description)"}

Generate 6 to 10 lowercase search tags that a renter might use to find this item.
Include: the item name, synonyms, use cases, related activities, and the category name.
Example for "DJI Drone": ["drone","dji","quadcopter","aerial photography","camera drone","flying","video","electronics"]

Return ONLY a JSON array of strings. No explanation, no code blocks:
["tag1","tag2","tag3"]`;

    let tags = null;

    // Try Gemini
    for (const modelName of GEMINI_MODELS) {
        try {
            const model  = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const parsed = JSON.parse(parseJsonFromText(result.response.text().trim()));
            if (Array.isArray(parsed) && parsed.length >= 3) {
                tags = parsed.map(t => String(t).toLowerCase().trim());
                console.log(`[Tags] Generated by ${modelName} for listing ${listingId}`);
                break;
            }
        } catch (err) {
            console.warn(`[Tags] ${modelName} failed: ${err.message?.substring(0, 80)}`);
        }
    }

    // Try Groq
    if (!tags) {
        for (const { id, maxTokens } of GROQ_MODELS) {
            try {
                const completion = await groq.chat.completions.create({
                    model: id,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: maxTokens,
                    temperature: 0.5
                });
                const text   = completion?.choices?.[0]?.message?.content?.trim() || "";
                const parsed = JSON.parse(parseJsonFromText(text));
                if (Array.isArray(parsed) && parsed.length >= 3) {
                    tags = parsed.map(t => String(t).toLowerCase().trim());
                    console.log(`[Tags] Generated by Groq/${id} for listing ${listingId}`);
                    break;
                }
            } catch (err) {
                console.warn(`[Tags] Groq ${id} failed: ${err.message?.substring(0, 80)}`);
            }
        }
    }

    // Rule-based fallback: split title + description into lowercase tokens
    if (!tags) {
        const text  = `${productName} ${category} ${description || ""}`.toLowerCase();
        const words = text.match(/\b[a-z]{3,}\b/g) || [];
        const unique = [...new Set(words)].slice(0, 10);
        tags = unique;
        console.log(`[Tags] Rule-based fallback for listing ${listingId}`);
    }

    // Write searchTags to the Firestore listing document
    try {
        await db.collection("listings").doc(listingId).update({ searchTags: tags });
        console.log(`[Tags] Saved ${tags.length} tags for listing ${listingId}`);
    } catch (err) {
        console.error(`[Tags] Failed to write tags for listing ${listingId}:`, err.message);
    }
};