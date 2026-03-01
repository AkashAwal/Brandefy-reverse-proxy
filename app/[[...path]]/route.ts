import { NextRequest } from "next/server";

const FRAMER_BASE = "https://marvelous-osprey-690817.framer.app/";

const ALLOWED_PAGES = new Set(["", "videos",
  "simross", "amarainteriors", "metallicawindows",
  "belgee", "jairolia", "mars", "necesera","maya",
  "atpatabytaste","cpj-momo","cpj-rabun","mmtime",
  "jaiman", "contact", "portfolio", "404"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  const pathname = path ? path.join("/") : "";

  // For page routes, only allow the defined pages
  // For asset routes (containing a dot like .js, .css, .png), always proxy
  const isAsset = path?.some((segment) => segment.includes("."));
  const isFramerInternal = path?.[0]?.startsWith("_");

  // For unknown page routes, fetch the Framer 404 page instead
  const isAllowedPage =
    isAsset || isFramerInternal || ALLOWED_PAGES.has(pathname);

  const targetUrl = isAllowedPage
    ? `${FRAMER_BASE}${pathname}`
    : `${FRAMER_BASE}404`;

  const ONE_WEEK = 3;

  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
      Accept: req.headers.get("accept") || "*/*",
      "Accept-Encoding": "identity",
    },
    next: { revalidate: ONE_WEEK },
  } as RequestInit & { next: { revalidate: number } });

  const contentType = res.headers.get("content-type") || "";

  // HTML responses: rewrite Framer URLs so assets resolve through our proxy
  if (contentType.includes("text/html")) {
    let html = await res.text();

    // Rewrite any absolute Framer references to relative paths
    html = html.replaceAll(FRAMER_BASE, "");

    // Overwrite title
    html = html.replace(/<title>[^<]*<\/title>/, `<title>BranDeFy - Best Creative Agency in India</title>`);

    const SEO_TITLE = "BranDeFy - Best Creative Agency in India";
    const SEO_DESC = "Brandefy crafts high-converting websites, powerful branding, and strategic marketing solutions to help businesses grow faster, stand out online, and turn visitors into loyal customers.";

    // Overwrite or inject meta description
    const metaDesc = `<meta name="description" content="${SEO_DESC}">`;
    if (html.includes(`name="description"`)) {
      html = html.replace(/<meta name="description"[^>]*>/i, metaDesc);
    } else {
      html = html.replace("</head>", `${metaDesc}</head>`);
    }

    // Overwrite or inject Open Graph tags (used by social embeds, link previews)
    const ogTags = [
      `<meta property="og:title" content="${SEO_TITLE}">`,
      `<meta property="og:description" content="${SEO_DESC}">`,
      `<meta name="twitter:title" content="${SEO_TITLE}">`,
      `<meta name="twitter:description" content="${SEO_DESC}">`,
    ];
    html = html.replace(/<meta property="og:title"[^>]*>/i, ogTags[0]);
    html = html.replace(/<meta property="og:description"[^>]*>/i, ogTags[1]);
    html = html.replace(/<meta name="twitter:title"[^>]*>/i, ogTags[2]);
    html = html.replace(/<meta name="twitter:description"[^>]*>/i, ogTags[3]);
    // Inject any that weren't already present
    const missingOg = ogTags.filter((tag) => !html.includes(tag));
    if (missingOg.length > 0) {
      html = html.replace("</head>", `${missingOg.join("")}</head>`);
    }

    // Lock title so Framer's client-side JS cannot overwrite it
    html = html.replace(
      "</head>",
      `<script>(function(){var t="BranDeFy - Best Creative Agency in India";document.title=t;Object.defineProperty(document,"title",{get:function(){return t;},set:function(){},configurable:false});})();</script>` +
      `<style>.__framer-badge { display: none !important; }</style></head>`
    );

    return new Response(html, {
      status: isAllowedPage ? 200 : 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, s-maxage=${ONE_WEEK}, stale-while-revalidate=${ONE_WEEK}`,
      },
    });
  }

  // Non-HTML assets (JS, CSS, images, fonts): pass through with aggressive caching
  const body = await res.arrayBuffer();

  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `public, s-maxage=${ONE_WEEK}, stale-while-revalidate=${ONE_WEEK}`,
      ...(res.headers.get("content-encoding") && {
        "Content-Encoding": res.headers.get("content-encoding")!,
      }),
    },
  });
}
