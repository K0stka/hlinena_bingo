// Standalone script that will be injected into the page to modify its behavior

// helper: run immediately if document already loaded, otherwise on DOMContentLoaded
const runWhenReady = (fn) => {
	if (document.readyState && document.readyState !== "loading") {
		try {
			fn();
		} catch (e) {
			console.error("runWhenReady error:", e);
		}
	} else {
		document.addEventListener("DOMContentLoaded", () => {
			try {
				fn();
			} catch (e) {
				console.error("runWhenReady error:", e);
			}
		});
	}
};

// Add a small reset button to the page that clears user data and reloads.
const addResetButton = () => {
	// create button
	const btn = document.createElement("button");
	btn.id = "hlinena-reset-button";
	btn.type = "button";
	btn.innerHTML = `
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
			<path d="M21 3v5h-5"></path>
			<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
			<path d="M3 21v-5h5"></path>
		</svg>
		<span style="margin-left: 6px;">Reset</span>
	`;
	// Modern ShadCN-like styles
	Object.assign(btn.style, {
		position: "fixed",
		right: "16px",
		bottom: "16px",
		padding: "10px 14px",
		backgroundColor: "rgba(24, 24, 27, 0.95)",
		border: "1px solid rgba(63, 63, 70, 0.8)",
		borderRadius: "8px",
		cursor: "pointer",
		zIndex: 9999,
		boxShadow: "0 4px 24px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.15)",
		backdropFilter: "blur(12px)",
		fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		fontSize: "13px",
		fontWeight: "500",
		color: "#fafafa",
		display: "flex",
		alignItems: "center",
		transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
		transform: "translateY(0)",
		willChange: "transform, box-shadow, background-color",
	});

	btn.onclick = () => {
		// remove known localStorage keys used by the app
		try {
			localStorage.removeItem("checked");
			localStorage.removeItem("win");
		} catch (e) {
			// ignore
			console.error("Failed to clear localStorage during reset", e);
		}

		// remove cookie by setting it expired for path=/
		const cookieName = "hlinena_bingo_device_unique_seed";
		document.cookie = cookieName + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";

		// reload to re-run setup (which will create new seed and fresh state)
		location.reload();
	};

	// Add hover and active states
	btn.addEventListener("mouseenter", () => {
		btn.style.backgroundColor = "rgba(39, 39, 42, 0.98)";
		btn.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.25)";
		btn.style.transform = "translateY(-1px)";
		btn.style.borderColor = "rgba(82, 82, 91, 0.9)";
	});

	btn.addEventListener("mouseleave", () => {
		btn.style.backgroundColor = "rgba(24, 24, 27, 0.95)";
		btn.style.boxShadow = "0 4px 24px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.15)";
		btn.style.transform = "translateY(0)";
		btn.style.borderColor = "rgba(63, 63, 70, 0.8)";
	});

	btn.addEventListener("mousedown", () => {
		btn.style.transform = "translateY(0) scale(0.98)";
	});

	btn.addEventListener("mouseup", () => {
		btn.style.transform = "translateY(-1px) scale(1)";
	});

	runWhenReady(() => {
		// append to body if not already present
		if (!document.getElementById("hlinena-reset-button")) {
			document.body.appendChild(btn);
		}
	});
};

addResetButton();

