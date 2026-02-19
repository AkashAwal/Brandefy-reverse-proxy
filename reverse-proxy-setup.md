Alright — let’s do this properly.
You want:

Next.js site → reverse proxy → Framer page → cached
So users never directly hit framer.website
We’ll build this cleanly.
🧠 Architecture
Visitor
   ↓
Cloudflare (optional)
   ↓
Next.js (Vercel)
   ↓
Fetch Framer HTML
   ↓
Return + Cache
User never sees Framer URL.
⚠️ Important Warning
This:
Still hits Framer at least once per cache cycle
Might break if Framer uses relative asset paths
Might break if Framer sets restrictive headers
Might violate ToS if abused
This works best for static content.
🚀 Step-by-Step Setup (Next.js App Router)
1️⃣ Create Route Handler
Create:
app/embed/route.ts
Add:
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const targetUrl = "https://yoursite.framer.website";

  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    next: { revalidate: 3600 }, // cache for 1 hour
  });

  const html = await res.text();

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
Now your proxied page lives at:
yourdomain.com/embed
2️⃣ Use It in iframe
<iframe src="/embed" width="100%" height="800"></iframe>
Now iframe loads your domain, not Framer.
🔥 Make It Cache Aggressively
If you want stronger caching:
Change:

next: { revalidate: 3600 }
To:
next: { revalidate: 86400 }
That means:
First request hits Framer
Then cached at Vercel edge for 24h
After that, background revalidation
⚡ If You Want ZERO Revalidation
Use:
next: { revalidate: false }
And:
"Cache-Control": "public, s-maxage=31536000, immutable"
But then you must redeploy to refresh.
⚠️ Problem You May Face
Framer pages often use:
/assets/xxx.js
Which are relative paths.
If HTML references:

/assets/xxx.js
It will try loading:
yourdomain.com/assets/xxx.js
Not Framer’s.
If that happens → we must rewrite asset URLs.

Tell me if you see broken styles or scripts after proxying.

💎 Optional: Full Dynamic Proxy (Safer for Assets)
Instead of hardcoding URL:
app/proxy/[...path]/route.ts
Then forward everything including assets.
If you want that version, say:

“Give me full dynamic proxy version”
🎯 Final Result
✔ Users hit your Next.js
✔ Framer URL hidden
✔ Cached at Vercel edge
✔ Reduced Framer bandwidth
✔ Cloudflare can also sit in front