import { describe, expect, test } from "bun:test";
import { isBrowserSessionReopenedError } from "./browser-session-error.ts";
import { discoverExistingBrowserSession } from "./plannotator-browser.ts";

describe("Pi browser session recovery", () => {
	test("discovers an older unregistered Plannotator server through /api/plan", async () => {
		const session = await discoverExistingBrowserSession(19432, {
			fetchImpl: async () => new Response(JSON.stringify({
				mode: "annotate",
				filePath: "/workspace/notes/ideas.md",
				sourceInfo: "ideas.md",
				serverConfig: {},
			}), { status: 200, headers: { "content-type": "application/json" } }),
			registeredSessions: () => [],
			advertisedUrl: (port) => `http://devbox.example:${port}`,
		});

		expect(session).toEqual({
			url: "http://devbox.example:19432",
			port: 19432,
			mode: "annotate",
			label: "ideas.md",
			filePath: "/workspace/notes/ideas.md",
			project: undefined,
		});
	});

	test("prefers discoverable registry metadata after confirming server health", async () => {
		const session = await discoverExistingBrowserSession(19432, {
			fetchImpl: async () => new Response(JSON.stringify({
				mode: "annotate",
				filePath: "/workspace/source.pdf",
				serverConfig: {},
			}), { status: 200 }),
			registeredSessions: () => [{
				pid: process.pid,
				port: 19432,
				url: "http://registered:19432",
				mode: "annotate",
				project: "course",
				startedAt: new Date().toISOString(),
				label: "annotate-source.pdf",
			}],
			advertisedUrl: (port) => `http://devbox.example:${port}`,
		});

		expect(session?.label).toBe("annotate-source.pdf");
		expect(session?.project).toBe("course");
		// Reopening uses the current advertised host, not a potentially stale URL.
		expect(session?.url).toBe("http://devbox.example:19432");
	});

	test("infers plan review when the legacy plan payload omits mode", async () => {
		const session = await discoverExistingBrowserSession(19432, {
			fetchImpl: async () => new Response(JSON.stringify({
				plan: "# Proposed plan",
				serverConfig: {},
			}), { status: 200 }),
			registeredSessions: () => [],
			advertisedUrl: (port) => `http://devbox.example:${port}`,
		});
		expect(session?.mode).toBe("plan");
		expect(session?.label).toBe("plan");
	});

	test("discovers a code-review server through the /api/diff fallback", async () => {
		const requested: string[] = [];
		const session = await discoverExistingBrowserSession(19432, {
			fetchImpl: async (input) => {
				requested.push(String(input));
				if (String(input).endsWith("/api/plan")) return new Response("not found", { status: 404 });
				return new Response(JSON.stringify({ rawPatch: "diff --git a/a b/a", serverConfig: {} }), { status: 200 });
			},
			registeredSessions: () => [],
			advertisedUrl: (port) => `http://devbox.example:${port}`,
		});
		expect(requested.map((url) => new URL(url).pathname)).toEqual(["/api/plan", "/api/diff"]);
		expect(session?.mode).toBe("review");
		expect(session?.label).toBe("review");
	});

	test("does not treat an arbitrary JSON service as Plannotator", async () => {
		const session = await discoverExistingBrowserSession(19432, {
			fetchImpl: async () => new Response(JSON.stringify({ mode: "annotate" }), { status: 200 }),
			registeredSessions: () => [],
			advertisedUrl: (port) => `http://devbox.example:${port}`,
		});
		expect(session).toBeUndefined();
	});

	test("classifies preserved-session reopening separately from startup failures", () => {
		const error = new Error("Existing session reopened");
		error.name = "PlannotatorBrowserSessionReopened";
		expect(isBrowserSessionReopenedError(error)).toBe(true);
		expect(isBrowserSessionReopenedError(new Error("Port 19432 in use"))).toBe(false);
	});
});
