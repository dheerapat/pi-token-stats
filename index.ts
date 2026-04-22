/**
 * Token Stats Extension
 *
 * Adds a /tokens command that shows token usage summary for every session
 * in the current project, including last interaction date and per-session averages.
 *
 * Philosophy: "For this session to finish/complete a task, how many tokens did I use?"
 */

import type { ExtensionAPI, SessionInfo } from "@mariozechner/pi-coding-agent";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { matchesKey } from "@mariozechner/pi-tui";

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
}

interface SessionAnalysis {
	stats: UsageStats;
	lastInteraction: Date | null;
}

interface SessionRow {
	info: SessionInfo;
	stats: UsageStats;
	lastInteraction: Date | null;
}

function emptyStats(): UsageStats {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 };
}

function addUsage(stats: UsageStats, usage: unknown): void {
	if (!usage || typeof usage !== "object") return;
	const u = usage as Record<string, unknown>;
	stats.input += typeof u.input === "number" ? u.input : 0;
	stats.output += typeof u.output === "number" ? u.output : 0;
	stats.cacheRead += typeof u.cacheRead === "number" ? u.cacheRead : 0;
	stats.cacheWrite += typeof u.cacheWrite === "number" ? u.cacheWrite : 0;
	stats.totalTokens += typeof u.totalTokens === "number" ? u.totalTokens : 0;
	if (u.cost && typeof (u.cost as any).total === "number") {
		stats.cost += (u.cost as any).total;
	}
}

async function analyzeSession(path: string): Promise<SessionAnalysis> {
	const stats = emptyStats();
	let lastInteraction: Date | null = null;

	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch {
		return { stats, lastInteraction };
	}

	for (const line of content.trim().split("\n")) {
		if (!line.trim()) continue;
		let entry: any;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}

		// Track latest timestamp across any entry type
		if (entry.timestamp) {
			const ts = new Date(entry.timestamp);
			if (!isNaN(ts.getTime()) && (!lastInteraction || ts > lastInteraction)) {
				lastInteraction = ts;
			}
		}

		// Accumulate token usage from assistant messages
		if (
			entry.type === "message" &&
			entry.message?.role === "assistant" &&
			entry.message?.usage
		) {
			addUsage(stats, entry.message.usage);
		}
	}
	return { stats, lastInteraction };
}

function fmtNum(n: number): string {
	return n.toLocaleString();
}

function fmtCost(n: number): string {
	if (n === 0) return "$0.00";
	if (n < 0.01) return `$${n.toFixed(4)}`;
	return `$${n.toFixed(2)}`;
}

