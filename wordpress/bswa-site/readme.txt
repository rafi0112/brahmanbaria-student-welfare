=== BSWA Website ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

The BSWA website (ব্রাহ্মণবাড়িয়া জেলা ছাত্রকল্যাণ পরিষদ, জগন্নাথ বিশ্ববিদ্যালয়) as a WordPress plugin.

== কী করে ==

এই প্লাগইন চালু করলে ওয়ার্ডপ্রেস ডোমেইনের পুরো পাবলিক সাইট হয়ে যায় BSWA ওয়েবসাইট — হোম, শিক্ষার্থী, অ্যালামনাই,
কমিটি, ইভেন্ট, গ্যালারি, ঐতিহ্য, ব্লগ, অ্যাডমিন প্যানেল (/admin) সব। সব তথ্য আগের মতোই BSWA সার্ভার (Render) ও
Supabase থেকে আসে; তাই Cloudflare সাইট আর এই ওয়ার্ডপ্রেস সাইট একই তথ্য দেখায়। ওয়ার্ডপ্রেসের নিজের পোস্ট/পেজ
সাইটে দেখায় না; ওয়ার্ডপ্রেস ড্যাশবোর্ড (/wp-admin) আগের মতো থাকে।

== ইনস্টল ==

1. WordPress ড্যাশবোর্ড → Plugins → Add New → Upload Plugin → bswa-site.zip বেছে Install Now → Activate।
   হোস্ট “ফাইল খুব বড়” বললে bswa-site-lite.zip দিন (সাইটের নিজস্ব ছবিগুলো মূল সাইট থেকে আসে), অথবা
   হোস্টের File Manager দিয়ে bswa-site.zip ফাইলটি wp-content/plugins/ ফোল্ডারে আনজিপ করে Plugins থেকে Activate করুন।
2. Settings → Permalinks → “Post name” বেছে Save (একবার)।
3. Render → BSWA সার্ভার → Environment → CORS_ORIGIN-এ কমা দিয়ে ওয়ার্ডপ্রেস ঠিকানা যোগ করুন, যেমন:
   https://brahmanbaria-student-welfare.pages.dev,https://your-wordpress-domain.com
   তারপর Save → Manual Deploy।
4. Supabase → Authentication → URL Configuration → Redirect URLs-এ যোগ করুন: https://your-wordpress-domain.com/**

== শর্ত ==

* ওয়ার্ডপ্রেস ডোমেইনের মূলে থাকতে হবে (https://example.com/), কোনো ফোল্ডারে নয় (https://example.com/site/ নয়)।
* সাইটটি https-এ চালান।
* প্লাগইন বন্ধ (Deactivate) করলে ওয়ার্ডপ্রেস আগের মতো নিজের সাইট দেখায়; কোনো তথ্য মোছে না।

== নতুন সংস্করণ ==

ওয়েবসাইটের কোড বদলালে নতুন bswa-site.zip বানিয়ে আবার Upload Plugin দিন; ওয়ার্ডপ্রেস “Replace current with uploaded” জিজ্ঞেস করবে — হ্যাঁ দিন।