// Utility: find a seed/board where the provided 4 words form a winning line.
// Usage (from console):
//   await window.findWinningBoardForWords(["word1","word2","word3","word4"], {maxAttempts:100000})
// Returns a result object with seed, board (first 16 squares), positions and winningLineIndices, or null if not found.
window.findWinningBoardForWords = async function (words, options = {}) {
	const maxAttempts = options.maxAttempts || 20000;
	const seedPrefix = options.seedPrefix || "hlinena-search-";
	const verbose = !!options.verbose;

	if (!Array.isArray(words) || words.length !== 4) {
		throw new Error("Please provide an array of exactly 4 words.");
	}

	// normalize words (compare trimmed)
	const targetWords = words.map((w) => (typeof w === "string" ? w.trim() : ""));

	// helper to retrieve the original dict from script.js source if available
	async function getBaseDict() {
		// if page has a global 'dict' that's still in original order we could use it, but script.js shuffles it on load.
		// try to fetch script.js and parse the literal array
		try {
			const resp = await fetch("script.js");
			const text = await resp.text();
			const match = text.match(/let\s+dict\s*=\s*(\[[\s\S]*?\]);/m);
			if (match && match[1]) {
				// evaluate the array literal safely in a Function scope
				// it's trusted code from the same origin; use Function to parse it into an array
				const arr = Function("'use strict'; return " + match[1])();
				if (Array.isArray(arr)) {
					return arr.map((s) => (typeof s === "string" ? s : String(s)));
				}
			}
		} catch (e) {
			// ignore and fallback
			if (verbose) console.error("Failed to fetch/parse script.js for dict:", e);
		}

		// fallback: if a global dict exists, use a shallow copy (may already be shuffled)
		if (window.dict && Array.isArray(window.dict)) {
			return [...window.dict];
		}

		throw new Error("Could not locate base dict. Ensure script.js is available or dict is exposed on window.");
	}

	const baseDict = await getBaseDict();

	// validate targets exist in baseDict
	for (const w of targetWords) {
		if (!baseDict.includes(w)) {
			throw new Error(`Word not found in dictionary: "${w}"`);
		}
	}

	// winning lines (0-based indices for 4x4 board)
	const winningLines = [];
	// rows
	for (let r = 0; r < 4; r++) winningLines.push([r * 4 + 0, r * 4 + 1, r * 4 + 2, r * 4 + 3]);
	// cols
	for (let c = 0; c < 4; c++) winningLines.push([0 * 4 + c, 1 * 4 + c, 2 * 4 + c, 3 * 4 + c]);
	// diagonals
	winningLines.push([0, 5, 10, 15]);
	winningLines.push([3, 6, 9, 12]);

	// simulate shuffle used in script.js
	function shuffledBoardForSeed(seed, dictArr) {
		const arr = [...dictArr];
		const random_gen = new Math.seedrandom(seed);
		for (let i = 0; i < arr.length; ++i) {
			const swap_index = Math.floor(random_gen.quick() * arr.length);
			const tmp = arr[swap_index];
			arr[swap_index] = arr[i];
			arr[i] = tmp;
		}
		return arr.slice(0, 16);
	}

	// Create a deterministic UUID-like string from an arbitrary input string.
	// This produces a string in the same format as crypto.randomUUID() but deterministically
	// derived from the provided seed string so we can reproduce shuffles.
	function uuidFromSeedString(input) {
		const rnd = new Math.seedrandom(input);
		const bytes = new Array(16);
		for (let i = 0; i < 16; i++) {
			bytes[i] = Math.floor(rnd.quick() * 256);
		}
		// set UUID version to 4
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		// set UUID variant to RFC 4122
		bytes[8] = (bytes[8] & 0x3f) | 0x80;
		const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
		return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(
			20,
			12
		)}`;
	}

	// helper to check if positions of target words form a winning line
	function isWinningBoard(board16, targets) {
		const positions = targets.map((t) => board16.indexOf(t));
		if (positions.some((p) => p === -1)) return null;
		const posSet = new Set(positions);
		for (const line of winningLines) {
			const match = line.every((idx) => posSet.has(idx));
			if (match) return { positions, winningLine: line };
		}
		return null;
	}

	// search (generate deterministic UUID-like seeds so resulting cookie looks like app's UUIDs)
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const rawSeed = seedPrefix + attempt;
		const seed = uuidFromSeedString(rawSeed);
		const board16 = shuffledBoardForSeed(seed, baseDict);
		const winCheck = isWinningBoard(board16, targetWords);
		if (winCheck) {
			if (verbose) console.info(`Found seed after ${attempt + 1} attempts:`, seed);
			return {
				seed,
				attempts: attempt + 1,
				board: board16,
				positions: winCheck.positions,
				winningLineIndices: winCheck.winningLine,
				apply: function () {
					// helper to set cookie used by app and reload
					const midnight = new Date();
					midnight.setHours(23, 59, 59, 999);
					const expires = "; expires=" + midnight.toGMTString();
					document.cookie = "hlinena_bingo_device_unique_seed=" + seed + expires + "; path=/";

					// set checked to mark the winning line so check_win triggers on reload
					try {
						// Always clear the board first so any previously-checked words are reset
						let checkedArr = Array(16).fill(false);
						// mark the winning indices true
						for (const idx of winCheck.winningLine) checkedArr[idx] = true;
						localStorage.setItem("checked", JSON.stringify(checkedArr));
						// ensure win flag is false so the page runs its normal detection
						localStorage.setItem("win", JSON.stringify(false));
						// remember last applied seed (useful for debug / copy-to-clipboard)
						localStorage.setItem("hlinena_last_applied_seed", seed);
					} catch (e) {
						if (verbose) console.error("Failed to set localStorage:", e);
					}

					// small delay to ensure storage/cookie flush before reload
					setTimeout(() => location.reload(), 80);
				},
			};
		}
	}

	return null;
};

// --- UI: small search panel to use findWinningBoardForWords from the page ---
const createSearchUI = () => {
	const id = "hlinena-search-panel";
	if (document.getElementById(id)) return;

	const panel = document.createElement("div");
	// ensure panel has an id so lookups using document.getElementById work
	panel.id = id;
	panel.id = id;
	// inject a small shadcn-like stylesheet for the panel
	const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    .hlinena-panel { 
      position: fixed; 
      left: 16px; 
      bottom: 16px; 
      width: 320px; 
      padding: 16px; 
      background: rgba(9, 9, 11, 0.95); 
      border: 1px solid rgba(39, 39, 42, 0.8); 
      border-radius: 12px; 
      z-index: 9999; 
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 10px 25px -5px rgba(0, 0, 0, 0.25); 
      font-size: 13px; 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      color: #fafafa; 
      backdrop-filter: blur(16px); 
      animation: slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: bottom left;
    }
    
    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    .hlinena-header { 
      display: flex; 
      align-items: center; 
      justify-content: space-between; 
      margin-bottom: 16px; 
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(39, 39, 42, 0.6);
    }
    
    .hlinena-title { 
      font-weight: 600; 
      font-size: 15px; 
      color: #fafafa;
      letter-spacing: -0.025em;
    }
    
    .hlinena-close { 
      background: transparent; 
      border: 0; 
      color: #a1a1aa; 
      cursor: pointer; 
      font-size: 14px;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    
    .hlinena-close:hover {
      background: rgba(39, 39, 42, 0.8);
      color: #fafafa;
    }
    
    .hlinena-grid { 
      display: grid; 
      grid-template-columns: repeat(2, 1fr); 
      gap: 8px; 
      margin-bottom: 12px 
    }
    
    .hlinena-select { 
      width: 100%; 
      padding: 12px 14px; 
      border-radius: 10px; 
      border: 1px solid rgba(209, 213, 219, 0.8); 
      background: rgba(255, 255, 255, 0.9); 
      font-size: 14px;
      font-family: inherit;
      transition: all 0.15s ease;
      appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 16px;
      padding-right: 40px;
    }
    
    .hlinena-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    .hlinena-row { 
      display: flex; 
      gap: 8px; 
      align-items: center; 
      margin-bottom: 12px;
      padding: 8px 12px;
      background: rgba(24, 24, 27, 0.6);
      border-radius: 8px;
      border: 1px solid rgba(39, 39, 42, 0.6);
    }
    
    .hlinena-input { 
      width: 100px; 
      margin-left: auto; 
      padding: 6px 10px; 
      border-radius: 6px; 
      border: 1px solid rgba(63, 63, 70, 0.8); 
      background: rgba(24, 24, 27, 0.8);
      font-size: 13px;
      font-family: inherit;
      transition: all 0.15s ease;
      color: #fafafa;
    }
    
    .hlinena-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
      background: rgba(24, 24, 27, 0.95);
    }
    
    .hlinena-input-label {
      font-size: 12px;
      color: #a1a1aa;
      font-weight: 500;
    }
    
    .hlinena-actions { 
      display: flex; 
      gap: 6px 
    }
    
    .btn { 
      padding: 8px 14px; 
      border-radius: 6px; 
      border: 0; 
      cursor: pointer; 
      font-weight: 500;
      font-size: 13px;
      font-family: inherit;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    
    .btn:before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
      transition: left 0.5s;
    }
    
    .btn:hover:before {
      left: 100%;
    }
    
    .btn-primary { 
      flex: 1; 
      background: linear-gradient(135deg, #2563eb, #1d4ed8); 
      color: #ffffff; 
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4), 0 2px 4px rgba(37, 99, 235, 0.2);
    }
    
    .btn-primary:hover {
      background: linear-gradient(135deg, #1d4ed8, #1e40af);
      box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5), 0 4px 8px rgba(37, 99, 235, 0.3);
      transform: translateY(-1px);
    }
    
    .btn-secondary { 
      background: rgba(39, 39, 42, 0.8); 
      border: 1px solid rgba(63, 63, 70, 0.8); 
      color: #fafafa;
    }
    
    .btn-secondary:hover {
      background: rgba(63, 63, 70, 0.9);
      border-color: rgba(82, 82, 91, 0.9);
    }
    
    .btn-ghost { 
      background: transparent; 
      color: #a1a1aa; 
      border: 0 
    }
    
    .btn-ghost:hover {
      background: rgba(39, 39, 42, 0.6);
      color: #fafafa;
    }
    
    .btn-success { 
      background: linear-gradient(135deg, #059669, #047857); 
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4), 0 2px 4px rgba(5, 150, 105, 0.2);
    }
    
    .btn-success:hover {
      background: linear-gradient(135deg, #047857, #065f46);
      box-shadow: 0 6px 20px rgba(5, 150, 105, 0.5), 0 4px 8px rgba(5, 150, 105, 0.3);
      transform: translateY(-1px);
    }
    
    .btn[disabled], .btn.disabled { 
      opacity: 0.5; 
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
    }
    
    .btn[disabled]:before, .btn.disabled:before {
      display: none;
    }
    
    #hlinena-search-status { 
      margin-top: 12px; 
      font-size: 13px; 
      color: #a1a1aa;
      padding: 8px 12px;
      border-radius: 6px;
      background: rgba(24, 24, 27, 0.6);
      border: 1px solid rgba(39, 39, 42, 0.6);
      min-height: 16px;
    }
    
    .hlinena-preview { 
      display: grid; 
      grid-template-columns: repeat(4, 1fr); 
      gap: 4px; 
      margin-top: 12px;
      padding: 12px;
      background: rgba(24, 24, 27, 0.6);
      border-radius: 8px;
      border: 1px solid rgba(39, 39, 42, 0.6);
    }
    
    .hlinena-preview > div { 
      padding: 8px 4px; 
      font-size: 11px; 
      border-radius: 4px; 
      border: 1px solid rgba(63, 63, 70, 0.6); 
      background: rgba(39, 39, 42, 0.8); 
      min-height: 32px; 
      display: flex; 
      align-items: center; 
      justify-content: center;
      transition: all 0.2s ease;
      animation: fadeInScale 0.3s ease forwards;
      opacity: 0;
      transform: scale(0.9);
      color: #d4d4d8;
      text-align: center;
      line-height: 1.2;
    }
    
    @keyframes fadeInScale {
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    .hlinena-preview > div:nth-child(1) { animation-delay: 0.05s; }
    .hlinena-preview > div:nth-child(2) { animation-delay: 0.1s; }
    .hlinena-preview > div:nth-child(3) { animation-delay: 0.15s; }
    .hlinena-preview > div:nth-child(4) { animation-delay: 0.2s; }
    .hlinena-preview > div:nth-child(5) { animation-delay: 0.25s; }
    .hlinena-preview > div:nth-child(6) { animation-delay: 0.3s; }
    .hlinena-preview > div:nth-child(7) { animation-delay: 0.35s; }
    .hlinena-preview > div:nth-child(8) { animation-delay: 0.4s; }
    .hlinena-preview > div:nth-child(9) { animation-delay: 0.45s; }
    .hlinena-preview > div:nth-child(10) { animation-delay: 0.5s; }
    .hlinena-preview > div:nth-child(11) { animation-delay: 0.55s; }
    .hlinena-preview > div:nth-child(12) { animation-delay: 0.6s; }
    .hlinena-preview > div:nth-child(13) { animation-delay: 0.65s; }
    .hlinena-preview > div:nth-child(14) { animation-delay: 0.7s; }
    .hlinena-preview > div:nth-child(15) { animation-delay: 0.75s; }
    .hlinena-preview > div:nth-child(16) { animation-delay: 0.8s; }
    
    /* Custom Select Dropdown Styles */
		.custom-select {
			position: relative;
			display: inline-flex;
			width: auto;
		}

		.custom-select-trigger {
			padding: 8px 12px;
			border-radius: 6px;
			border: 1px solid rgba(63, 63, 70, 0.8);
			background: rgba(24, 24, 27, 0.8);
			font-size: 13px;
			font-family: inherit;
			cursor: pointer;
			transition: all 0.15s ease;
			display: inline-flex;
			align-items: center;
			justify-content: space-between;
			min-height: 32px;
			position: relative;
			min-width: 120px;
		}
    
    .custom-select-trigger:hover {
      border-color: rgba(82, 82, 91, 0.9);
      background: rgba(39, 39, 42, 0.9);
    }
    
    .custom-select-trigger.active {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
      background: rgba(24, 24, 27, 0.95);
    }
    
    .custom-select-trigger.error {
      border-color: #ef4444;
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
      background: rgba(68, 10, 10, 0.6);
    }
    
    .custom-select-trigger.success {
      border-color: #059669;
      background: rgba(6, 78, 59, 0.6);
    }
    
    .custom-select-value {
      flex: 1;
      color: #fafafa;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .custom-select-value.placeholder {
      color: #71717a;
    }
    
    .custom-select-arrow {
      width: 14px;
      height: 14px;
      transition: transform 0.2s ease;
      color: #a1a1aa;
      flex-shrink: 0;
    }
    
    .custom-select-trigger.active .custom-select-arrow {
      transform: rotate(180deg);
      color: #3b82f6;
    }
    
			/* Fullscreen dialog styles for the select (shadcn-like) */
						.custom-select-dropdown {
							position: fixed;
							inset: 0;
							display: block;
							z-index: 12000;
							pointer-events: none;
							opacity: 0;
							transition: opacity 200ms ease;
						}

						/* full-bleed overlay */
						.custom-select-dropdown .dialog-overlay {
							position: fixed;
							inset: 0;
							background: linear-gradient(rgba(3,7,18,0.6), rgba(3,7,18,0.6));
							backdrop-filter: blur(6px) saturate(120%);
							-webkit-backdrop-filter: blur(6px) saturate(120%);
							pointer-events: auto;
						}

						/* full screen panel that mimics shadcn dialog: header, body, footer */
						.custom-select-dropdown .dialog-panel {
							position: fixed;
							inset: 0;
							display: flex;
							flex-direction: column;
							height: 100vh;
							width: 100vw;
							background: rgba(9, 10, 12, 0.96);
							color: #e6e6e9;
							pointer-events: auto;
							overflow: hidden;
						}

						.dialog-panel .dialog-header {
							display: flex;
							align-items: center;
							justify-content: space-between;
							padding: 16px 20px;
							border-bottom: 1px solid rgba(63,63,70,0.6);
							gap: 12px;
						}

						.dialog-panel .dialog-title {
							font-weight: 600;
							font-size: 16px;
							letter-spacing: -0.01em;
						}

						.dialog-panel .dialog-body {
							padding: 12px 18px;
							overflow: auto;
							flex: 1 1 auto;
							display: flex;
							flex-direction: column;
							gap: 12px;
						}

						.dialog-panel .dialog-search {
							padding: 6px 0;
						}

						.dialog-panel .dialog-options {
							display: grid;
							grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
							gap: 8px;
						}

						.dialog-panel .dialog-footer {
							padding: 12px 18px;
							border-top: 1px solid rgba(63,63,70,0.6);
							display: flex;
							justify-content: flex-end;
							gap: 8px;
						}

						.custom-select-dropdown.show {
							opacity: 1;
							pointer-events: all;
						}
    
    .custom-select-search {
      padding: 8px;
      border-bottom: 1px solid rgba(63, 63, 70, 0.6);
    }
    
    .custom-select-search input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid rgba(63, 63, 70, 0.8);
      border-radius: 4px;
      font-size: 12px;
      background: rgba(39, 39, 42, 0.8);
      transition: all 0.15s ease;
      color: #fafafa;
    }
    
    .custom-select-search input::placeholder {
      color: #71717a;
    }
    
    .custom-select-search input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
      background: rgba(39, 39, 42, 0.95);
    }
    
		.custom-select-options {
			overflow-y: auto;
			padding: 6px;
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 6px;
		}
    
    .custom-select-option {
      padding: 6px 8px;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s ease;
      font-size: 13px;
      color: #d4d4d8;
      position: relative;
    }
    
    .custom-select-option:hover {
      background: rgba(59, 130, 246, 0.15);
      color: #bfdbfe;
    }
    
    .custom-select-option.selected {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      font-weight: 500;
    }
    
    .custom-select-option.disabled {
      color: #52525b;
      cursor: not-allowed;
      background: rgba(39, 39, 42, 0.3);
    }
    
    .custom-select-option.disabled:hover {
      background: rgba(39, 39, 42, 0.3);
      color: #52525b;
    }
    
    .custom-select-option.highlighted {
      background: rgba(59, 130, 246, 0.2);
      color: #bfdbfe;
    }
    
    .custom-select-no-results {
      padding: 12px 8px;
      text-align: center;
      color: #71717a;
      font-size: 12px;
      font-style: italic;
    }
    
    .custom-select-validation-message {
      margin-top: 4px;
      font-size: 11px;
      color: #fca5a5;
      display: none;
      animation: fadeInShake 0.3s ease;
    }
    
    .custom-select-validation-message.show {
      display: block;
    }
    
    @keyframes fadeInShake {
      0% { opacity: 0; transform: translateX(-4px); }
      25% { transform: translateX(4px); }
      50% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    
`;

	const styleEl = document.createElement("style");
	styleEl.setAttribute("data-hlinena", "panel-styles");
	styleEl.textContent = css;
	(document.head || document.documentElement).appendChild(styleEl);

	// small helper styles for native select error state
	const extra = document.createElement("style");
	extra.setAttribute("data-hlinena-extra", "true");
	extra.textContent = `
.hlinena-select-error { border-color: #ef4444 !important; }
`;
	(document.head || document.documentElement).appendChild(extra);

	panel.className = "hlinena-panel";

	panel.innerHTML = `
		<div class="hlinena-header">
			<div class="hlinena-title">Bingo Board Search</div>
			<button id="hlinena-clear-btn-top" class="hlinena-close" title="Close">✕</button>
		</div>
		<div class="hlinena-grid">
			<div class="hlinena-word-container" data-index="0"></div>
			<div class="hlinena-word-container" data-index="1"></div>
			<div class="hlinena-word-container" data-index="2"></div>
			<div class="hlinena-word-container" data-index="3"></div>
		</div>
		<div class="hlinena-row">
			<label class="hlinena-input-label">Max attempts</label>
			<input id="hlinena-max-attempts" class="hlinena-input" type="number" value="20000" />
		</div>
		<div class="hlinena-actions">
			<button id="hlinena-search-btn" class="btn btn-primary">
				<span>Search</span>
			</button>
			<button id="hlinena-apply-btn" class="btn btn-success" disabled>Apply</button>
		</div>
		<div id="hlinena-search-status"></div>
		<div id="hlinena-search-result"></div>
	`;

	// Global arrays to manage native selects and validation
	let customSelects = [];
	let selectedValues = ["", "", "", ""];

	// Validation function to check for duplicates
	function validateSelection(value, index) {
		if (!value) return true; // Empty values are always valid

		// Check if this value is already selected in another dropdown
		for (let i = 0; i < selectedValues.length; i++) {
			if (i !== index && selectedValues[i] === value) {
				return false; // Duplicate found
			}
		}
		return true;
	}

	// Update all selects when a selection changes
	// For native <select>s we enable/disable options that are already chosen in other selects
	function updateAllSelects() {
		customSelects.forEach((sel, idx) => {
			Array.from(sel.options).forEach((opt) => {
				// keep placeholder (empty value) always enabled
				if (!opt.value) return;
				// disable option if selected in another select
				let disabled = false;
				for (let i = 0; i < selectedValues.length; i++) {
					if (i !== idx && selectedValues[i] === opt.value) {
						disabled = true;
						break;
					}
				}
				opt.disabled = disabled;
			});
		});
	}

	// Show validation messages for duplicate selections
	function showDuplicateValidation() {
		const duplicates = new Set();
		const seen = new Set();

		selectedValues.forEach((value) => {
			if (value && seen.has(value)) {
				duplicates.add(value);
			} else if (value) {
				seen.add(value);
			}
		});

		customSelects.forEach((sel, index) => {
			const value = selectedValues[index];
			if (value && duplicates.has(value)) {
				// mark native select with a red border and title
				sel.classList.add("hlinena-select-error");
				sel.style.borderColor = "#ef4444";
				sel.style.boxShadow = "0 0 0 3px rgba(239,68,68,0.08)";
				sel.title = "This word is already selected";
			} else {
				sel.classList.remove("hlinena-select-error");
				sel.style.borderColor = "";
				sel.style.boxShadow = "";
				sel.title = "";
			}
		});
	}

	async function createCustomSelects() {
		// attempt to get base dict (reuse same logic as findWinningBoardForWords)
		let wordsList = [];
		try {
			const resp = await fetch("script.js");
			const text = await resp.text();
			const match = text.match(/let\s+dict\s*=\s*(\[[\s\S]*?\]);/m);
			if (match && match[1]) {
				const arr = Function("'use strict'; return " + match[1])();
				if (Array.isArray(arr)) wordsList = arr.map((s) => (typeof s === "string" ? s : String(s)));
			}
		} catch (e) {
			// fallback
			if (window.dict && Array.isArray(window.dict)) wordsList = [...window.dict];
		}

		// if still empty, try window.dict
		if (!wordsList.length && window.dict && Array.isArray(window.dict)) wordsList = [...window.dict];

		// Create native <select> elements inside the word containers
		const containers = panel.querySelectorAll(".hlinena-word-container");
		containers.forEach((container, index) => {
			const sel = document.createElement("select");
			sel.className = "hlinena-select";
			sel.dataset.index = index;

			// placeholder option
			const placeholder = document.createElement("option");
			placeholder.value = "";
			placeholder.text = `-- select word ${index + 1} --`;
			placeholder.disabled = true;
			placeholder.selected = true;
			sel.appendChild(placeholder);

			wordsList.forEach((w) => {
				const opt = document.createElement("option");
				opt.value = w;
				opt.text = w;
				sel.appendChild(opt);
			});

			// initial value
			selectedValues[index] = "";

			sel.addEventListener("change", (e) => {
				const val = e.target.value;
				selectedValues[index] = val;
				updateAllSelects();
				showDuplicateValidation();
			});

			container.innerHTML = "";
			container.appendChild(sel);
			customSelects.push(sel);
		});

		// ensure options reflect current selections
		updateAllSelects();
	}

	runWhenReady(() => {
		if (!document.body) return;
		if (!document.getElementById(panel.id)) document.body.appendChild(panel);

		// Create custom selects instead of using native selects
		createCustomSelects()
			.then(() => {
				// Custom selects are now ready
			})
			.catch((e) => console.error("Failed to create custom selects:", e));

		const btn = document.getElementById("hlinena-search-btn");
		const clearTop = document.getElementById("hlinena-clear-btn-top");
		const applyBtn = document.getElementById("hlinena-apply-btn");
		const status = document.getElementById("hlinena-search-status");
		const resultDiv = document.getElementById("hlinena-search-result");

		let lastResult = null;

		// Clear button removed - no-op

		// top-close: remove panel from DOM with animation
		if (clearTop) {
			clearTop.onclick = () => {
				panel.style.animation = "slideOutDown 0.3s cubic-bezier(0.4, 0, 1, 1) forwards";

				const slideOutKeyframes = `
					@keyframes slideOutDown {
						to {
							opacity: 0;
							transform: translateY(20px) scale(0.95);
						}
					}
				`;
				if (!document.querySelector("style[data-slide-out]")) {
					const slideOutStyle = document.createElement("style");
					slideOutStyle.setAttribute("data-slide-out", "true");
					slideOutStyle.textContent = slideOutKeyframes;
					document.head.appendChild(slideOutStyle);
				}

				setTimeout(() => panel.remove(), 300);
			};
		}

		if (applyBtn) {
			applyBtn.onclick = () => {
				if (lastResult && typeof lastResult.apply === "function") {
					// Add success animation
					applyBtn.innerHTML = `
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="20,6 9,17 4,12"></polyline>
						</svg>
						<span style="margin-left: 8px;">Applied!</span>
					`;
					applyBtn.style.background = "linear-gradient(135deg, #059669, #047857)";
					applyBtn.style.animation = "none";
					applyBtn.disabled = true;

					// Apply the result after a short delay to show the success state
					setTimeout(() => {
						lastResult.apply();
					}, 800);
				}
			};
		}

		if (btn) {
			btn.onclick = async () => {
				// Get values from custom selects
				const words = selectedValues.filter(Boolean);

				// Check for duplicates
				const uniqueWords = new Set(words);
				if (words.length !== uniqueWords.size) {
					status.innerText = "Please ensure all selected words are different.";
					status.style.color = "#fca5a5";
					status.style.background = "rgba(68, 10, 10, 0.6)";
					status.style.borderColor = "rgba(127, 29, 29, 0.6)";
					showDuplicateValidation();
					return;
				}

				if (words.length !== 4) {
					status.innerText = "Please select all 4 words.";
					status.style.color = "#fca5a5";
					status.style.background = "rgba(68, 10, 10, 0.6)";
					status.style.borderColor = "rgba(127, 29, 29, 0.6)";
					return;
				}

				const maxAttempts = parseInt(document.getElementById("hlinena-max-attempts").value) || 20000;

				// Add loading state
				btn.disabled = true;
				btn.innerHTML = `
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
						<path d="M21 12a9 9 0 11-6.219-8.56"></path>
					</svg>
					<span style="margin-left: 8px;">Searching...</span>
				`;
				btn.style.background = "linear-gradient(135deg, #6b7280, #4b5563)";

				const spinKeyframes = `
					@keyframes spin {
						from { transform: rotate(0deg); }
						to { transform: rotate(360deg); }
					}
				`;
				if (!document.querySelector("style[data-spin]")) {
					const spinStyle = document.createElement("style");
					spinStyle.setAttribute("data-spin", "true");
					spinStyle.textContent = spinKeyframes;
					document.head.appendChild(spinStyle);
				}

				status.innerText = "Searching for winning combination...";
				status.style.color = "#6b7280";
				status.style.background = "rgba(249, 250, 251, 0.6)";
				status.style.borderColor = "rgba(229, 231, 235, 0.4)";
				if (applyBtn) applyBtn.disabled = true;
				resultDiv.innerHTML = "";
				lastResult = null;

				try {
					const res = await window.findWinningBoardForWords(words, { maxAttempts, verbose: false });

					// Reset button state
					btn.disabled = false;
					btn.innerHTML = `<span>Search</span>`;
					btn.style.background = "linear-gradient(135deg, #3b82f6, #1d4ed8)";

					if (!res) {
						status.innerText = `No winning combination found in ${maxAttempts} attempts.`;
						status.style.color = "#fca5a5";
						status.style.background = "rgba(68, 10, 10, 0.6)";
						status.style.borderColor = "rgba(127, 29, 29, 0.6)";
						return;
					}

					status.innerText = `✅ Found winning combination in ${res.attempts} attempts! (seed: ${res.seed})`;
					status.style.color = "#6ee7b7";
					status.style.background = "rgba(6, 78, 59, 0.6)";
					status.style.borderColor = "rgba(16, 185, 129, 0.4)";
					lastResult = res;
					if (applyBtn) {
						applyBtn.disabled = false;
						applyBtn.style.animation = "pulse 2s infinite";
					}

					// Pulse animation for apply button
					const pulseKeyframes = `
						@keyframes pulse {
							0%, 100% { transform: scale(1); }
							50% { transform: scale(1.05); }
						}
					`;
					if (!document.querySelector("style[data-pulse]")) {
						const pulseStyle = document.createElement("style");
						pulseStyle.setAttribute("data-pulse", "true");
						pulseStyle.textContent = pulseKeyframes;
						document.head.appendChild(pulseStyle);
					}

					// render a small 4x4 preview (uses injected styles)
					const board = res.board;
					const lineSet = new Set(res.winningLineIndices);
					const preview = document.createElement("div");
					preview.className = "hlinena-preview";

					board.forEach((txt, idx) => {
						const cell = document.createElement("div");
						cell.innerText = txt;
						if (lineSet.has(idx)) {
							cell.style.background = "linear-gradient(135deg, #065f46, #059669)";
							cell.style.borderColor = "#10b981";
							cell.style.color = "#d1fae5";
							cell.style.fontWeight = "600";
							cell.style.boxShadow = "0 2px 8px rgba(16, 185, 129, 0.4)";
						}
						preview.appendChild(cell);
					});

					resultDiv.innerHTML = "";
					resultDiv.appendChild(preview);
				} catch (e) {
					// Reset button state
					btn.disabled = false;
					btn.innerHTML = `<span>Search</span>`;
					btn.style.background = "linear-gradient(135deg, #3b82f6, #1d4ed8)";

					status.innerText = "Error: " + (e && e.message ? e.message : String(e));
					status.style.color = "#fca5a5";
					status.style.background = "rgba(68, 10, 10, 0.6)";
					status.style.borderColor = "rgba(127, 29, 29, 0.6)";
					console.error(e);
				}
			};
		}

		// Custom selects are now created in the runWhenReady function above
	});
};

