import { NextRequest } from "next/server";

const FRAMER_BASE = "https://bdfbrandefy.framer.website/";

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

  const ONE_WEEK = 604800;

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

    // Remove the Framer badge/watermark (hide via CSS since it's rendered client-side)
    html = html.replace(
      "</head>",
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
