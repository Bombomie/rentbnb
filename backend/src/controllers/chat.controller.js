/**
 * chat_controller.js
 *
 * AI provider chain for Inquilino:
 *   1. Gemini 1.5 Flash 8B  (primary   — 1500 req/day free, fast)
 *   2. Gemini 1.5 Flash     (fallback1  — 1500 req/day free, higher quality)
 *   3. Groq Llama 3.1 8B    (fallback2  — 14,400 req/day free, always warm)
 *   4. Groq Llama 3.3 70B   (fallback3  — 1,000 req/day free, highest quality)
 *   5. Busy message         (final      — always works, written to Firestore)
 *
 * gemini-2.5-flash is intentionally removed — its free tier is only 20 req/day
 * which is too low for production use.
 *
 * Required .env variables:
 *   GEMINI_API_KEY  — https://aistudio.google.com/app/apikey
 *   GROQ_API_KEY    — https://console.groq.com (free, no credit card)
 *
 * Required npm packages (run once):
 *   npm install @google/generative-ai groq-sdk
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq                   = require("groq-sdk");
const admin                  = require("../config/firebase");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });
const db    = admin.firestore();

// ---------------------------------------------------------------------------
// Gemini model list — ordered by quota size then quality
// gemini-1.5-flash-8b:  1500 req/day free, very fast, lightweight
// gemini-1.5-flash:     1500 req/day free, slightly higher quality
// ---------------------------------------------------------------------------
const GEMINI_MODELS = [
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash"
];

// ---------------------------------------------------------------------------
// Groq model list — ordered by request speed then quality
// llama-3.1-8b-instant: 14,400 req/day free, sub-second latency
// llama-3.3-70b-versatile: 1,000 req/day free, much higher quality
// ---------------------------------------------------------------------------
const GROQ_MODELS = [
    { id: "llama-3.1-8b-instant",   maxTokens: 256 },
    { id: "llama-3.3-70b-versatile", maxTokens: 256 }
];

// ---------------------------------------------------------------------------
// Provider: Gemini
// ---------------------------------------------------------------------------
async function tryGemini(prompt) {
    let lastError = null;
    for (const modelName of GEMINI_MODELS) {
        try {
            const model  = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text   = result.response.text().trim();
            if (text && text.length > 0) {
                console.log(`[Inquilino] Served by ${modelName}`);
                return text;
            }
        } catch (err) {
            console.warn(`[Inquilino] ${modelName} failed: ${err.message?.substring(0, 120)}`);
            lastError = err;
        }
    }
    throw lastError || new Error("All Gemini models returned empty responses");
}

// ---------------------------------------------------------------------------
// Provider: Groq
// Groq runs open-source models on dedicated hardware — models are always
// warm and typically respond in under 500ms even on the free tier.
// ---------------------------------------------------------------------------
async function tryGroq(prompt) {
    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY not configured in .env");
    }

    let lastError = null;
    for (const { id, maxTokens } of GROQ_MODELS) {
        try {
            const completion = await groq.chat.completions.create({
                model:       id,
                messages:    [{ role: "user", content: prompt }],
                max_tokens:  maxTokens,
                temperature: 0.7
            });

            const text = completion?.choices?.[0]?.message?.content?.trim();
            if (text && text.length > 0) {
                console.log(`[Inquilino] Served by Groq / ${id}`);
                return text;
            }
        } catch (err) {
            console.warn(`[Inquilino] Groq ${id} failed: ${err.message?.substring(0, 120)}`);
            lastError = err;
        }
    }
    throw lastError || new Error("All Groq models returned empty responses");
}

// ---------------------------------------------------------------------------
// Full provider chain
// ---------------------------------------------------------------------------
async function generateWithFallback(prompt) {
    try {
        return await tryGemini(prompt);
    } catch (geminiError) {
        console.warn("[Inquilino] All Gemini models exhausted, trying Groq");
    }

    try {
        return await tryGroq(prompt);
    } catch (groqError) {
        console.error("[Inquilino] All providers exhausted:", groqError.message);
        throw groqError;
    }
}

// ---------------------------------------------------------------------------
// Firestore busy message — final safety net
// ---------------------------------------------------------------------------
async function writeBusyMessage(chatRoomId, renterId) {
    const text =
        "Inquilino is a little busy right now. Please try again in a moment, or tap \"Talk to Owner\" to speak directly with them.";
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("chatRooms").doc(chatRoomId)
        .collection("messages").add({
            chatRoomId,
            senderId:   "INQUILINO",
            text,
            timestamp:  now,
            senderType: "AI"
        });

    if (renterId) {
        await db.collection("chatRooms").doc(chatRoomId).update({
            lastMessage:          `Inquilino: ${text}`,
            lastMessageTimestamp: now,
            [`unreadCount.${renterId}`]: admin.firestore.FieldValue.increment(1)
        });
    }

    return text;
}

// ---------------------------------------------------------------------------
// Enhanced context — owner profile + other active listings by same owner
// ---------------------------------------------------------------------------
async function buildEnhancedContext(ownerId, currentListingId) {
    let ownerContext   = "";
    let faqContext     = "";
    let similarContext = "";

    // Owner profile
    try {
        const ownerDoc = await db.collection("users").doc(ownerId).get();
        if (ownerDoc.exists) {
            const o = ownerDoc.data();
            ownerContext =
                `Owner: ${o.displayName || "Unknown"} | ` +
                `Type: ${o.userType || "Individual"} | ` +
                `Rating: ${o.rating || "N/A"} (${o.totalRatings || 0} ratings)`;
        }
    } catch (e) {
        console.warn("[Inquilino] Could not fetch owner profile:", e.message);
    }

    // Owner FAQs — users/{ownerId}/faqs subcollection, each doc has { question, answer }
    try {
        const faqSnap = await db
            .collection("users")
            .doc(ownerId)
            .collection("faqs")
            .get();

        if (!faqSnap.empty) {
            const faqLines = faqSnap.docs
                .map((doc, i) => {
                    const f = doc.data();
                    const q = (f.question || "").trim();
                    const a = (f.answer   || "").trim();
                    if (!q || !a) return null;
                    return `${i + 1}. Q: ${q}\n   A: ${a}`;
                })
                .filter(Boolean);

            if (faqLines.length > 0) {
                faqContext = "Owner FAQs:\n" + faqLines.join("\n");
            }
        }
    } catch (e) {
        console.warn("[Inquilino] Could not fetch owner FAQs:", e.message);
    }

    // Other active listings by the same owner
    try {
        const snap = await db.collection("listings")
            .where("ownerId", "==", ownerId)
            .where("status",  "==", "active")
            .limit(6)
            .get();

        const similar = snap.docs
            .filter(d => d.id !== currentListingId)
            .slice(0, 5)
            .map(d => {
                const l = d.data();
                return `- ${l.productName} (${l.category}) ` +
                       `₱${l.price}/${l.priceUnit || "day"}: ` +
                       `${(l.description || "").substring(0, 80)}`;
            });

        if (similar.length > 0) {
            similarContext = "Other listings by this owner:\n" + similar.join("\n");
        }
    } catch (e) {
        console.warn("[Inquilino] Could not fetch similar listings:", e.message);
    }

    return { ownerContext, faqContext, similarContext };
}

// ---------------------------------------------------------------------------
// Shared system prompt builder
// ---------------------------------------------------------------------------
function buildSystemPrompt(listingTitle, listingCategory, listingLocation,
                           listingPrice, listingDescription, ownerFaq,
                           ownerContext, faqContext, similarContext) {
    return [
        "You are Inquilino, a friendly AI rental assistant for RentBnB.",
        "",
        "Current Listing:",
        `- Title: ${listingTitle}`,
        `- Category: ${listingCategory}`,
        `- Location: ${listingLocation}`,
        `- Price: ₱${listingPrice}`,
        `- Description: ${listingDescription}`,
        ownerContext   ? `\n${ownerContext}`   : "",
        faqContext     ? `\n${faqContext}`     : "",
        similarContext ? `\n${similarContext}` : ""
    ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Opening message
// ---------------------------------------------------------------------------
exports.generateOpeningMessage = async (req, res) => {
    const {
        chatRoomId, renterId, ownerId, listingId,
        listingTitle, listingCategory, listingLocation,
        listingPrice, listingDescription, ownerFaq
    } = req.body;

    if (!chatRoomId || !renterId) {
        return res.status(400).json({ success: false, error: "chatRoomId and renterId are required." });
    }

    try {
        const { ownerContext, faqContext, similarContext } =
            await buildEnhancedContext(ownerId || "", listingId || "");

        const systemPrompt = buildSystemPrompt(
            listingTitle, listingCategory, listingLocation,
            listingPrice, listingDescription, ownerFaq,
            ownerContext, faqContext, similarContext
        );

        const prompt =
            systemPrompt +
            "\n\nTask: Write a warm, friendly opening message (max 3 sentences). " +
            "Greet the renter, briefly summarise what this listing offers, " +
            "and invite them to ask questions. Mention the listing title naturally. " +
            "If the owner has provided FAQs, you may weave a key point into the greeting naturally. " +
            "No bullet points or markdown.";

        const text = await generateWithFallback(prompt);
        const now  = admin.firestore.FieldValue.serverTimestamp();

        await db.collection("chatRooms").doc(chatRoomId)
            .collection("messages").add({
                chatRoomId,
                senderId:   "INQUILINO",
                text,
                timestamp:  now,
                senderType: "AI"
            });

        await db.collection("chatRooms").doc(chatRoomId).update({
            lastMessage:          `Inquilino: ${text}`,
            lastMessageTimestamp: now,
            [`unreadCount.${ownerId}`]: admin.firestore.FieldValue.increment(1)
        });

        res.status(200).json({ success: true, text });

    } catch (error) {
        console.error("[Inquilino] Opening — all providers failed:", error.message);
        try {
            const text = await writeBusyMessage(chatRoomId, renterId);
            res.status(200).json({ success: true, text, fallback: true });
        } catch (fbError) {
            res.status(500).json({ success: false, error: fbError.message });
        }
    }
};

// ---------------------------------------------------------------------------
// Reply
// ---------------------------------------------------------------------------
exports.generateReply = async (req, res) => {
    const {
        chatRoomId, renterId, ownerId, listingId,
        listingTitle, listingCategory, listingLocation,
        listingPrice, listingDescription, ownerFaq,
        history, question
    } = req.body;

    if (!chatRoomId || !question) {
        return res.status(400).json({ success: false, error: "chatRoomId and question are required." });
    }

    try {
        const { ownerContext, faqContext, similarContext } =
            await buildEnhancedContext(ownerId || "", listingId || "");

        const systemPrompt = buildSystemPrompt(
            listingTitle, listingCategory, listingLocation,
            listingPrice, listingDescription, ownerFaq,
            ownerContext, faqContext, similarContext
        );

        const historyText = Array.isArray(history) && history.length > 0
            ? history.slice(-10).join("\n")
            : "(no prior conversation)";

        const prompt =
            systemPrompt +
            "\n\nConversation so far:\n" + historyText +
            "\n\nRenter's question: " + question +
            "\n\nAnswer in 1-3 sentences based on the listing details above. " +
            "If the question is unrelated, politely redirect. " +
            "If unsure, suggest the renter contact the owner. " +
            "No bullet points or markdown.";

        const text = await generateWithFallback(prompt);
        const now  = admin.firestore.FieldValue.serverTimestamp();

        await db.collection("chatRooms").doc(chatRoomId)
            .collection("messages").add({
                chatRoomId,
                senderId:   "INQUILINO",
                text,
                timestamp:  now,
                senderType: "AI"
            });

        await db.collection("chatRooms").doc(chatRoomId).update({
            lastMessage:          `Inquilino: ${text}`,
            lastMessageTimestamp: now,
            [`unreadCount.${renterId}`]: admin.firestore.FieldValue.increment(1)
        });

        res.status(200).json({ success: true, text });

    } catch (error) {
        console.error("[Inquilino] Reply — all providers failed:", error.message);
        try {
            const text = await writeBusyMessage(chatRoomId, renterId);
            res.status(200).json({ success: true, text, fallback: true });
        } catch (fbError) {
            res.status(500).json({ success: false, error: fbError.message });
        }
    }
};