function fmtDate(d: Date | null): string {
	if (!d) return "—";
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function sanitize(str: string): string {
	return str.replace(/\r?\n/g, " ").trim();
}

function trunc(str: string, len: number): string {
	if (str.length <= len) return str;
	return str.slice(0, len - 1) + "…";
}

function buildReport(rows: SessionRow[], total: UsageStats, avg: UsageStats): string {
	const lines: string[] = [];

	// Column widths
	const cName = 28;
	const cDate = 13;
	const cMsgs = 6;
	const cIn = 10;
	const cOut = 10;
	const cCache = 10;
	const cTot = 10;
	const cCost = 10;

	const sepLen = cName + cDate + cMsgs + cIn + cOut + cCache + cTot + cCost + 22;
	const sep = "─".repeat(sepLen);
	const sepThin = "─".repeat(sepLen);

	lines.push(`Token Usage Summary — ${rows.length} session${rows.length === 1 ? "" : "s"}`);
	lines.push("");
	lines.push(
		`${trunc("Session", cName).padEnd(cName)}  ${"Last Active".padStart(cDate)}  ${"Msgs".padStart(cMsgs)}  ${"Input".padStart(cIn)}  ${"Output".padStart(cOut)}  ${"Cache Rd".padStart(cCache)}  ${"Total".padStart(cTot)}  ${"Cost".padStart(cCost)}`,
	);
	lines.push(sep);

	for (const r of rows) {
		const rawName = sanitize(r.info.name || r.info.firstMessage || r.info.id.slice(0, 8));
		const name = trunc(rawName, cName);
		lines.push(
			`${name.padEnd(cName)}  ${fmtDate(r.lastInteraction).padStart(cDate)}  ${String(r.info.messageCount).padStart(cMsgs)}  ${fmtNum(r.stats.input).padStart(cIn)}  ${fmtNum(r.stats.output).padStart(cOut)}  ${fmtNum(r.stats.cacheRead).padStart(cCache)}  ${fmtNum(r.stats.totalTokens).padStart(cTot)}  ${fmtCost(r.stats.cost).padStart(cCost)}`,
		);
	}

	lines.push(sepThin);
	lines.push(
		`${"TOTAL".padEnd(cName)}  ${"".padStart(cDate)}  ${"".padStart(cMsgs)}  ${fmtNum(total.input).padStart(cIn)}  ${fmtNum(total.output).padStart(cOut)}  ${fmtNum(total.cacheRead).padStart(cCache)}  ${fmtNum(total.totalTokens).padStart(cTot)}  ${fmtCost(total.cost).padStart(cCost)}`,
	);
	lines.push(sepThin);
	lines.push(
		`${"AVG / SESSION".padEnd(cName)}  ${"".padStart(cDate)}  ${"".padStart(cMsgs)}  ${fmtNum(avg.input).padStart(cIn)}  ${fmtNum(avg.output).padStart(cOut)}  ${fmtNum(avg.cacheRead).padStart(cCache)}  ${fmtNum(avg.totalTokens).padStart(cTot)}  ${fmtCost(avg.cost).padStart(cCost)}`,
	);
	lines.push("");
	lines.push("Press Enter, Esc, or q to close");

	return lines.join("\n");
}

function computeAverages(total: UsageStats, count: number): UsageStats {
	if (count === 0) return emptyStats();
	return {
		input: Math.round(total.input / count),
		output: Math.round(total.output / count),
		cacheRead: Math.round(total.cacheRead / count),
		cacheWrite: Math.round(total.cacheWrite / count),
		totalTokens: Math.round(total.totalTokens / count),
		cost: total.cost / count,
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("tokens", {
		description: "Show token usage summary for all sessions in this project",
		handler: async (_args, ctx) => {
			let sessions: SessionInfo[];
			try {
				sessions = await SessionManager.list(ctx.cwd);
			} catch (err) {
				if (ctx.hasUI) ctx.ui.notify(`Failed to list sessions: ${err}`, "error");
				else console.error("Failed to list sessions:", err);
				return;
			}

			if (sessions.length === 0) {
				if (ctx.hasUI) ctx.ui.notify("No sessions found for this project.", "warning");
				else console.log("No sessions found for this project.");
				return;
			}

			const rows: SessionRow[] = [];
			const total = emptyStats();

			for (const info of sessions) {
				const analysis = await analyzeSession(info.path);
				rows.push({ info, stats: analysis.stats, lastInteraction: analysis.lastInteraction });
				total.input += analysis.stats.input;
				total.output += analysis.stats.output;
				total.cacheRead += analysis.stats.cacheRead;
				total.cacheWrite += analysis.stats.cacheWrite;
				total.totalTokens += analysis.stats.totalTokens;
				total.cost += analysis.stats.cost;
			}

			// Most recently active first
			rows.sort((a, b) => {
				const ta = a.lastInteraction?.getTime() ?? 0;
				const tb = b.lastInteraction?.getTime() ?? 0;
				return tb - ta;
			});

			const avg = computeAverages(total, rows.length);
			const report = buildReport(rows, total, avg);

			if (!ctx.hasUI) {
				console.log(report);
				return;
			}

			await ctx.ui.custom((_tui, _theme, _kb, done) => {
				return {
					render: (width: number) => {
						return report.split("\n").flatMap((line) => {
							if (line.length <= width) return [line];
							const chunks: string[] = [];
							for (let i = 0; i < line.length; i += width) {
								chunks.push(line.slice(i, i + width));
							}
							return chunks;
						});
					},
					invalidate: () => {},
					handleInput: (data: string) => {
						if (
							matchesKey(data, "enter") ||
							matchesKey(data, "escape") ||
							matchesKey(data, "q")
						) {
							done(undefined);
						}
					},
				};
			});
		},
	});
}
