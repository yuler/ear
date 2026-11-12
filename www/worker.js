/**
 * www/worker.js
 * Cloudflare Worker for Ear official website (ear.yuler.dev)
 *
 * Capabilities:
 * - Dynamic /download redirection based on User-Agent (Mac ARM64, Windows, Linux)
 * - Platform-specific download shortcuts: /download/mac, /download/windows, /download/linux
 * - /api/latest endpoint caching GitHub Releases metadata (5-minute TTL)
 * - Transparent static asset serving via env.ASSETS (www/public/)
 */

const REPO = "yuler/ear";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_TTL_SECONDS = 300;

let memoryCache = {
  data: null,
  expiresAt: 0,
};

async function fetchLatestRelease() {
  const now = Date.now();
  if (memoryCache.data && memoryCache.expiresAt > now) {
    return memoryCache.data;
  }

  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        "User-Agent": "ear-website-worker",
        "Accept": "application/vnd.github.v3+json",
      },
      cf: {
        cacheTtl: CACHE_TTL_SECONDS,
        cacheEverything: true,
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API returned status ${res.status}`);
    }

    const release = await res.json();
    const tag = release.tag_name || "v0.0.1";
    const version = tag.replace(/^v/, "");

    const assets = {
      mac: null,
      windows: null,
      linux: null,
    };

    if (Array.isArray(release.assets)) {
      for (const asset of release.assets) {
        const name = asset.name || "";
        const downloadUrl = asset.browser_download_url;
        if (/macos.*\.zip$/i.test(name) || /\.dmg$/i.test(name)) {
          assets.mac = downloadUrl;
        } else if (/windows.*\.zip$/i.test(name) || /\.exe$/i.test(name)) {
          assets.windows = downloadUrl;
        } else if (/linux.*\.tar\.gz$/i.test(name) || /\.AppImage$/i.test(name)) {
          assets.linux = downloadUrl;
        }
      }
    }

    // Fallbacks if assets are not yet parsed or released
    const fallbackBase = `https://github.com/${REPO}/releases/download/${tag}`;
    if (!assets.mac) assets.mac = `${fallbackBase}/Ear-${version}-macos-arm64.zip`;
    if (!assets.windows) assets.windows = `${fallbackBase}/Ear-${version}-windows-x64.zip`;
    if (!assets.linux) assets.linux = `${fallbackBase}/Ear-${version}-linux-x64.tar.gz`;

    const payload = {
      tag,
      version,
      name: release.name || `Ear ${tag}`,
      published_at: release.published_at || new Date().toISOString(),
      html_url: release.html_url || `https://github.com/${REPO}/releases/latest`,
      assets,
    };

    memoryCache = {
      data: payload,
      expiresAt: now + CACHE_TTL_SECONDS * 1000,
    };

    return payload;
  } catch (err) {
    console.error("Failed to fetch GitHub release:", err);
    // Graceful offline fallback
    const fallbackTag = "v0.0.1";
    const fallbackVersion = "0.0.1";
    const fallbackBase = `https://github.com/${REPO}/releases/download/${fallbackTag}`;
    return {
      tag: fallbackTag,
      version: fallbackVersion,
      name: `Ear ${fallbackTag}`,
      published_at: new Date().toISOString(),
      html_url: `https://github.com/${REPO}/releases/latest`,
      assets: {
        mac: `${fallbackBase}/Ear-${fallbackVersion}-macos-arm64.zip`,
        windows: `${fallbackBase}/Ear-${fallbackVersion}-windows-x64.zip`,
        linux: `${fallbackBase}/Ear-${fallbackVersion}-linux-x64.tar.gz`,
      },
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // 1. /api/latest
    if (path === "/api/latest") {
      const release = await fetchLatestRelease();
      return new Response(JSON.stringify(release, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // 2. Platform download routes
    if (path === "/download/mac" || path === "/download/macos") {
      const release = await fetchLatestRelease();
      return Response.redirect(release.assets.mac, 302);
    }

    if (path === "/download/windows" || path === "/download/win") {
      const release = await fetchLatestRelease();
      return Response.redirect(release.assets.windows, 302);
    }

    if (path === "/download/linux") {
      const release = await fetchLatestRelease();
      return Response.redirect(release.assets.linux, 302);
    }

    // 3. Smart User-Agent download route
    if (path === "/download") {
      const ua = request.headers.get("user-agent") || "";
      const release = await fetchLatestRelease();

      if (/Macintosh|Mac OS X/i.test(ua)) {
        return Response.redirect(release.assets.mac, 302);
      }
      if (/Windows/i.test(ua)) {
        return Response.redirect(release.assets.windows, 302);
      }
      if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
        return Response.redirect(release.assets.linux, 302);
      }

      // Default fallback to GitHub Releases page
      return Response.redirect(release.html_url, 302);
    }

    // 4. Fallback to static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
