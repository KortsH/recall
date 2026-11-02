import { writeFile } from "node:fs/promises";
// Run only in the Pages release workflow. Never ship the CI token or private API data.
const token = process.env.GITHUB_TOKEN;
if (!token)
  throw new Error("The release-feed build requires a read-only CI token");
const response = await fetch(
  "https://api.github.com/repos/KortsH/recall/releases?per_page=10",
  {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    signal: AbortSignal.timeout(15000),
  },
);
if (!response.ok)
  throw new Error(`Public release metadata unavailable (${response.status})`);
const releases = await response.json();
if (!Array.isArray(releases)) throw new Error("Invalid release metadata");
const feed = releases
  .filter((r) => r.draft === false && r.published_at)
  .map((r) => ({
    tag_name: r.tag_name,
    draft: false,
    prerelease: !!r.prerelease,
    published_at: r.published_at,
    assets: (r.assets ?? [])
      .filter((a: any) =>
        ["Recall-Setup.exe", "Recall-Android.apk", "SHA256SUMS"].includes(
          a.name,
        ),
      )
      .map((a: any) => ({ name: a.name, state: a.state, size: a.size })),
  }));
await writeFile(
  process.argv[2] ?? "build/standalone/releases.json",
  JSON.stringify(feed) + "\n",
);
