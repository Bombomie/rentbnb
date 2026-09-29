/**
 * help_controller.js
 *
 * Powers the Help Center AI — a stateless, session-scoped chatbot that answers
 * questions about how RentBnb works. No Firestore writes. No chat rooms.
 * Uses the same provider chain as chat_controller.js:
 *   Gemini 1.5 Flash 8B → Gemini 1.5 Flash → Groq Llama → busy fallback
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq                   = require("groq-sdk");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });

const GEMINI_MODELS = ["gemini-1.5-flash-8b", "gemini-1.5-flash"];
const GROQ_MODELS   = [
    { id: "llama-3.1-8b-instant",    maxTokens: 300 },
    { id: "llama-3.3-70b-versatile", maxTokens: 300 }
];

// ---------------------------------------------------------------------------
// Provider chain (identical structure to chat_controller.js)
// ---------------------------------------------------------------------------

async function tryGemini(prompt) {
    let lastError = null;
    for (const modelName of GEMINI_MODELS) {
        try {
            const model  = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text   = result.response.text().trim();
            if (text && text.length > 0) {
                console.log(`[HelpCenter] Served by ${modelName}`);
                return text;
            }
        } catch (err) {
            console.warn(`[HelpCenter] ${modelName} failed: ${err.message?.substring(0, 100)}`);
            lastError = err;
        }
    }
    throw lastError || new Error("All Gemini models failed");
}

async function tryGroq(prompt) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
    let lastError = null;
    for (const { id, maxTokens } of GROQ_MODELS) {
        try {
            const completion = await groq.chat.completions.create({
                model:       id,
                messages:    [{ role: "user", content: prompt }],
                max_tokens:  maxTokens,
                temperature: 0.5
            });
            const text = completion?.choices?.[0]?.message?.content?.trim();
            if (text && text.length > 0) {
                console.log(`[HelpCenter] Served by Groq / ${id}`);
                return text;
            }
        } catch (err) {
            console.warn(`[HelpCenter] Groq ${id} failed: ${err.message?.substring(0, 100)}`);
            lastError = err;
        }
    }
    throw lastError || new Error("All Groq models failed");
}

async function generateWithFallback(prompt) {
    try { return await tryGemini(prompt); } catch (_) {}
    try { return await tryGroq(prompt); } catch (err) {
        throw err;
    }
}

// ---------------------------------------------------------------------------
// App knowledge base — injected into every prompt
// Update this section as the app evolves.
// ---------------------------------------------------------------------------

const APP_KNOWLEDGE = `
RentBnb is a peer-to-peer rental marketplace app for the Philippine Visayas region.
Renters can browse listings, book items, and chat with owners.
Owners can list their items, manage bookings, and track earnings.

KEY FEATURES AND HOW THEY WORK:

BOOKING PROCESS:
- Browse listings on the Home screen under "RENTALS".
- Tap a listing to view details, then tap "Rent Now".
- Select start and end dates using the calendar picker.
- Enter a contact number and select a payment method.
- Tap "Request Booking" to submit. The owner must approve before it becomes active.
- Booking statuses: PENDING_OWNER_APPROVAL → ACTIVE → RETURN_PENDING → COMPLETED.
  OVERDUE means the item was not returned by the end date.

LISTING AN ITEM (OWNER):
- Switch to Owner Mode from your profile using the "Switch to Owner" button.
- Go to Listings tab and tap the + button or the FAB (floating action button).
- Fill in 7 steps: type, info, images, penalty, activities, pricing, summary.
- Tap "List Product" on the summary screen to publish.
- You can pause a listing anytime from the Listings tab (three-dot menu on each card).
  Paused listings are hidden from renters but your current bookings continue.

PAYMENTS:
- Payment is held by the platform until the owner confirms the item has been returned.
- The owner confirms return from the Dashboard by tapping a rented-out card.
- If a penalty is defined on the listing, the owner can apply a penalty charge before completing.
- Penalty creates a separate charge for the renter.
- Supported payment methods: GCash, Maya, QRPH, Visa, Mastercard.
- Payout methods for owners: accessible from Profile → Payout Method.

CHAT:
- Each listing has an AI assistant called Inquilino that answers questions about the listing.
- You can switch from Inquilino to the human owner mid-conversation using the "Talk to Owner" button.
- Chat history is saved and accessible from the Inbox tab.

PROFILE & SETTINGS:
- Edit your name, phone, address, and other details from Profile → Profile Details.
- Push notifications can be toggled from Profile → Push Notifications.
- To change your profile picture, go to Profile Details and update your photo.
- Sign out is available at the bottom of the Profile screen.

NOTIFICATIONS:
- The bell icon on the Home screen shows unread notification count.
- You receive notifications for: new booking requests, booking accepted/declined,
  booking completed, penalty charges, and return reminders.

ISLANDS TAB:
- Shows islands near your current location (within 250 km).
- Tap an island card to explore it and see available rentals there.
- Heart icon saves an island to your favourites.

CANCELLATIONS AND REFUNDS:
- Renters can cancel a PENDING booking before it is accepted — status becomes CANCELLED.
- Refund policies are set by the owner. Contact the owner directly for refund disputes.

OVERDUE BOOKINGS:
- If an item is not returned by the end date, the booking becomes OVERDUE.
- A penalty fee may be charged based on the listing's agreed penalty rate (e.g., ₱200/day).
- Both renter and owner receive a push notification when a booking goes overdue.

ACCOUNT:
- You can sign in with Google or email/password.
- Google users use their Google profile photo automatically.
- Non-Google users can upload a photo from Profile Details.
`.trim();

// ---------------------------------------------------------------------------
// Help endpoint
// ---------------------------------------------------------------------------

exports.getHelpAnswer = async (req, res) => {
    const { question, history } = req.body;

    if (!question || question.trim().length === 0) {
        return res.status(400).json({ success: false, error: "question is required." });
    }

    // Keep last 8 turns to stay within token limits
    const historyText = Array.isArray(history) && history.length > 0
        ? history.slice(-8).join("\n")
        : "(start of conversation)";

    const prompt = `You are Inquilino, the friendly AI support assistant for RentBnb.
Your job is to answer questions about how the RentBnb app works.
Be concise, friendly, and helpful. Answer in 1-4 sentences maximum.
If the question is unrelated to the app, politely say you can only help with RentBnb questions.
Do not use bullet points or markdown.

APP KNOWLEDGE:
${APP_KNOWLEDGE}

Conversation so far:
${historyText}

User's question: ${question}

Answer:`;

    try {
        const answer = await generateWithFallback(prompt);
        res.status(200).json({ success: true, answer });
    } catch (error) {
        console.error("[HelpCenter] All providers failed:", error.message);
        res.status(200).json({
            success: true,
            answer: "I'm having a little trouble right now. Please try again in a moment!",
            fallback: true
        });
    }
};