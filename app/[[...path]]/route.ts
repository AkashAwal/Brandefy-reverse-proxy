import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

const FRAMER_BASE = "https://marvelous-osprey-690817.framer.app";

function loadAllowedPages(): Set<string> {
  try {
    const xml = readFileSync(join(process.cwd(), "public/sitemap.xml"), "utf-8");
    const pages = new Set<string>(["404"]);
    for (const match of xml.matchAll(/<loc>\s*https?:\/\/[^/]+\/?([^<\s]*)\s*<\/loc>/g)) {
      pages.add(match[1].trim());
    }
    return pages;
  } catch {
    return new Set(["", "videos", "simross", "amarainteriors", "metallicawindows",
      "belgee", "jairolia", "mars", "necesera", "maya",
      "atpatabytaste", "cpj-momo", "cpj-rabun", "mmtime",
      "jaiman", "contact", "portfolio", "404", "ameeco", "nje", "ekansha"]);
  }
}

const ALLOWED_PAGES = loadAllowedPages();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  const pathname = path ? path.join("/") : "";

  // Serve local public files directly — never proxy these to Framer
  const PUBLIC_FILES = new Set(["sitemap.xml", "robots.txt"]);
  if (PUBLIC_FILES.has(pathname)) {
    try {
      const content = readFileSync(join(process.cwd(), "public", pathname), "utf-8");
      const contentType = pathname.endsWith(".xml")
        ? "application/xml; charset=utf-8"
        : "text/plain; charset=utf-8";
      return new Response(content, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }

  // For page routes, only allow the defined pages
  // For asset routes (containing a dot like .js, .css, .png), always proxy
  const isAsset = path?.some((segment) => segment.includes("."));
  const isFramerInternal = path?.[0]?.startsWith("_");

  // For unknown page routes, fetch the Framer 404 page instead
  const isAllowedPage =
    isAsset || isFramerInternal || ALLOWED_PAGES.has(pathname);

  const targetUrl = isAllowedPage
    ? `${FRAMER_BASE}/${pathname}`
    : `${FRAMER_BASE}/404`;

  const ONE_WEEK = 1;

  // Handle range requests for video files (critical for Safari/iOS)
  const range = req.headers.get("range");
  const fetchHeaders: Record<string, string> = {
    "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
    Accept: req.headers.get("accept") || "*/*",
    "Accept-Encoding": "identity",
  };

  // Add range header if present (for video seeking)
  if (range) {
    fetchHeaders["Range"] = range;
  }

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      headers: fetchHeaders,
      next: { revalidate: ONE_WEEK },
    } as RequestInit & { next: { revalidate: number } });
  } catch {
    return new Response("Page temporarily unavailable. Please try again.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }

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

    // Fix Safari/iOS video compatibility issues
    // Add playsinline and muted attributes to video elements for iOS Safari
    html = html.replace(
      /<video([^>]*)>/gi,
      (match, attributes) => {
        // Add playsinline if not already present
        if (!attributes.includes('playsinline')) {
          attributes += ' playsinline';
        }
        // Add muted if autoplay is present (required for iOS Safari autoplay)
        if (attributes.includes('autoplay') && !attributes.includes('muted')) {
          attributes += ' muted';
        }
        return `<video${attributes}>`;
      }
    );

    return new Response(html, {
      status: isAllowedPage ? 200 : 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, s-maxage=${ONE_WEEK}, stale-while-revalidate=${ONE_WEEK}`,
      },
    });
  }

  // Non-HTML assets (JS, CSS, images, fonts, videos): pass through with aggressive caching
  const body = await res.arrayBuffer();

  // Safari/iOS video compatibility headers
  const videoHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": `public, s-maxage=${ONE_WEEK}, stale-while-revalidate=${ONE_WEEK}`,
    ...(res.headers.get("content-encoding") && {
      "Content-Encoding": res.headers.get("content-encoding")!,
    }),
  };

  // Add Safari/iOS specific headers for video files
  if (contentType.includes("video/")) {
    // Accept-Ranges is critical for Safari/iOS video playback
    videoHeaders["Accept-Ranges"] = "bytes";
    
    // Add content-length if available
    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      videoHeaders["Content-Length"] = contentLength;
    }
    
    // Add range support headers
    const acceptRanges = res.headers.get("accept-ranges");
    if (acceptRanges) {
      videoHeaders["Accept-Ranges"] = acceptRanges;
    }
    
    // Add content-range if this is a partial response
    const contentRange = res.headers.get("content-range");
    if (contentRange) {
      videoHeaders["Content-Range"] = contentRange;
    }
  }

  return new Response(body, {
    status: res.status,
    headers: videoHeaders,
  });
}