createSearchUI();

// On load: if injector has set a checked array (or a last-applied seed), call the page's check_win
runWhenReady(() => {
	// Try to read a saved checked array and call the page's check_win when the board is ready.
	// We wait until all .square elements have non-empty text (or until timeout) to avoid racing with script.js.
	try {
		const raw = localStorage.getItem("checked");
		if (!raw) return;
		const checked = JSON.parse(raw);
		if (!Array.isArray(checked) || checked.length !== 16) return;

		if (typeof window.check_win !== "function") return;

		// wait until board is populated (or until timeout)
		const start = Date.now();
		const timeout = 3000; // ms

		const isBoardPopulated = () => {
			const squares = document.querySelectorAll(".square");
			if (!squares || squares.length < 16) return false;
			for (let i = 0; i < squares.length; i++) {
				const txt = squares[i].textContent || squares[i].innerText || "";
				if (!txt.trim()) return false;
			}
			return true;
		};

		const tryCall = () => {
			if (isBoardPopulated()) {
				try {
					window.check_win(checked);
				} catch (e) {
					console.error("injector: check_win threw:", e);
				}
				return;
			}
			if (Date.now() - start > timeout) {
				// give one last attempt even if board isn't fully populated
				try {
					window.check_win(checked);
				} catch (e) {
					console.error("injector: check_win threw on final attempt:", e);
				}
				return;
			}
			requestAnimationFrame(tryCall);
		};

		// start polling for board readiness
		tryCall();
	} catch (e) {
		console.error("injector: failed to parse checked array:", e);
	}
});
