/**
 * migrate_search_tags.js
 *
 * One-time script to generate searchTags for all existing listings that
 * do not have them yet. Run once from the backend directory:
 *
 *   node migrate_search_tags.js
 *
 * Requires GEMINI_API_KEY and GROQ_API_KEY in .env (or environment).
 * Safe to run multiple times — skips listings that already have searchTags.
 */

require('dotenv').config();
const admin = require('./config/firebase');
const { generateSearchTags } = require('./controllers/lens.controller');

const db = admin.firestore();

async function migrate() {
    console.log('[Migrate] Starting searchTags migration...');

    const snapshot = await db.collection('listings').get();
    const docs = snapshot.docs;

    console.log(`[Migrate] Found ${docs.length} listings total.`);

    let processed = 0;
    let skipped   = 0;
    let failed    = 0;

    for (const doc of docs) {
        const data = doc.data();

        // Skip listings that already have a non-empty searchTags array
        if (Array.isArray(data.searchTags) && data.searchTags.length > 0) {
            skipped++;
            continue;
        }

        try {
            await generateSearchTags(
                doc.id,
                data.productName  || '',
                data.category     || '',
                data.description  || ''
            );
            processed++;
            console.log(`[Migrate] ✓ ${doc.id} — "${data.productName}"`);

            // Pause 500ms between requests to avoid hitting AI rate limits
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            failed++;
            console.error(`[Migrate] ✗ ${doc.id} — ${err.message}`);
        }
    }

    console.log(`
[Migrate] Done.
  Processed : ${processed}
  Skipped   : ${skipped} (already had tags)
  Failed    : ${failed}
`);

    process.exit(0);
}

migrate().catch(err => {
    console.error('[Migrate] Fatal error:', err);
    process.exit(1);
});